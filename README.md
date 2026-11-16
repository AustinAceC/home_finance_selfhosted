# 🏦 Home Finance Self-Hosted

A self-hosted personal finance tracker, cash-flow analyzer, and AI "Roast Bot" platform deployed via [Coolify](https://coolify.io) on a Proxmox home server.

## Stack

| Layer | Tech |
|---|---|
| Database | PostgreSQL 16-Alpine |
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2.0 Async · APScheduler |
| Frontend | Next.js 15 · Tailwind CSS · Recharts |
| AI Engine | Gemini 2.0 Flash (via OpenAI-compatible endpoint) |
| Bank Data | SimpleFIN Bridge |
| Notifications | Telegram Bot (two-way) |
| TV Integration | Nvidia Shield TV via Aerial Views |

## Quick Start

```bash
# 1. Clone
git clone git@github.com:AustinAceC/home_finance_selfhosted.git
cd home_finance_selfhosted

# 2. Configure
cp .env.example .env
# Edit .env with your credentials

# 3. Deploy via Coolify (recommended) or locally:
docker compose up -d
```

## First-Time SimpleFIN Setup

After deployment, claim your SimpleFIN token:
```bash
curl -X POST http://localhost:8001/api/setup/claim-simplefin \
  -H "Content-Type: application/json" \
  -d '{"setup_token": "YOUR_BASE64_SETUP_TOKEN"}'
```

Then trigger the first sync:
```bash
curl -X POST http://localhost:8001/api/sync/trigger
```

## Ports

| Service | URL |
|---|---|
| Backend API | `http://your-server:8001` |
| Frontend Dashboard | `http://your-server:3000` |
| TV Kiosk | `http://your-server:3000/tv-kiosk` |
| TV Kiosk (Guest) | `http://your-server:3000/tv-kiosk?privacy=true` |

## API Docs

Swagger UI: `http://your-server:8001/docs`
