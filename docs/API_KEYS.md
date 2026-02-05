# API Keys & Credentials

**WARNING:** This file contains sensitive credentials. Do NOT commit to version control.

---

## Resend (Email Service)

| Field | Value |
|-------|-------|
| API Key | `re_YOUR_KEY_HERE` |
| Documentation | https://resend.com/docs |

**Test Email Recipient:** `vicky@shieldyourbody.com` (SAFETY PROTOCOL)

---

## Railway

| Field | Value |
|-------|-------|
| API Token | `fd186b52-c623-456e-ba19-ba88bc3a9abb` |
| API Endpoint | `https://backboard.railway.app/graphql/v2` |

---

## Anthropic (Claude API)

| Field | Value |
|-------|-------|
| API Key | `sk-ant-api03-YOUR_KEY_HERE` |

---

## DataForSEO

| Field | Value |
|-------|-------|
| Status | NOT NEEDED |
| Reason | Using SEO Command Center database instead |

---

## Environment Variables Template

```env
# Database (Railway)
DATABASE_URL=postgresql://user:pass@host:5432/backlinks

# Resend (Email)
RESEND_API_KEY=re_YOUR_KEY_HERE
OUTREACH_FROM_EMAIL=outreach@mail.shieldyourbody.com
TEST_EMAIL_RECIPIENT=your-email@shieldyourbody.com

# Claude API
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE

# SEO Command Center (existing Railway database)
SEO_DATABASE_URL=postgresql://postgres:PASSWORD@host:port/database

# Railway
RAILWAY_TOKEN=YOUR_RAILWAY_TOKEN_HERE

# Redis (Railway)
REDIS_URL=redis://default:PASSWORD@host:port
```
