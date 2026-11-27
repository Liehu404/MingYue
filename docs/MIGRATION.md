# Migration Notes

The legacy deployment remains available as a read-write site while the new `/academic/` deployment
runs from a **snapshot**. The two sites do not synchronize automatically.

## What Is Migrated

| Item | Typical size | Destination |
|---|---|---|
| SQLite database | ~56 MB | `/opt/mingyue-academic/data.db` |
| Uploaded files | ~18 MB, ~100 files | `/opt/mingyue-academic/uploads/` |
| Canvas/FastGPT import data | ~12 MB | `/opt/mingyue-academic/data_import/` |
| Hand-written static pages/assets | ~13 MB | `/opt/mingyue-academic/static/academic/` |

Databases, uploads and `data_import/` are **not** committed to Git.

## Snapshot Procedure

Run on the legacy server while it is still serving:

```bash
sqlite3 /opt/mingyue/backend/data.db ".backup '/tmp/mingyue-data-YYYYMMDD.db'"
sqlite3 /tmp/mingyue-data-YYYYMMDD.db "PRAGMA integrity_check;"
sha256sum /tmp/mingyue-data-YYYYMMDD.db
```

Copy the snapshot, `uploads/` and `data_import/` to the new host, then set ownership:

```bash
sudo chown -R www-data:www-data /opt/mingyue-academic
```

## Verification Counts

After starting the new service, compare table counts with the snapshot. A healthy 2026-11 snapshot
had approximately:

| Table | Rows |
|---|---|
| `users` | 24 |
| `media_resources` | 71 |
| `kb_bases` | 33 |
| `kb_documents` | 77 |
| `kb_document_versions` | 83 |
| `kb_knowledge_points` | 1426 |
| `kb_classes` | 67 |
| `kb_conflicts` | 6 |
| `kb_ingestion_jobs` | 7 |

## Important Boundary

The legacy site stays writable. Anything created there after the snapshot will **not** appear on the
new site. If a single authoritative site is needed later, freeze writes on the legacy site, take a
final backup, diff the two databases, and switch over once.

## Account Identity

The portal's demo accounts and the academic platform's demo accounts use different ID spaces, so the
first SSO login usually creates a new academic account. Existing accounts keep their local
username/password login and their private knowledge bases. Account linking/merging is not part of
this migration; add an explicit mapping table if it becomes necessary.

## Rollback

- Stop and disable `mingyue-academic`.
- Restore the previous nginx configuration and `nginx -t && systemctl reload nginx`.
- Restore the portal template and `kill -HUP` the gunicorn master.
- The legacy deployment at the old address remains untouched and can serve as the final fallback.
