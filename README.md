# tinfoil-bolt

**tinfoil-bolt** is a lightning-fast, zero-dependency, and lightweight backend server to serve your personal game backup library to Tinfoil on Nintendo Switch.

Built with [Bun](https://bun.sh), it replaces bloated, unmaintainable alternatives with a single, transparent TypeScript file that does exactly what you need and nothing else.

## Why Bolt?

Many existing Tinfoil server solutions suffer from feature creep: auto-updaters that pose security risks, heavy polling mechanisms, required databases, or complex UIs.

**tinfoil-bolt is different:**

* **Zero Dependencies:** No `node_modules` black hole. Uses Bun's native HTTP and FileSystem APIs.
* **Stateless:** No database to sync. It scans your folders when Tinfoil asks.
* **Multi-Mount Support:** Seamlessly serve games scattered across multiple drives/mounts (e.g., `/mnt/nas` and `/mnt/usb`) as a single unified library.
* **Secure:** Designed to run with **Read-Only** access to your files. No risk of deletion or corruption.
* **Performance:** Uses the `sendfile` syscall (via Bun) for high-performance file streaming from your NAS to your Switch.

## 🛠️ Installation

### Option 1: Docker Compose (Recommended)

This is the easiest way to run `tinfoil-bolt` on your NAS, Home Server, or Proxmox LXC container.

1. Update the `docker-compose.yml` file with your environment info
2. Download the `server.ts` file from this repo.
3. Run:
```bash
docker compose up -d

```



### Option 2: Bare Metal (LXC/Linux)

If you are running a raw LXC container and don't want Docker overhead:

1. **Install Bun:**
```bash
curl -fsSL https://bun.sh/install | bash
```

2. **Configure:**
```bash
cp .env.example .env
# Edit .env with your game directories
```

3. **Run:**
```bash
bun run src/server.ts
# or with npm-style scripts:
bun start
```



## Configuration

Copy `.env.example` to `.env` and configure the following variables:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | The port the server listens on. | `3000` |
| `GAMES_DIRS` | Comma or semicolon-separated list of **absolute paths** where your NSP/NSZ/XCI files are stored. | `/data/games` |

### How It Works

1. The root endpoint (`/` or `/tinfoil`) returns an index listing `shop.json` and `shop.tfl`
2. Tinfoil requests `/shop.tfl` which contains the actual game library with relative URLs
3. Each configured directory is aliased (e.g., `games`, `games-2`) to keep paths unique across multiple mounts
4. Files are served from `/files/{alias}/{relative-path}`

## Tinfoil Setup (Switch)

1. Open **Tinfoil** on your Nintendo Switch.
2. Navigate to **File Browser**.
3. Press **-** (Minus Button) to add a new location.
4. Fill in the details:
  * **Protocol:** `HTTP`
  * **Host:** Your Server IP (e.g., `192.168.1.50`)
  * **Port:** `3000` (or whatever you set)
  * **Path:** `/` (or `/tinfoil` - both work)
  * **Title:** `Bolt Server` (or whatever you like)
5. Press **X** to Save.

Tinfoil will fetch the index, then request `/shop.tfl` to load your library. Your "New Games" tab will populate automatically.

## Supported Formats

The server recursively scans for the following extensions:

* `.nsp`
* `.nsz`
* `.xci`
* `.xciz`

## Security Note

This application serves files over plain HTTP (required by Tinfoil's standard implementation). It is intended for use inside a **trusted local network** (LAN). Do not expose this port directly to the internet without a VPN or proper authentication layer.

## License

MIT License. Feel free to fork, mod, and use in your home lab.

---

*Disclaimer: This tool is for managing your legally owned backups and homebrews. The authors do not condone piracy.*