# SYB Backlinks Generator

Automated backlink outreach system for Shield Your Body.

## Quick Start

```bash
# Start Backend (port 3000)
cd app && npm run dev

# Start Frontend (port 3001)
cd dashboard && npm run dev
```

Then open http://localhost:3001

## Project Structure

```
Backlinks Gen/
├── app/                 # Backend API (Node.js + Express + TypeScript)
│   └── src/
│       ├── api/         # REST endpoints
│       ├── config/      # Environment & queue config
│       ├── db/          # Database connections & repositories
│       ├── scripts/     # Seeding & utility scripts
│       ├── services/    # Claude AI, email services
│       ├── workers/     # Background job processors
│       └── index.ts     # Server entry point
├── dashboard/           # Frontend (Next.js 14 + React)
│   └── src/
│       ├── app/         # Pages & routes
│       └── components/  # UI components
├── docs/                # Documentation
├── scripts/             # Development scripts (.bat files)
└── logs/                # Application logs
```

## Features

- **Prospect Discovery**: Pulls opportunities from SEO Command Center
- **Contact Finding**: Scrapes websites for contact info + pattern fallback
- **AI Email Generation**: Claude writes personalized outreach emails
- **Review Queue**: Human approval before sending
- **Safety Mode**: Test mode redirects all emails to internal address

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express, TypeScript |
| Frontend | Next.js 14, React, Tailwind CSS |
| Database | PostgreSQL |
| Queue | Redis + BullMQ |
| AI | Claude API (Anthropic) |
| Email | Resend |

## Documentation

See the `docs/` folder for detailed documentation:

- [Architecture](docs/APP_ARCHITECTURE.md) - System design
- [How It Works](docs/HOW_IT_WORKS.md) - Detailed workflows
- [API Keys](docs/API_KEYS.md) - Required credentials
- [Quickstart](docs/CLAUDE_QUICKSTART.md) - Getting started guide
- [Railway Config](docs/RAILWAY_CONFIG.md) - Deployment setup

## Environment Variables

Copy `.env.example` to `.env` and configure:

```
DATABASE_URL=postgresql://...
SEO_DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
```

## Status

**Alpha** - Working demo with 100 prospects loaded.

---

*Internal tool for Shield Your Body*
