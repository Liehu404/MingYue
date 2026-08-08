# Security Notes

## Excluded from Git

- SQLite databases: `*.db`, `*.sqlite`, `*.sqlite3`
- Uploaded user files: `uploads/`
- Virtual environments: `venv/`, `.venv/`
- Local environment files: `.env`, `.env.*`
- Python caches and test artifacts

## Required Runtime Secrets

- `SECRET_KEY`: used to sign JWT access tokens. Generate a strong unique value per environment.
- `SUPER_ADMIN_PASSWORD`: required only when `SEED_SUPER_ADMIN=true`.

## Bootstrap Admin

The application no longer seeds a super administrator by default. To create a bootstrap administrator, set:

```env
SEED_SUPER_ADMIN=true
SUPER_ADMIN_PASSWORD=<strong-temporary-password>
```

After the first controlled bootstrap, set `SEED_SUPER_ADMIN=false` and rotate the temporary password from the application.

## Known Follow-Up Items

- Replace the development verification-code logging flow with a production SMS provider.
- Review API responses that expose development-only verification codes.
- Add automated tests around authorization, uploads, and review workflows.
- Consider migrating from SQLite to PostgreSQL if concurrent writes or auditability become important.
