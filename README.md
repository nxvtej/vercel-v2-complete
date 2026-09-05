# Deploy demo — single EC2 / Docker Compose

Mini Vercel-style deployer: paste a Git URL → clone → `npm run build` → serve static files from disk.

## Quick start

```bash
docker compose up --build
```

Open **http://localhost:8080**

## EC2

1. Launch Ubuntu EC2 (t3.small+), install Docker + Compose plugin
2. Clone this repo
3. Optional: set `PUBLIC_URL=http://YOUR_EC2_IP:8080` in `docker-compose.yml`
4. Security group: allow inbound **8080**
5. `docker compose up -d --build`

## How it works

| Piece | Role |
|-------|------|
| `server/` | Express + Socket.IO monolith |
| `vercel-v1-frontend/` | Dashboard UI (built into image) |
| `outputs/` | Deployed sites at `/sites/{name}/` |
| `.builds/` | Temp clone dirs (ephemeral) |

**No Redis, S3, or Fargate** — build runs in-process; logs stream over WebSocket.

## API

- `POST /api/project` — `{ "gitUrl": "...", "name": "optional-slug" }`
- `GET /api/project/:id` — status + log history
- `GET /sites/:id/` — deployed static site

## Env (docker-compose)

| Variable | Default |
|----------|---------|
| `PORT` | `8080` |
| `OUTPUT_DIR` | `/app/outputs` |
| `PUBLIC_URL` | auto from request host |

## Demo repo

**Use demo repo** deploys [deploy-demo-showcase](./deploy-demo-showcase/) — **AETHER** (space + AI, Vite static → `dist/`).

Why the old Cruip/Next deploy looked broken: Next.js apps need `output: 'export'` and serve from `out/` — otherwise `_next/` assets break under `/sites/slug/`. This demo is plain static HTML/CSS/JS.

```bash
cd deploy-demo-showcase && npm run dev    # preview
cd deploy-demo-showcase && git push       # then deploy from GitHub
```

Demo URL: `https://github.com/nxvtej/deploy-demo-showcase`
