# Claude Quick Start - SYB Backlinks Gen

## Project Overview
A backlink outreach automation system for ShieldYourBody (SYB). It discovers link-building prospects from SEO data, manages contacts, generates personalized emails via Claude, and tracks campaign performance.

## Tech Stack
- **Backend:** Node.js + Express + TypeScript (`app/`)
- **Frontend:** Next.js 14 + TypeScript + Tailwind (`dashboard/`)
- **Database:** PostgreSQL
- **Key APIs:** Claude (email generation), Resend (email sending)

## Project Structure
```
Backlinks Gen/
├── app/                      # Backend API
│   └── src/
│       ├── api/routes/       # Express routes
│       ├── db/
│       │   ├── migrations/   # SQL migrations
│       │   └── repositories/ # Database access layer
│       ├── types/index.ts    # TypeScript types
│       └── utils/            # Helpers, logger
├── dashboard/                # Frontend UI
│   └── src/
│       ├── app/              # Next.js pages
│       └── components/       # React components
└── IMPLEMENTATION_LOG_2026-01-29.md  # Detailed change log
```

## What Was Just Built (2026-01-29)
Enhanced Prospect CRM with:
- **Tabbed interface:** Pending → Approved → Completed workflow
- **Grouped prospect list:** By opportunity type (Broken Links, Research Citations, Guest Posts)
- **Bulk actions:** Select multiple prospects, approve/reject in bulk
- **Contact queue:** Set primary contact, queue fallback emails
- **Outcome tagging:** Mark completed prospects (Partner, Not Interested, etc.)
- **Keyword management:** Configure search keywords by niche

## Key Files to Know
| File | Purpose |
|------|---------|
| `app/src/types/index.ts` | All TypeScript interfaces |
| `app/src/db/repositories/` | Database query methods |
| `app/src/api/routes/` | API endpoints |
| `dashboard/src/app/prospects/page.tsx` | Main CRM page |
| `dashboard/src/components/prospects/` | CRM UI components |

## Current Status
- ✅ Backend API complete
- ✅ Frontend UI complete
- ⚠️ Database migration needs to be run
- ⚠️ Had hydration error (may be fixed, needs testing)

## To Start Working

### 1. Run database migration first:
```bash
# Apply the new schema changes
psql -U postgres -d backlinks_gen -f app/src/db/migrations/002_enhanced_crm.sql
```

### 2. Start the servers:
```bash
# Terminal 1 - Backend (port 3000)
cd app && npm run dev

# Terminal 2 - Frontend (port 3001)
cd dashboard && npm run dev
```

### 3. Open dashboard:
http://localhost:3001/prospects

## API Base URL
`http://localhost:3000/api/v1`

## Common Tasks

**Add a new API endpoint:**
1. Add route in `app/src/api/routes/[resource].routes.ts`
2. Add repository method in `app/src/db/repositories/[resource].repository.ts`
3. Update types in `app/src/types/index.ts`
4. Register route in `app/src/api/routes/index.ts`

**Add a new frontend page:**
1. Create `dashboard/src/app/[page]/page.tsx`
2. Add components in `dashboard/src/components/[page]/`
3. Add nav link in `dashboard/src/components/Sidebar.tsx`

## Database Tables
- `prospects` - Link building targets
- `contacts` - Email contacts per prospect
- `campaigns` - Outreach campaigns
- `emails` - Generated/sent emails
- `responses` - Replies received
- `search_keywords` - Discovery keywords (NEW)
- `niches` - Keyword categories (NEW)
- `audit_log` - Action history

## If There Are Errors
1. **Hydration error:** Disable browser extensions, hard refresh (Ctrl+Shift+R)
2. **API 500 errors:** Check if migration was run
3. **TypeScript errors:** Run `npm run build` to see full errors
