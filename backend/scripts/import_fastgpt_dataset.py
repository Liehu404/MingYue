#!/usr/bin/env python3
"""把指定 FastGPT dataset 导入到某个知识库（一个 collection = 一个文档）。

用法: python import_fastgpt_dataset.py <dataset_id> <kb_id> <dataset_json> [dataset_name]
"""
import json
import sqlite3
import sys
from datetime import datetime

BASE = "/opt/mingyue/backend"
DB = BASE + "/data.db"
now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.%f")

ds_id, kb_id, path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
ds_name = sys.argv[4] if len(sys.argv) > 4 else "FastGPT 数据集"

data = json.load(open(path, encoding="utf-8"))
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA foreign_keys=ON")
cur = conn.cursor()
admin = cur.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
admin_id = admin[0] if admin else None

old = [r[0] for r in cur.execute(
    "SELECT id FROM kb_documents WHERE kb_id=? AND dataset_id=?", (kb_id, ds_id)).fetchall()]
if old:
    marks = ",".join("?" * len(old))
    cur.execute(f"DELETE FROM kb_document_versions WHERE document_id IN ({marks})", old)
    cur.execute(f"DELETE FROM kb_documents WHERE id IN ({marks})", old)

count = 0
for col in data.get("collections", []):
    cid = col["id"]
    name = (col.get("name") or "untitled").replace("【用户共享】", "")
    chunks = data.get("chunks", {}).get(cid, [])
    text = "\n\n".join(chunks)
    cur.execute(
        """INSERT INTO kb_documents
           (kb_id,title,topic,doc_type,source,source_ref,active_version_id,external_id,
            dataset_id,owner_username,file_status,is_shared,chunk_count,collection_id,
            name_synced,created_by,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (kb_id, name, "", "other", "api", "", None, "fg:" + cid, ds_id, "",
         "ready", 0, len(chunks), cid, 1, admin_id, now, now))
    did = cur.lastrowid
    cur.execute(
        """INSERT INTO kb_document_versions
           (document_id,version_no,filename,file_path,file_size,mime,sha256,extracted_text,
            text_length,meta,state,note,created_by,created_at,activated_at,deactivated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (did, 1, name, "", 0, "", "", text, len(text),
         json.dumps({"dataset_id": ds_id, "collection_id": cid,
                     "chunk_count": len(chunks)}, ensure_ascii=False),
         "active", f"FastGPT 同步 · {ds_name}", admin_id, now, now, None))
    cur.execute("UPDATE kb_documents SET active_version_id=? WHERE id=?", (cur.lastrowid, did))
    count += 1

conn.commit()
print(json.dumps({"docs": count}, ensure_ascii=False))
conn.close()
