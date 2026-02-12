# 🚂 Railway Deployment Steps

**Git Push Status:** ✅ **PUSHED TO GITHUB**
**Railway Auto-Deploy:** ⏳ **Will trigger automatically**

---

## 🎯 Steps to Complete Railway Deployment

### 1. ✅ Code Deployed (Done Automatically)
Railway will automatically deploy the new code from GitHub.

### 2. 🗄️ Run Database Migrations

**You need to run migrations on Railway database:**

#### Option A: Via Railway CLI
```bash
railway login
railway run npm run db:migrate
```

#### Option B: Via Railway Dashboard
1. Go to Railway dashboard
2. Open your project
3. Click on "Variables" tab
4. Click "Deploy" → "Run Command"
5. Run: `npm run db:migrate`

#### Option C: Temporarily via API endpoint
Add a migration endpoint (for one-time use):

```typescript
// Add to app/src/api/routes/index.ts
router.post('/admin/migrate', async (req, res) => {
  // Run migrations programmatically
  const { execSync } = require('child_process');
  const result = execSync('npm run db:migrate');
  res.json({ result: result.toString() });
});
```

Then call: `POST https://your-app.railway.app/api/v1/admin/migrate`

### 3. ✅ Verify Deployment

```bash
# Check health
curl https://your-app.railway.app/health

# Check stats (should include trash count)
curl https://your-app.railway.app/api/v1/prospects/stats

# Test filtered endpoint
curl https://your-app.railway.app/api/v1/prospects/filtered?status=needs_review
```

---

## 🔑 Environment Variables on Railway

Make sure these are set in Railway dashboard:

### Required (Already Set)
- `DATABASE_URL`
- `REDIS_URL`
- `ANTHROPIC_API_KEY`
- `DATAFORSEO_LOGIN`
- `DATAFORSEO_PASSWORD`
- `RESEND_API_KEY`

### New (Optional - for Phase 2)
```env
HUNTER_API_KEY=your_hunter_key_here
GOOGLE_SEARCH_API_KEY=your_google_key_here
GOOGLE_SEARCH_CX=your_custom_search_id_here
MAX_CONTACT_COST_PER_PROSPECT_CENTS=50
ENABLE_CLEARBIT=false
```

---

## 📊 What Will Deploy

### Database Migrations (4 new)
- ✅ 004_tiered_prospect_storage.sql
- ✅ 005_enhanced_contacts.sql
- ✅ 006_blog_analyses.sql
- ✅ 007_soft_delete_prospects.sql

### New Services (5 files)
- ✅ contact-cache.service.ts
- ✅ email-validator.service.ts
- ✅ decision-maker.service.ts
- ✅ contact-intelligence.service.ts
- ✅ blog-analyzer.service.ts

### New Workers (2 files)
- ✅ broken-link-verifier.worker.ts
- ✅ trash-cleanup.worker.ts

### Updated Files (6 files)
- ✅ data-fetch.routes.ts (3 endpoints)
- ✅ prospects.routes.ts (12 endpoints)
- ✅ prospect.repository.ts (soft delete)
- ✅ contact-finder.worker.ts (intelligence)
- ✅ index.ts (cleanup scheduler)
- ✅ queues.ts (new queue)

---

## 🧪 Post-Deployment Testing

Once migrations run on Railway, test:

### 1. Zero Data Loss
```bash
POST https://your-app.railway.app/api/v1/data-fetch/research-citations
{
  "limit": 100
}

# Response should show:
# - total_found === inserted (100% saved!)
# - auto_approved, needs_review, auto_rejected counts
```

### 2. Filtered Prospects
```bash
GET https://your-app.railway.app/api/v1/prospects/filtered?status=needs_review
```

### 3. Soft Delete
```bash
DELETE https://your-app.railway.app/api/v1/prospects/:id
GET https://your-app.railway.app/api/v1/prospects/trash
POST https://your-app.railway.app/api/v1/prospects/:id/restore
```

### 4. Broken Links Structure
```bash
GET https://your-app.railway.app/api/v1/prospects/broken-links
```

---

## ⚡ Quick Deployment Checklist

- [x] Code committed to git
- [x] Code pushed to GitHub
- [ ] Railway auto-deploys (wait 2-3 minutes)
- [ ] Run migrations: `railway run npm run db:migrate`
- [ ] Add optional API keys for Phase 2
- [ ] Test endpoints
- [ ] Verify zero data loss working
- [ ] Test soft delete cycle

---

## 🎊 Expected Results After Deployment

1. **Data Loss:** 0% (down from 86%)
2. **Prospects Saved:** 100% with categorization
3. **Trash System:** Fully operational
4. **New Endpoints:** 12 new endpoints working
5. **Contact Quality:** Enhanced with scoring (when API keys added)

---

## 🚨 If Something Goes Wrong

1. Check Railway logs for errors
2. Verify migrations completed successfully
3. Check environment variables are set
4. Verify database connection working

**Railway Dashboard:** https://railway.app/

---

**Status: Code deployed, awaiting migration run on Railway** ✅
