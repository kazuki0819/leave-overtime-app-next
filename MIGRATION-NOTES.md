# Migration: Express+SQLite → Next.js 14+Turso

## What Changed

### Backend
- **Express → Next.js Route Handlers**: All 30+ API routes from `server/routes.ts` are now individual route handler files under `app/api/`
- **better-sqlite3 → @libsql/client**: All database operations are now async using Turso/libSQL
- **Synchronous → Async storage**: `lib/storage.ts` uses `await` for all DB operations (`.all()` → `await db.select()`, `.get()` → `await db.select().limit(1)`, etc.)
- **Raw SQL**: `getNextEmployeeId()` and meta operations use `client.execute()` from libSQL client
- **Schema**: Uses plain Zod schemas instead of drizzle-zod's `createInsertSchema` (avoids deep type recursion issues)

### Frontend
- **wouter → next/navigation**: `Link` from `next/link`, `useRouter`/`usePathname`/`useParams` from `next/navigation`
- **Hash routing → Path routing**: No more `useHashLocation` - standard Next.js App Router
- **@shared/ → @/lib/**: Import path alias changed
- **"use client" directives**: Added to all client components, hooks, and pages
- **API fetch paths**: Unchanged (`/api/...`) - works seamlessly with Next.js

### Database
- **Local dev**: Falls back to `file:local.db` when `TURSO_DATABASE_URL` is not set
- **Production**: Connects to Turso cloud via `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
- **Schema init**: `initializeDatabase()` creates tables on first request via `ensureDbInitialized()`
- **Seeding**: POST `/api/seed` populates initial data from `lib/seed-data.json`

### Auth
- **HTTP Basic Auth** via Next.js middleware when `ADMIN_PASSWORD` env var is set
- Skipped when not set (for local development)

### Backup
- Adapted for Turso: exports all data as JSON instead of file copy
- Info endpoint shows Turso connection status

## Route Mapping

### API Routes (30 handlers)
| Path | Methods | Purpose |
|------|---------|---------|
| /api/employees | GET, POST | List & create employees |
| /api/employees/next-id | GET | Next available employee ID |
| /api/employees/[id] | GET, PATCH, DELETE | Single employee CRUD |
| /api/employees/[id]/retire | POST | Retire employee |
| /api/employees/[id]/reinstate | POST | Reinstate employee |
| /api/assignment-histories | POST | Create assignment history |
| /api/assignment-histories/[employeeId] | GET | Get histories by employee |
| /api/assignment-histories/record/[id] | PATCH, DELETE | Update/delete history |
| /api/paid-leaves | GET, PUT | List & upsert paid leaves |
| /api/paid-leaves/[employeeId] | GET | Get leave by employee |
| /api/leave-usages | GET, POST | List & create leave usage |
| /api/leave-usages/[id] | DELETE | Delete leave usage |
| /api/monthly-overtimes | GET, PUT | List & upsert overtime |
| /api/overtime-alerts | GET | Overtime compliance alerts |
| /api/paid-leave-alerts | GET | Leave compliance alerts |
| /api/alerts | GET | Combined alerts |
| /api/employee-summaries | GET | Dashboard summaries |
| /api/dashboard | GET | Dashboard statistics |
| /api/assignment-leave-stats | GET | Leave stats by assignment |
| /api/import | POST | Bulk import employees/leaves |
| /api/import-overtimes | POST | Bulk import overtime data |
| /api/fiscal-year-transition | POST | Execute year transition |
| /api/fiscal-year-transition/preview | GET | Preview year transition |
| /api/export/leave-management | GET | CSV export |
| /api/export/overtime-management | GET | CSV export |
| /api/export/employees | GET | CSV export |
| /api/backup/info | GET | Database info |
| /api/backup/create | POST | JSON data backup |
| /api/seed | POST | Seed initial data |

### Pages (7 pages)
| Route | Page |
|-------|------|
| / | Dashboard |
| /leave | Leave Management |
| /overtime | Overtime Management |
| /employees | Employee List |
| /employees/[id] | Employee Detail |
| /import | Excel Import |
| /settings | Settings |

## Deployment to Vercel

1. Push to GitHub
2. Connect to Vercel
3. Set environment variables:
   - `TURSO_DATABASE_URL` = your Turso database URL
   - `TURSO_AUTH_TOKEN` = your Turso auth token
   - `ADMIN_PASSWORD` = (optional) for HTTP Basic Auth
4. Deploy
5. POST `/api/seed` once to populate initial data
