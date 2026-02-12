# Railway Deployment Verification Checklist

## Current Status

**✅ Migrations:** Applied successfully on Railway database
**⏳ App Deployment:** Old code still running (waiting for redeploy)
**❌ Redis:** Stopped (needs restart)

---

## 🔍 What I Found

### Database (✅ READY)
```
All 7 migrations applied successfully:
- 004: Tiered prospect storage
- 005: Enhanced contacts
- 006: Blog analyses
- 007: Soft delete

New tables created:
✅ prospect_filter_log
✅ contact_api_logs
✅ blog_analyses
✅ Views: active_prospects, trashed_prospects, high_quality_contacts
```

### App Service (⏳ NEEDS REDEPLOY)
```
Currently running: OLD CODE
Evidence: Stats endpoint returns:
  {"pending":3045,"approved":2,"rejected":0,"total":3047}

Should return (with new code):
  {"pending":3045,"approved":2,"rejected":0,"total":3047,"trash":0}

Missing: "trash" field
```

### Redis (❌ STOPPED)
```
Status: "The database deployment has stopped running"
Impact: Background workers not running
```

---

## ✅ Action Items

### 1. Restart Redis (CRITICAL)

**Via Railway Dashboard:**
1. Go to: https://railway.app/project/bedca2b6-56c4-41eb-a3b7-17cd8cd0f06e
2. Find "Redis" service
3. Click **"Deploy"** or **"Restart"** button
4. Wait for green status (1-2 min)

**Via CLI:**
```bash
railway service Redis
railway up
```

### 2. Redeploy App Service

**Via Railway Dashboard:**
1. Find your "app" or "backend" service
2. Go to "Deployments" tab
3. Click **"Redeploy"** on latest deployment
4. Or click **"Deploy"** button
5. Wait 2-3 minutes for build to complete

**Via CLI:**
```bash
# Find the app service name first
railway service app   # or "backend" or whatever it's called
railway up
```

**Via GitHub Webhook (automatic):**
- Already triggered by git push
- May take 5-10 minutes to build and deploy
- Check: https://railway.app/project/bedca2b6-56c4-41eb-a3b7-17cd8cd0f06e

### 3. Verify Deployment

Once redeployed, test these endpoints:

```bash
# Should show trash field
curl https://syb-backlinks-gen-api.up.railway.app/api/v1/prospects/stats
Expected: {"pending":X,"approved":Y,"total":Z,"trash":0}

# Should work (not show "Failed to fetch prospect")
curl https://syb-backlinks-gen-api.up.railway.app/api/v1/prospects/trash

# Should work
curl https://syb-backlinks-gen-api.up.railway.app/api/v1/prospects/filtered?status=auto_approved&limit=1
```

---

## 📊 How to Monitor Deployment

### Check Build Logs
```bash
railway logs
# Look for:
# - "Server running on port 3000"
# - "✅ Redis connected" (after Redis restart)
# - "Started 7 workers"
# - "Trash cleanup scheduler started"
```

### Check Service Health
```bash
curl https://syb-backlinks-gen-api.up.railway.app/health
# Should return: {"status":"ok","environment":"production"}
```

### Check Deployment Status
1. Railway Dashboard → Your Project
2. Click on app service
3. "Deployments" tab
4. Latest deployment should show:
   - ✅ Build succeeded
   - ✅ Deploy succeeded
   - 🟢 Active

---

## 🎯 Expected Timeline

- **T+0:** Git push completed ✅
- **T+1min:** Railway webhook triggered ✅
- **T+2-5min:** Build completes ⏳
- **T+5-7min:** Deployment active ⏳
- **T+8min:** New code live and testable ⏳

Current time since push: ~5 minutes

**Recommendation:** Wait 5 more minutes, then test endpoints again.

---

## 🚨 If Still Not Working After 10 Minutes

### Manual Redeploy:
1. Railway Dashboard → App Service
2. Deployments tab → Click "Redeploy" on latest
3. Watch build logs for errors
4. Check for TypeScript errors or import issues

### Check Environment Variables:
Make sure these are set:
- DATABASE_URL
- REDIS_URL (might be missing if Redis is down!)
- ANTHROPIC_API_KEY
- All other required env vars

---

## ✅ Verification Commands (Run After Deployment)

```bash
# 1. Test health
curl https://syb-backlinks-gen-api.up.railway.app/health

# 2. Test stats (should have trash field)
curl https://syb-backlinks-gen-api.up.railway.app/api/v1/prospects/stats

# 3. Test filtered endpoint
curl https://syb-backlinks-gen-api.up.railway.app/api/v1/prospects/filtered?status=needs_review&limit=2

# 4. Test trash endpoint
curl https://syb-backlinks-gen-api.up.railway.app/api/v1/prospects/trash

# 5. Test broken links structure
curl https://syb-backlinks-gen-api.up.railway.app/api/v1/prospects/broken-links?limit=1
```

---

## 📱 Railway Dashboard Links

**Project:** https://railway.app/project/bedca2b6-56c4-41eb-a3b7-17cd8cd0f06e

**Quick Actions:**
- Restart Redis: Find Redis service → Click "Restart"
- Redeploy App: Find app service → Deployments → "Redeploy"
- View Logs: Click on service → "Logs" tab
- Check Variables: Click on service → "Variables" tab

---

**Status: Waiting for Railway to complete deployment** ⏳

I've triggered the redeploy. You can monitor progress in the Railway dashboard or wait ~5 more minutes and test the endpoints.
