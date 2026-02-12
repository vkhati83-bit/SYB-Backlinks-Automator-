# Broken Link Data Structure - Clear & Simple

## 🎯 What You Get for Each Broken Link Opportunity

When you fetch broken links, here's **exactly** what you'll see:

---

## 📋 Example Broken Link Opportunity

```json
{
  "id": "uuid-here",
  "quality_score": 85,
  "filter_status": "auto_approved",
  "approval_status": "pending",
  "contact_count": 2,

  "referring_page": {
    "url": "https://healthblog.com/emf-safety-tips-for-parents",
    "title": "EMF Safety Tips Every Parent Should Know",
    "domain": "healthblog.com",
    "domain_authority": 45
  },

  "broken_link_details": {
    "broken_url": "https://competitor.com/deleted-emf-guide",
    "anchor_text": "comprehensive EMF protection guide",
    "status_code": 404,
    "verified": true,
    "verified_at": "2026-02-12T10:30:00Z"
  },

  "replacement_suggestion": {
    "article_url": "https://shieldyourbody.com/emf-protection-children/",
    "article_title": "EMF Protection for Children: Complete Parent Guide",
    "match_reason": "Both articles cover EMF safety for children and parents"
  }
}
```

---

## 📝 How to Read This

### 1️⃣ **REFERRING PAGE** (Where the broken link is)
- **URL:** `https://healthblog.com/emf-safety-tips-for-parents`
- **Title:** "EMF Safety Tips Every Parent Should Know"
- **Domain:** healthblog.com
- **DA:** 45

👉 **This is the article you'll reach out to!**

---

### 2️⃣ **BROKEN LINK DETAILS** (What's broken)
- **Broken URL:** `https://competitor.com/deleted-emf-guide`
- **Anchor Text:** "comprehensive EMF protection guide"
- **Status Code:** 404 (confirmed broken)
- **Verified:** ✅ YES (we checked it!)
- **When:** 2026-02-12

👉 **This is the dead link they need to fix!**

---

### 3️⃣ **REPLACEMENT SUGGESTION** (Your SYB article)
- **Article:** "EMF Protection for Children: Complete Parent Guide"
- **URL:** https://shieldyourbody.com/emf-protection-children/
- **Why:** Both articles cover EMF safety for children and parents

👉 **This is what you'll pitch as the replacement!**

---

### 4️⃣ **METADATA** (Quality info)
- **Quality Score:** 85/100
- **Filter Status:** auto_approved (high quality)
- **Contacts Found:** 2 contacts
- **Prospect ID:** For tracking

---

## 💌 Your Outreach Email Template

```
Subject: Broken link on "EMF Safety Tips Every Parent Should Know"

Hi [Contact Name],

I was reading your article "EMF Safety Tips Every Parent Should Know"
and noticed a broken link:

🔗 Broken Link: "comprehensive EMF protection guide"
   → https://competitor.com/deleted-emf-guide (Returns 404)

I have a great replacement that your readers would find valuable:

✨ Suggested Replacement:
   "EMF Protection for Children: Complete Parent Guide"
   → https://shieldyourbody.com/emf-protection-children/

This article covers the same topic and includes:
- Science-backed research
- Practical safety tips for parents
- Product recommendations

Would you be open to updating the link? Happy to provide any additional
information about our research.

Best regards,
SYB Research Team
```

---

## 🔍 How to Access This Data

### API Endpoint
```bash
GET /api/v1/prospects/broken-links?approval_status=pending&limit=20
```

### Response Format
```json
{
  "opportunities": [
    {
      "referring_page": { ... },
      "broken_link_details": { ... },
      "replacement_suggestion": { ... }
    }
  ],
  "total": 150,
  "limit": 20,
  "offset": 0
}
```

### Individual Prospect
```bash
GET /api/v1/prospects/:id
```

Returns the same structure in `structured_data` field.

---

## ✅ What's Different Now

### **BEFORE (Confusing):**
```
url: "https://competitor.com/page"  ← Wait, is this the broken link or the referring page?
description: "BROKEN LINK OPPORTUNITY..."  ← Wall of text, hard to parse
```

### **AFTER (Crystal Clear):**
```json
{
  "referring_page": {
    "url": "https://healthblog.com/article"  ← Where the broken link is
  },
  "broken_link_details": {
    "broken_url": "https://competitor.com/404"  ← The actual broken link
    "anchor_text": "click here"  ← What text links to it
  },
  "replacement_suggestion": {
    "article_url": "https://shieldyourbody.com/..."  ← Your replacement
  }
}
```

---

## 🎯 Summary

**You now get 4 clear pieces of data:**

1. **Referring Page** - The article to contact (URL, title, domain, DA)
2. **Broken Link** - The dead URL they're linking to (URL, anchor, 404 status)
3. **Anchor Text** - The clickable text on their page
4. **SYB Replacement** - Your article to suggest (URL, title, why it matches)

**No more confusion!** Everything you need to craft the perfect outreach email. 🎊
