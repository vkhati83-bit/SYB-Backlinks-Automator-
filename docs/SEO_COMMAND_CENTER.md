# SEO Command Center - Integration Reference

## Overview

The SEO Command Center is an existing Railway project that contains SEO research data. Backlinks Gen will READ from this database for prospect research instead of using DataForSEO API.

## Railway Details

| Field | Value |
|-------|-------|
| Project Name | syb-seo-command-center |
| Project ID | `b3ad2e7f-826b-4a6f-93fe-dd087302e223` |
| Environment | production |
| Environment ID | `246188ff-193d-4390-bd26-d666063e420e` |

## Services

| Service | ID | URL |
|---------|-----|-----|
| Postgres | `97e2bce0-4b7c-42eb-a3db-915cc4fe53e1` | postgres-production-5d83.up.railway.app |
| API | `b24a0479-a20c-4da2-a404-634209320e6b` | web-production-8183e.up.railway.app |
| Dashboard | `225522aa-df7d-40cd-9d2b-8b080c059cf0` | dashboard-v2-production-0140.up.railway.app |
| Scheduler | `fa7980ec-3312-441b-bf57-1b201bd89867` | scheduler-production-49a8.up.railway.app |
| Data Collection | `22005305-eede-403e-9499-b266533a1078` | - |

## Database Connection

| Field | Value |
|-------|-------|
| Host | tramway.proxy.rlwy.net |
| Port | 34710 |
| Database | railway |
| User | postgres |
| Password | `plPlSlWzwLNsnWqjNSlNNEBOWfcYBycQ` |
| Connection String | `postgresql://postgres:plPlSlWzwLNsnWqjNSlNNEBOWfcYBycQ@tramway.proxy.rlwy.net:34710/railway` |

## Database Schema

**Status:** FULLY EXPLORED

### High-Value Tables for Backlink Prospecting

| Table | Rows | Purpose |
|-------|------|---------|
| **competitor_broken_backlinks** | 939 | GOLDMINE - Broken links on competitor sites with referring domains |
| **competitor_referring_domains** | 2,898 | Sites linking to competitors (potential prospects) |
| **backlink_details** | 10,126 | Existing SYB backlinks |
| **emf_serp_results** | 3,849 | Sites ranking for EMF keywords |
| **emf_forum_posts** | 32,807 | Forum discussions about EMF |
| **content_pages** | 4,329 | SYB content inventory |
| **keywords** | 21MB | Keyword data |
| **domain_metrics_cache** | 690 | Domain authority/rating |
| **competitors** | 25 | Known competitors |

### Key Table: competitor_broken_backlinks

Perfect for broken link outreach strategy:
```
- broken_url: The 404 URL on competitor site
- broken_url_title: Title of broken page
- referring_page_url: Page that has the broken link
- referring_domain: Domain to contact
- referring_domain_rank: Domain authority
- anchor_text: How they linked
- suggested_syb_url: Already has SYB content match!
- outreach_status: Track outreach progress
```

### Key Table: competitor_referring_domains

Sites linking to competitors but not SYB:
```
- competitor_domain: Which competitor
- referring_domain: Domain to target
- domain_rating: Quality score
- we_have_link: Boolean - do they link to us?
```

### Key Table: emf_serp_results

Sites ranking for EMF keywords (content-relevant prospects):
```
- keyword: EMF-related search term
- domain: Site ranking
- url: Specific page
- position: SERP position
- is_our_domain: Filter out SYB
```

## Integration Strategy

1. **READ-ONLY** access to SEO Command Center
2. Use existing SEO research data for finding backlink prospects
3. No writes to this database - it's a source, not a destination
4. Backlinks Gen will have its OWN database for:
   - Prospects
   - Contacts
   - Emails
   - Sequences
   - Responses
