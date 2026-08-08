# Architecture

## High-Level Flow

```mermaid
flowchart LR
  Client[Browser] --> Nginx[Nginx :80]
  Nginx --> Static[Static Vite Build]
  Frontend[React + TypeScript Source] -->|npm run build| Static
  Nginx -->|/api/*| API[FastAPI / Uvicorn :8000]
  API --> DB[(SQLite)]
  API --> Uploads[Local Upload Storage]
```

## Backend Modules

- `app/main.py`: FastAPI application factory, CORS setup, router registration, upload mount, health check.
- `app/api/v1/`: versioned REST API routers.
- `app/models/`: SQLAlchemy ORM models for users, colleges, teams, resources, reviews, notices, likes, reports, and comments.
- `app/schemas/`: Pydantic request and response schemas.
- `app/services/`: domain services, currently centered on authentication and verification code flow.
- `app/storage/`: filesystem storage abstraction.
- `app/utils/`: authentication dependencies and JWT/password utilities.

## Frontend Modules

- `frontend/src/App.tsx`: application routing and top-level page composition.
- `frontend/src/api/`: typed API clients for auth, users, colleges, partitions, teams, and resources.
- `frontend/src/contexts/AuthContext.tsx`: token-backed authentication state.
- `frontend/src/components/layout/`: authenticated, admin, and auth page layouts.
- `frontend/src/components/org/`: organization tree and editable member hierarchy components.
- `frontend/src/components/team/`: team decoration and role-definition editors.
- `frontend/src/pages/admin/`: administrative dashboards and management pages.
- `frontend/src/pages/auth/`: login and registration pages.
- `frontend/src/pages/client/`: student/team/resource-facing application pages.

## API Surface

The active API prefix is `/api/v1`.

- `auth`: registration, verification code, login, current user profile.
- `colleges`: college CRUD.
- `partitions`: hierarchical resource partition management.
- `teams`: team CRUD, decorations, role definitions, members, notices, join requests.
- `users`: user administration and approval.
- `resources`: media resource CRUD, uploads, submission, likes, reports, comments, images.
- `reviews`: pending reviews, review decisions, report resolution.
- `stats`: platform and user statistics.

## Deployment Topology

Nginx serves `static/` directly and proxies API traffic to Uvicorn. Uvicorn runs the ASGI app from `backend/app/main.py` as `app.main:app`. Uploaded files are stored outside the Git repository and exposed through Nginx `/uploads/`.

The `frontend/` directory contains the maintainable React/Vite source. The `static/` directory contains the production static snapshot copied from the running server, including later production CSS/JS refinements that may not be represented by the May 2026 local frontend source tree.
