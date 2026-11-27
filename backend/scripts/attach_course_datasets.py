#!/usr/bin/env python3
"""把 FastGPT 里按课程命名的数据集挂到对应课程知识库，作为课程文档。

输入: course_datasets.json = {datasets:[{id,name}], chunks:{dataset_id:[text,...]}}
"""
import json
import os
import sqlite3
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(BASE, "data.db")
SRC = "/opt/mingyue/data_import/course_datasets.json"
now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.%f")

data = json.load(open(SRC, encoding="utf-8"))
kinds = {"课程知识点": ("课程知识点（Canvas）", "dataset"), "课程基本信息": ("课程基本信息（Canvas）", "meta")}

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
admin = cur.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
admin_id = admin[0] if admin else None

bases = {r["name"]: r["id"] for r in cur.execute(
    "SELECT id,name FROM kb_bases WHERE kind='course' AND sync_source='canvas'")}

attached = 0
for ds in data["datasets"]:
    name = ds["name"]
    if "-" not in name:
        continue
    course, suffix = name.rsplit("-", 1)
    if suffix not in kinds or course not in bases:
        continue
    bid = bases[course]
    title, dtype = kinds[suffix]
    chunks = data["chunks"].get(ds["id"]) or []
    text = "\n\n".join(chunks)

    cur.execute("DELETE FROM kb_documents WHERE kb_id=? AND external_id=?", (bid, "ds:" + ds["id"]))
    cur.execute(
        """INSERT INTO kb_documents
           (kb_id,title,topic,doc_type,source,source_ref,active_version_id,external_id,
            dataset_id,owner_username,file_status,is_shared,chunk_count,created_by,
            created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (bid, title, "", dtype, "canvas", "", None, "ds:" + ds["id"], ds["id"], "",
         "ready", 1, len(chunks), admin_id, now, now))
    did = cur.lastrowid
    cur.execute(
        """INSERT INTO kb_document_versions
           (document_id,version_no,filename,file_path,file_size,mime,sha256,extracted_text,
            text_length,meta,state,note,created_by,created_at,activated_at,deactivated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (did, 1, title, "", 0, "text/plain", "", text, len(text),
         json.dumps({"dataset_id": ds["id"], "chunks": len(chunks)}, ensure_ascii=False),
         "active", "FastGPT 课程数据集同步", admin_id, now, now, None))
    cur.execute("UPDATE kb_documents SET active_version_id=? WHERE id=?", (cur.lastrowid, did))
    cur.execute("UPDATE kb_bases SET knowledge_count=knowledge_count WHERE id=?", (bid,))
    attached += 1

conn.commit()
print(json.dumps({"attached": attached}, ensure_ascii=False))
conn.close()
