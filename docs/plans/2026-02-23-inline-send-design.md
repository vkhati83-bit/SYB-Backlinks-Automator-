# Inline Send & Remove Review Queue — Design

**Goal:** Remove the standalone `/review` page and let users send emails directly from the compose modal, with a real-time sent animation.

**Architecture:** No backend changes. All changes are in the dashboard UI. The existing `POST /emails/{id}/approve` endpoint already queues to BullMQ — we just call it immediately from the modal instead of directing the user to `/review`.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS

---

## What Changes

### 1. Sidebar — remove Review Queue nav item
- `dashboard/src/components/Sidebar.tsx`
- Remove the `{ href: '/review', icon: 'inbox', label: 'Review Queue' }` entry from `navItems`
- The `/review` route file is kept (not deleted) but no longer linked from nav

### 2. Compose Modal — "Queue for Review" → "Send"
- `dashboard/src/components/prospects/ProspectDetail.tsx`
- Replace `handleSendEmail` logic:
  - Step 1: `POST /api/v1/emails/send` → saves email, returns `email_id`
  - Step 2: `POST /api/v1/emails/{email_id}/approve` → marks approved, queues BullMQ
  - Step 3: Show sending animation in modal (paper plane SVG animating)
  - Step 4: Poll `GET /api/v1/emails/{email_id}` every 2 seconds (max 30s)
  - Step 5: When `status === 'sent'` → show success state (✓ + "Sent to {domain}!")
  - Step 6: Auto-close modal after 2 seconds

### 3. Modal states
The compose modal needs 4 distinct states:
- `generating` — spinner, "Generating personalized email with Claude..."
- `ready` — shows subject/body fields, [Send] [Regenerate] [Cancel] buttons
- `sending` — paper plane animation, "Sending to {domain}..."
- `sent` — green checkmark, "✓ Sent to {domain}!", auto-closes in 2s

### 4. Existing tabs — unchanged
- Pending Review, Ready to Send, Completed tabs in Research Citations and Broken Links pages remain exactly as-is.
- Prospect approval (bulk approve) remains as-is.
- After a successful send, the prospect's status updates on next tab refresh (no special handling needed — existing behaviour).

## What Does NOT Change
- Backend API routes
- BullMQ workers
- Research Citations page tabs
- Broken Links page tabs
- All other nav items
- The `/review` route file itself (just hidden from nav)
