# 明月学术交流平台

明月学术交流平台是一个面向学院、团队和学习资源协作的 Web 应用。当前仓库由线上服务器整理而来，包含正在运行的 FastAPI 后端源码、生产静态前端构建产物、部署模板和运维文档。

## Repository Layout

```text
.
├── backend/              # FastAPI application
│   ├── app/              # API routes, models, schemas, services, storage adapters
│   ├── requirements.txt  # Python runtime dependencies
│   └── .env.example      # Backend environment template
├── frontend/             # React + TypeScript source application
│   ├── src/              # Pages, components, API clients, auth context
│   └── package-lock.json # Reproducible frontend dependency lockfile
├── deploy/               # Nginx and systemd deployment templates
├── docs/                 # Architecture, deployment, and security notes
└── static/               # Current deployed Vite build artifacts served by Nginx
```

## Runtime Stack

- Backend: FastAPI, Uvicorn, SQLAlchemy async, Pydantic Settings
- Frontend: React, TypeScript, Vite, React Router, Framer Motion, dnd-kit
- Database: SQLite through `sqlite+aiosqlite`
- Auth: JWT bearer tokens and bcrypt password hashing
- Web serving: Nginx static files with `/api/` reverse proxy to Uvicorn
- Upload storage: local filesystem under `UPLOAD_DIR`

## Local Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend health endpoint is available at:

```text
GET /api/health
```

API routes are mounted under:

```text
/api/v1
```

## Frontend Static Assets

The `static/` directory contains the current deployed Vite build artifacts copied from production. The maintainable frontend source is in `frontend/`.

```bash
cd frontend
npm ci
npm run build
```

The output is written to `frontend/dist/`. Production deployment should publish the built files to `/opt/mingyue/static`.

## Deployment

Use the templates in `deploy/`:

- `deploy/nginx/mingyue.conf`
- `deploy/systemd/mingyue.service`
- `deploy/systemd/mingyue.env.example`

See `docs/DEPLOYMENT.md` for the full deployment flow.

## Security Notes

Runtime databases, uploads, virtual environments, caches, and local `.env` files are intentionally excluded from Git. Before deploying or making the repository public, review `docs/SECURITY.md`.
