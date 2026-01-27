export type LogFormat = "tiny" | "short" | "dev" | "common" | "combined";

interface LogContext {
  method: string;
  path: string;
  status: number;
  contentLength?: number;
  responseTime: number;
  userAgent?: string;
  remoteAddr?: string;
  timestamp?: string;
  statusColor?: string;
}

function getStatusColor(status: number): string {
  if (status >= 500) return "\x1b[31m"; // red
  if (status >= 400) return "\x1b[33m"; // yellow
  if (status >= 300) return "\x1b[36m"; // cyan
  if (status >= 200) return "\x1b[32m"; // green
  return "\x1b[37m"; // white
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const RESET = "\x1b[0m";

function createTinyFormat(ctx: LogContext): string {
  return `${ctx.method} ${ctx.path} ${ctx.status} - ${formatTime(ctx.responseTime)}`;
}

function createShortFormat(ctx: LogContext): string {
  const contentLength = formatBytes(ctx.contentLength);
  return `${ctx.method} ${ctx.path} ${ctx.status} ${contentLength} - ${formatTime(ctx.responseTime)}`;
}

function createDevFormat(ctx: LogContext): string {
  const colorCode = getStatusColor(ctx.status);
  const resetCode = RESET;
  const contentLength = formatBytes(ctx.contentLength);
  return `${colorCode}${ctx.method} ${ctx.path} ${ctx.status}${resetCode} ${contentLength} - ${formatTime(ctx.responseTime)}`;
}

function createCommonFormat(ctx: LogContext): string {
  const timestamp = ctx.timestamp || new Date().toISOString();
  const remoteAddr = ctx.remoteAddr || "-";
  // Apache Common Log Format: 127.0.0.1 - - [21/Jul/2024 12:30:45 +0000] "GET / HTTP/1.1" 200 1234
  return `${remoteAddr} - - [${timestamp}] "${ctx.method} ${ctx.path} HTTP/1.1" ${ctx.status} ${ctx.contentLength || 0}`;
}

function createCombinedFormat(ctx: LogContext): string {
  const timestamp = ctx.timestamp || new Date().toISOString();
  const remoteAddr = ctx.remoteAddr || "-";
  const userAgent = ctx.userAgent || "-";
  // Apache Combined Log Format (adds Referer and User-Agent)
  return `${remoteAddr} - - [${timestamp}] "${ctx.method} ${ctx.path} HTTP/1.1" ${ctx.status} ${ctx.contentLength || 0} "-" "${userAgent}"`;
}

export function formatLog(format: LogFormat, ctx: LogContext): string {
  switch (format) {
    case "tiny":
      return createTinyFormat(ctx);
    case "short":
      return createShortFormat(ctx);
    case "dev":
      return createDevFormat(ctx);
    case "common":
      return createCommonFormat(ctx);
    case "combined":
      return createCombinedFormat(ctx);
    default:
      return createDevFormat(ctx);
  }
}

export function logRequest(
  format: LogFormat,
  method: string,
  path: string,
  status: number,
  responseTime: number,
  options?: {
    contentLength?: number;
    userAgent?: string;
    remoteAddr?: string;
  }
): void {
  const ctx: LogContext = {
    method,
    path,
    status,
    contentLength: options?.contentLength,
    responseTime,
    userAgent: options?.userAgent,
    remoteAddr: options?.remoteAddr,
    timestamp: new Date().toISOString(),
  };

  const logMessage = formatLog(format, ctx);
  console.log(logMessage);
}
