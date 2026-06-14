# LocalCMP

LocalCMP is a phase-1 IoT CMP prototype with:

- CMP design documents in `docs/`
- A static frontend console in `frontend/`
- A modular-monolith backend in `backend/`
- PostgreSQL DDL in `database/schema.sql`

## Run

```powershell
npm start
```

Then open:

```text
http://localhost:8080/
```

API health check:

```text
http://localhost:8080/api/v1/health
```

## Architecture

The backend follows the phase-1 plan:

- Modular monolith
- Clear domain modules
- Independent PostgreSQL schemas
- In-process async event bus and outbox-style events
- API boundaries under `/api/v1`

Current domain modules:

- Account
- SIM Inventory and lifecycle state machine
- eSIM/Profile catalog
- Package catalog
- Usage/CDR
- Billing
- Batch jobs
- Supplier resources
- API clients
- Settings
- Audit
- Dashboard analytics

The development server uses in-memory seed data from `backend/data/seed.json`. The production database structure is defined in `database/schema.sql`.
