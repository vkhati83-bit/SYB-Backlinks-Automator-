# Railway Configuration

## Authentication

| Field | Value |
|-------|-------|
| API Token | `fd186b52-c623-456e-ba19-ba88bc3a9abb` |
| API Endpoint | `https://backboard.railway.app/graphql/v2` |
| User Email | vkhatiofficial@gmail.com |
| User ID | `a823ca65-bd53-4107-a1dd-1f74d10f7b22` |

## Workspaces

| Name | ID | Status |
|------|-----|--------|
| R Blank's Projects | `496b52ff-66a8-42d0-b1a0-00c7767e2a77` | Active (23 projects) |
| My Projects | `b35dd386-e9c5-419d-9cd0-1d397f1f6aa4` | Empty |

## Backlinks Gen Project

**Status:** CREATED

| Field | Value |
|-------|-------|
| Project ID | `bedca2b6-56c4-41eb-a3b7-17cd8cd0f06e` |
| Environment | production |
| Environment ID | `2899c3ca-7f12-4b6e-ae0e-a4ea57dafb29` |

### Services

| Service | ID | Status |
|---------|-----|--------|
| Postgres | `db68a964-3625-44ca-a9ef-645238d5ac81` | DEPLOYED |
| Redis | `b9197b33-1034-4930-9365-affa72c8b811` | DEPLOYED |
| backlinks-api | - | PENDING |
| backlinks-dashboard | - | PENDING |

### Postgres Connection

| Field | Value |
|-------|-------|
| Host | crossover.proxy.rlwy.net |
| Port | 58662 |
| Database | backlinks |
| User | postgres |
| Password | `BacklinksGen2026Secure` |
| Connection URL | `postgresql://postgres:BacklinksGen2026Secure@crossover.proxy.rlwy.net:58662/backlinks` |

### Redis Connection

| Field | Value |
|-------|-------|
| Host | mainline.proxy.rlwy.net |
| Port | 25763 |
| Connection URL | `redis://mainline.proxy.rlwy.net:25763` |

### Volumes

| Volume | Service | Mount Path |
|--------|---------|------------|
| postgres-volume | Postgres | /var/lib/postgresql/data |
| redis-volume | Redis | /data |

## Useful GraphQL Queries

### List All Projects
```graphql
{
  projects(workspaceId: "496b52ff-66a8-42d0-b1a0-00c7767e2a77") {
    edges {
      node {
        id
        name
        services {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  }
}
```

### Get Project Details
```graphql
{
  project(id: "PROJECT_ID") {
    id
    name
    environments {
      edges {
        node {
          id
          name
        }
      }
    }
    services {
      edges {
        node {
          id
          name
        }
      }
    }
  }
}
```

### Get Service Variables
```graphql
{
  variables(projectId: "PROJECT_ID", environmentId: "ENV_ID", serviceId: "SERVICE_ID")
}
```

## CLI Workaround

The Railway CLI v4.27.4 doesn't properly accept the token. Use direct API calls instead:

```bash
curl -s -H "Authorization: Bearer fd186b52-c623-456e-ba19-ba88bc3a9abb" \
  https://backboard.railway.app/graphql/v2 \
  -X POST -H "Content-Type: application/json" \
  -d '{"query": "{ me { email } }"}'
```

## Existing Infrastructure (Potentially Reusable)

### Redis
- **Project:** syb-gss-generation
- **Project ID:** `008070d3-6f82-456d-8ca1-70a511165ab3`
- **Service ID:** `828f3926-4e89-47be-ae0f-1abb8aedfd50`

### pgvector (if needed for embeddings)
- **Project:** syb-kb
- **Service ID:** `4bd48672-5546-4be5-9a4c-21817df790c2`
