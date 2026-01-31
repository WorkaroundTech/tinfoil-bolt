# Architecture

This document explains the internal architecture of tinfoil-bolt, including the middleware composition system, request lifecycle, error handling patterns, and key components.

## Table of Contents

- [System Overview](#system-overview)
- [Request Lifecycle](#request-lifecycle)
- [Middleware Composition](#middleware-composition)
- [Error Handling](#error-handling)
- [Path Resolution](#path-resolution)
- [Type System](#type-system)
- [Component Organization](#component-organization)

---

## System Overview

tinfoil-bolt is built as a composable HTTP server using a middleware chain pattern. The architecture is designed for:

- **Simplicity:** Zero external dependencies (uses only Bun runtime)
- **Performance:** Native file serving with sendfile syscall
- **Security:** Read-only file access, path traversal protection
- **Statelessness:** No persistent state beyond in-memory cache
- **Composability:** Middleware can be added/removed independently

### Key Principles

1. **Middleware-first design:** All request processing flows through a middleware chain
2. **Fail-fast validation:** Invalid requests are rejected early
3. **Single responsibility:** Each component has one clear purpose
4. **Type safety:** Comprehensive TypeScript types throughout

---

## Request Lifecycle

Every HTTP request flows through the following stages:

```
Incoming Request
     ↓
[1] Authorization Middleware (if auth configured)
     ↓
[2] Timing Middleware (start timer)
     ↓
[3] Logging Middleware (capture request details)
     ↓
[4] Router (dispatch to handler)
     ↓
[5] Method Validator (enforce allowed HTTP methods)
     ↓
[6] Handler (generate response)
     ↓
[7] Logging Middleware (log response with timing)
     ↓
[8] Error Handler (catch any errors)
     ↓
Response to Client
```

### Stage Details

#### 1. Authorization Middleware

**Location:** [src/middleware/authorize.ts](../src/middleware/authorize.ts)

**Purpose:** Validates HTTP Basic Authentication credentials

**Behavior:**
- Checks if `AUTH_USER` and `AUTH_PASS` are configured
- If not configured, passes through to next middleware
- If configured, parses `Authorization` header
- Compares credentials against configured values
- Throws `ServiceError(401)` on mismatch or missing header

**Context:** No modifications to `RequestContext`

#### 2. Timing Middleware

**Location:** [src/middleware/timing.ts](../src/middleware/timing.ts)

**Purpose:** Measures request processing duration

**Behavior:**
- Records `startTime` using `performance.now()`
- Stores in `context.timing.start`
- After response, calculates `duration` for logging

**Context Modifications:**
```typescript
context.timing = {
  start: performance.now()
}
```

#### 3. Logging Middleware

**Location:** [src/middleware/logging.ts](../src/middleware/logging.ts)

**Purpose:** Logs HTTP requests and responses

**Behavior:**
- Extracts request details (method, path, IP, user-agent)
- Passes request to next middleware
- After response, logs with selected format (Morgan-style)
- Includes timing information from timing middleware

**Context Modifications:**
```typescript
context.remoteAddress = getRemoteAddress(req)
context.userAgent = req.headers.get('user-agent') || '-'
```

**Remote Address Detection:**
- Checks `x-forwarded-for` header first (proxy support)
- Falls back to socket remote address
- Returns IP address string

#### 4. Router

**Location:** [src/routes/index.ts](../src/routes/index.ts)

**Purpose:** Dispatches requests to appropriate handlers based on URL pattern

**Route Mapping:**
```typescript
{
  '/': handlers.index,                    // Index/shop data
  '/tinfoil': handlers.index,             // Alternate index
  '/shop.json': handlers.shopJson,        // Shop JSON format
  '/shop.tfl': handlers.shopTfl,          // Shop TFL format
  '/files/:path': handlers.files,         // File downloads
  'default': handlers.default             // Health check
}
```

**Pattern Matching:**
- Exact matches for static routes
- Wildcard matching for `/files/*`
- Default handler for unmatched routes

#### 5. Method Validator

**Location:** [src/middleware/method-validator.ts](../src/middleware/method-validator.ts)

**Purpose:** Enforces allowed HTTP methods per endpoint

**Implementation:** Higher-order function that wraps handlers

```typescript
export const methodValidator = (
  handler: Handler,
  allowedMethods: string[] = ['GET', 'HEAD']
): Handler => {
  return async (req: Request, context: RequestContext) => {
    const method = req.method

    // Always allow OPTIONS for CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: { Allow: allowedMethods.join(', ') }
      })
    }

    // Check if method is allowed
    if (!allowedMethods.includes(method)) {
      throw new ServiceError(
        405,
        `Method ${method} not allowed`,
        { Allow: allowedMethods.join(', ') }
      )
    }

    // Method is allowed, call original handler
    return handler(req, context)
  }
}
```

**Allowed Methods by Endpoint:**
- `/`, `/tinfoil`, `/shop.json`, `/shop.tfl`, `/files/*`: `GET`, `HEAD`
- All endpoints support `OPTIONS` (CORS preflight)

#### 6. Handler

**Location:** [src/routes/handlers/*.ts](../src/routes/handlers/)

**Purpose:** Generates response for specific endpoint

**Handler Signature:**
```typescript
type Handler = (req: Request, context: RequestContext) => Promise<Response>
```

**Handler Responsibilities:**
- Parse request parameters
- Validate input
- Call services for business logic
- Generate HTTP response
- Throw `ServiceError` for error conditions

**Example: File Handler**
```typescript
export const files: Handler = async (req, context) => {
  const url = new URL(req.url)
  const virtualPath = url.pathname.replace('/files/', '')
  
  // Resolve virtual path to physical file
  const filePath = await resolveFilePath(virtualPath)
  
  if (!filePath) {
    throw new ServiceError(404, 'File not found')
  }
  
  // Handle range requests
  const range = req.headers.get('range')
  if (range) {
    return handleRangeRequest(filePath, range)
  }
  
  // Serve full file
  return new Response(Bun.file(filePath), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  })
}
```

#### 7. Response Logging

After handler completes, logging middleware logs the response:
- Status code
- Content-Length
- Response time (ms)
- All logged using configured format

#### 8. Error Handler

**Location:** [src/middleware/error-handler.ts](../src/middleware/error-handler.ts)

**Purpose:** Catches all errors and converts to JSON responses

**Behavior:**
- Wraps entire middleware chain in try-catch
- Catches `ServiceError` instances (known errors)
- Catches unexpected errors (500 responses)
- Logs all errors with stack traces
- Returns standardized JSON error response

---

## Middleware Composition

### Compose Function

**Location:** [src/middleware/compose.ts](../src/middleware/compose.ts)

**Purpose:** Chains multiple middleware functions into a single handler

**Implementation:**
```typescript
export const compose = (...middleware: Middleware[]): Handler => {
  return (req: Request, context: RequestContext) => {
    let index = 0

    const dispatch = async (): Promise<Response> => {
      if (index >= middleware.length) {
        throw new Error('No response generated')
      }

      const fn = middleware[index++]
      return fn(req, context, dispatch)
    }

    return dispatch()
  }
}
```

**Key Concepts:**
- Each middleware can call `next()` to proceed to the next middleware
- Middleware can modify `context` before calling `next()`
- Middleware can intercept response after `next()` returns
- Execution flows down, then back up (onion model)

### Middleware Order

Order matters! Current composition:

```typescript
const app = compose(
  errorHandler,      // Outer: catch all errors
  authorize,         // Early: fail fast on auth
  timing,            // Before: start timer
  logging,           // Before & after: log request/response
  router             // Inner: dispatch to handlers
)
```

**Why This Order:**
1. Error handler outermost to catch everything
2. Auth check early to avoid unnecessary processing
3. Timing before business logic
4. Logging wraps everything except error handler
5. Router innermost to dispatch actual work

---

## Error Handling

### ServiceError Pattern

**Location:** [src/middleware/error-handler.ts](../src/middleware/error-handler.ts)

**Purpose:** Structured error type with HTTP status and custom headers

**Definition:**
```typescript
export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers: Record<string, string> = {}
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}
```

**Usage in Handlers:**
```typescript
// 404 error
throw new ServiceError(404, 'File not found')

// 401 with WWW-Authenticate header
throw new ServiceError(401, 'Unauthorized', {
  'WWW-Authenticate': 'Basic realm="tinfoil-bolt"'
})

// 416 with Content-Range header
throw new ServiceError(416, 'Range not satisfiable', {
  'Content-Range': `bytes */${fileSize}`
})

// 405 with Allow header
throw new ServiceError(405, `Method ${method} not allowed`, {
  'Allow': 'GET, HEAD, OPTIONS'
})
```

**Error Handler Response:**
```typescript
export const errorHandler: Middleware = async (req, context, next) => {
  try {
    return await next()
  } catch (error) {
    if (error instanceof ServiceError) {
      // Known error with status code
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: error.status,
          headers: {
            'Content-Type': 'application/json',
            ...error.headers
          }
        }
      )
    }
    
    // Unknown error - return 500
    logger.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
```

---

## Path Resolution

### Virtual Path System

**Location:** [src/lib/paths.ts](../src/lib/paths.ts)

**Purpose:** Maps virtual URLs to physical file system paths with security

### Base Directory Aliasing

When multiple directories are configured, duplicate base names are aliased:

**Input:**
```
GAMES_DIRECTORY=/mnt/games,/media/games,/backup/games
```

**Alias Generation:**
```typescript
// buildBaseAliases result:
{
  "/mnt/games": "games",
  "/media/games": "games-2",
  "/backup/games": "games-3"
}
```

**Algorithm:**
1. Extract basename from each path
2. Track count of each basename
3. First occurrence: use basename as-is
4. Subsequent occurrences: append `-<count>`

### URL Encoding

**Function:** `encodeVirtualPath()`

**Purpose:** Converts physical paths to URL-safe virtual paths

**Implementation:**
```typescript
export const encodeVirtualPath = (basePath: string, filePath: string): string => {
  const relativePath = path.relative(basePath, filePath)
  const segments = relativePath.split(path.sep)
  const encoded = segments.map(encodeURIComponent).join('/')
  const alias = baseAliases.get(basePath) || path.basename(basePath)
  return `${alias}/${encoded}`
}
```

**Example:**
```
Physical: /mnt/games/Super Mario Odyssey.nsp
Alias: games
Virtual: games/Super%20Mario%20Odyssey.nsp
URL: http://localhost:3000/files/games/Super%20Mario%20Odyssey.nsp
```

### Path Security

**Function:** `resolveFilePath()`

**Security Checks:**
1. **Path traversal prevention:** Reject paths containing `..`
2. **Directory validation:** Ensure resolved path is within configured directories
3. **File existence:** Verify file exists and is readable
4. **Canonical path check:** Use `realpath` to resolve symlinks

**Implementation:**
```typescript
export const resolveFilePath = async (virtualPath: string): Promise<string | null> => {
  // Decode URL-encoded path
  const decoded = decodeURIComponent(virtualPath)
  
  // Block path traversal
  if (decoded.includes('..')) {
    return null
  }
  
  // Extract alias and relative path
  const [alias, ...segments] = decoded.split('/')
  const relativePath = segments.join('/')
  
  // Find base directory for alias
  const basePath = findBasePathForAlias(alias)
  if (!basePath) {
    return null
  }
  
  // Construct full path
  const fullPath = path.join(basePath, relativePath)
  
  // Verify file exists
  const file = Bun.file(fullPath)
  if (!await file.exists()) {
    return null
  }
  
  // Verify path is within allowed directory
  const realPath = await realpath(fullPath)
  const realBase = await realpath(basePath)
  if (!realPath.startsWith(realBase)) {
    return null
  }
  
  return realPath
}
```

---

## Type System

### Core Types

**Location:** [src/types/index.ts](../src/types/index.ts)

```typescript
// Request context passed through middleware chain
export interface RequestContext {
  timing?: {
    start: number
  }
  remoteAddress?: string
  userAgent?: string
}

// Middleware function signature
export type Middleware = (
  req: Request,
  context: RequestContext,
  next: () => Promise<Response>
) => Promise<Response>

// Handler function signature (no next function)
export type Handler = (
  req: Request,
  context: RequestContext
) => Promise<Response>

// Shop data structure
export interface ShopData {
  files: ShopFile[]
  directories: string[]
  success?: string
}

export interface ShopFile {
  url: string
  size: number
}

// Configuration
export interface Config {
  port: number
  gamesDirectories: string[]
  cacheTtl: number
  successMessage?: string
  logFormat: string
  auth?: {
    user: string
    pass: string
  }
}
```

### Request Context

`RequestContext` is passed through the entire middleware chain and is mutated by middleware:

1. **Timing middleware** adds `context.timing.start`
2. **Logging middleware** adds `context.remoteAddress` and `context.userAgent`
3. Handlers can read but typically don't modify context

This provides a clean way to pass request-scoped data without global state.

---

## Component Organization

### Directory Structure

```
src/
├── app.ts                 # Main app composition
├── main.ts                # Entry point (starts server)
├── index.html             # Browser UI template
├── config/
│   └── index.ts          # Configuration loading & validation
├── lib/
│   ├── auth.ts           # Auth credential parsing
│   ├── cache.ts          # In-memory cache with TTL
│   ├── logger.ts         # Morgan-style logging
│   ├── paths.ts          # Virtual path resolution
│   └── range.ts          # HTTP Range parsing
├── middleware/
│   ├── authorize.ts      # Auth middleware
│   ├── compose.ts        # Middleware composition
│   ├── error-handler.ts  # Error catching & formatting
│   ├── logging.ts        # Request/response logging
│   ├── method-validator.ts # HTTP method validation
│   └── timing.ts         # Performance timing
├── routes/
│   ├── index.ts          # Router implementation
│   ├── utils.ts          # Route utilities
│   └── handlers/
│       ├── index.ts      # Index/shop handlers
│       ├── files.ts      # File download handler
│       └── shop.ts       # Shop data generation
├── services/
│   └── shop.ts           # Business logic for shop data
└── types/
    └── index.ts          # TypeScript type definitions
```

### Separation of Concerns

**Layer** | **Responsibility** | **Example**
----------|-------------------|-------------
**main.ts** | Server startup | `Bun.serve({ fetch: app })`
**app.ts** | Middleware composition | `compose(errorHandler, auth, router)`
**middleware/** | Cross-cutting concerns | Auth, logging, timing, errors
**routes/** | Request routing | URL pattern matching
**handlers/** | Request/response logic | Parse request, generate response
**services/** | Business logic | Scan directories, build shop data
**lib/** | Utility functions | Path encoding, range parsing, caching
**config/** | Configuration | Load & validate environment variables
**types/** | Type definitions | Interfaces and type aliases

### Dependency Flow

```
main.ts
  ↓
app.ts
  ↓
middleware/* ← types/*
  ↓
routes/
  ↓
handlers/* ← services/* ← lib/* ← config/*
```

**Key Principle:** Lower layers don't depend on higher layers (no circular dependencies)

---

## Performance Considerations

### Zero-Copy File Serving

Bun's `Response(Bun.file(path))` uses the `sendfile` syscall:
- No buffer allocation in JavaScript
- Direct kernel-to-socket transfer
- Optimal performance for large files

### Caching Strategy

Shop data is cached in memory:
- TTL-based expiration (configurable)
- Invalidated on TTL expiry
- Set `CACHE_TTL=0` to disable caching

### Stateless Design

No persistent state between requests:
- Each request is independent
- No session management
- Easy to scale horizontally

---

## Extension Points

### Adding New Middleware

```typescript
// src/middleware/my-middleware.ts
export const myMiddleware: Middleware = async (req, context, next) => {
  // Before request processing
  console.log('Before:', req.url)
  
  // Call next middleware
  const response = await next()
  
  // After request processing
  console.log('After:', response.status)
  
  return response
}

// src/app.ts
const app = compose(
  errorHandler,
  myMiddleware,  // Add here
  authorize,
  timing,
  logging,
  router
)
```

### Adding New Routes

```typescript
// src/routes/handlers/my-handler.ts
export const myHandler: Handler = async (req, context) => {
  return new Response(JSON.stringify({ data: 'value' }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

// src/routes/index.ts
const routes = {
  '/my-route': methodValidator(myHandler, ['GET', 'POST']),
  // ... existing routes
}
```

### Adding New Services

```typescript
// src/services/my-service.ts
export class MyService {
  async doSomething(): Promise<Result> {
    // Business logic here
  }
}

// Use in handlers
import { myService } from '../services/my-service'

export const handler: Handler = async (req, context) => {
  const result = await myService.doSomething()
  return new Response(JSON.stringify(result))
}
```
