# Getting notified when the backlinks tool breaks

Set up once. After this, if outreach stops flowing you get an email (or SMS/Slack, your choice) instead of finding out seven weeks later.

## Why this exists

In May 2026 the tool quietly stopped sending. It did not crash. It ran every day, reported "success", and sent zero emails for seven weeks. Nobody noticed because nothing looked wrong. These two monitors watch the **result** (are emails actually going out), not just "did the program run", so the same silent stall trips an alert.

## What you are setting up

Two checks on [healthchecks.io](https://healthchecks.io) (free account is enough):

1. **backlinks-emails-flowing** — the important one. The tool "checks in" every time it actually sends a real email. If nothing checks in for **3 days**, you get alerted. This catches the problem no matter the cause: stall, crash, empty inventory, or paused.

2. **backlinks-autopilot-run** — the daily job checks in each morning. If the run finishes without being able to email anyone (the exact May failure), it reports a failure the **same day**. If the whole job dies and never checks in, that trips too.

## Step by step

1. Sign in at healthchecks.io and create a project (e.g. "SYB Backlinks").

2. **Create check 1:**
   - Name: `backlinks-emails-flowing`
   - Schedule type: **Simple**
   - Period: **3 days**
   - Grace time: **1 day**
   - Save, then copy its **Ping URL** (looks like `https://hc-ping.com/xxxxxxxx-xxxx-...`).

3. **Create check 2:**
   - Name: `backlinks-autopilot-run`
   - Schedule type: **Simple**
   - Period: **1 day**
   - Grace time: **90 minutes** (the daily run can take up to an hour while it searches for prospects, so give it room)
   - Save, copy its **Ping URL**.

4. **Set up how you want to be told.** In healthchecks.io go to **Integrations** and add Email (already on by default), or SMS / Slack / WhatsApp / Telegram. Attach both checks.

5. **Add the two URLs to Railway** (project `syb-backlinks-gen`, service `api`, Variables tab):

   ```
   HEALTHCHECKS_EMAILS_URL   = <ping URL from check 1>
   HEALTHCHECKS_AUTOPILOT_URL = <ping URL from check 2>
   ```

   Save. Railway redeploys automatically.

That's it. If you never add these URLs, the tool runs exactly as before with monitoring simply switched off, so there is no rush and nothing to break.

## How to know it's working

- Within a day of the next autopilot run, `backlinks-autopilot-run` should show a green "check in" on healthchecks.io.
- The first time a real outreach email sends, `backlinks-emails-flowing` goes green.
- To test the alert path without waiting, open a check on healthchecks.io and click **"Send a test notification"**.

## If you get an alert

- **emails-flowing went red:** no email has sent in 3 days. Open the dashboard, or re-run the diagnostic:
  `cd app && npx tsx src/scripts/verify-prospecting-fix.ts` (shows whether prospecting can still reach fresh inventory).
- **autopilot-run reported a failure:** the daily run couldn't find anyone to email. Usually means a source is exhausted or a query broke. Same diagnostic script is the first place to look.
