# 明月学术交流平台

明月学术交流平台是面向明月班学习全过程的资源交流与知识沉淀 Web 应用。仓库包含 FastAPI 后端、React + TypeScript 前端源码、线上构建产物、部署模板和运维文档。

## Repository Layout

```text
.
├── backend/              # FastAPI application
│   ├── app/              # API routes, models, schemas, services, storage adapters
│   ├── scripts/          # Canvas / FastGPT / 演示数据导入脚本
│   ├── requirements.txt  # Python runtime dependencies
│   └── .env.example      # Backend environment template
├── frontend/             # React + TypeScript source application
│   ├── src/              # Pages, components, API clients, auth context
│   ├── scripts/          # postbuild: inject legacy pages, patch paths, publish to static/
│   └── package-lock.json # Reproducible frontend dependency lockfile
├── static/               # Deployed static site (Vite build + hand-written data/editor pages)
├── deploy/               # Nginx and systemd templates (standalone and /academic)
└── docs/                 # Architecture, deployment, security, migration notes
```

## Runtime Stack

- Backend: FastAPI, Uvicorn, SQLAlchemy async, Pydantic Settings
- Frontend: React, TypeScript, Vite, React Router, Framer Motion, dnd-kit
- Database: SQLite through `sqlite+aiosqlite`
- Auth: JWT bearer tokens and bcrypt password hashing; optional SSO from the model portal
- Web serving: Nginx static files with `/api/` reverse proxy to Uvicorn
- Upload storage: local filesystem under `UPLOAD_DIR`

## Deployment Modes

1. **Standalone**: serve at `/`, e.g. `http://<SERVER_IP>/`, API under `/api/v1`.
2. **Merged into the model portal**: serve at `https://mingyueai.cqu.edu.cn/academic/`, API under
   `/academic/api/v1`, with SSO from the portal's Flask session. See `docs/DEPLOYMENT.md`.

The frontend build uses `base=/academic/` in production; `postbuild.mjs` injects the hand-written
legacy pages, patches their absolute paths, and copies the build into `static/`.

## Local Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Health check: `GET /api/health`. API routes are mounted under `/api/v1`.

## Frontend Build

```bash
cd frontend
npm ci
npm run build
```

The build writes `frontend/dist/`. By default it does **not** overwrite `static/`.
The `static/` directory is the current production snapshot (online build + hand-written pages); the
`frontend/` source tree is a parallel variant and rebuilds to a different UI. Before replacing
`static/`, compare pages visually. To publish a source build explicitly:

```bash
cd frontend
STATIC_OUT=../static npm run build
```

Do not delete `static/` wholesale: it also contains `data.html`, `editor.html`, `mingyue-*.js/css`,
vendor libraries, fonts and images.

## Deployment

Use the templates in `deploy/`:

- Standalone: `deploy/nginx/mingyue.conf`, `deploy/systemd/mingyue.service`
- Model portal subpath: `deploy/nginx/mingyue-academic.location.conf`,
  `deploy/systemd/mingyue-academic.service`, `deploy/systemd/mingyue-academic.env.example`

See `docs/DEPLOYMENT.md` and `docs/MIGRATION.md` for the full flow.

## Security Notes

Runtime databases, uploads, `data_import/`, virtual environments, caches and local `.env` files are
excluded from Git. This repository is public: never commit student data, uploads, real secrets or
test-account credentials. Before deploying, review `docs/SECURITY.md`.
