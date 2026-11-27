# Security Notes

## Excluded from Git

- SQLite databases and backups: `*.db`, `*.sqlite`, `*.sqlite3`, `*.bak-*`
- Uploaded user files: `uploads/`, `backend/uploads/`, `static/uploads/`
- Canvas/FastGPT import data: `data_import/`
- Virtual environments: `venv/`, `.venv/`
- Local environment files: `.env`, `.env.*`
- Python/Node caches and build artifacts

This repository is public. Never commit student data, uploaded content, real secrets, server IPs with
credentials, or test-account passwords.

## Required Runtime Secrets

- `SECRET_KEY`: signs academic-platform JWTs. Generate a strong unique value per environment.
- The portal's Flask `secret_key` stays in the portal; the academic platform never reads it and never
  stores the portal session cookie.

## SSO Trust Boundary

- The browser calls `/academic/api/v1/auth/sso` on the same origin, so it carries the portal's
  `session` cookie.
- The academic backend forwards only the request's `Cookie` header to the fixed, localhost-only
  `MODEL_SESSION_URL` (`http://127.0.0.1:5002/get_session`). It does not accept a caller-supplied URL.
- A response is treated as logged-in only when it contains a non-empty `username`. `/get_session`
  may return HTTP 200 with `{}` when not logged in.
- Existing accounts are never re-roled or password-reset by SSO. A username that is bound to a
  different student ID returns 409; an inactive account returns 403.
- Set `SSO_ENABLED=false` to disable SSO and fall back to local username/password login.

## Bootstrap Admin

The current production code seeds a super administrator (`admin` / `admin123`) only if no
`super_admin` exists. Change this password immediately after deployment and do not reuse it. The
password is not stored in this repository.

## Known Follow-Up Items

- Replace the development verification-code logging flow with a production SMS provider.
- Review API responses that expose development-only verification codes.
- Restrict CORS (`allow_origins`) to the actual deployment origin.
- Add automated tests around authorization, uploads, SSO account matching and review workflows.
- Consider migrating from SQLite to PostgreSQL if concurrent writes or auditability become important.
