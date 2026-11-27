#!/usr/bin/env python3
"""把 education2（Canvas 课程域）的成熟数据导入明月平台 kb_* 表。

用法: python scripts/import_education2.py [edu_export.json] [chunks_export.json]
幂等：先删除 sync_source='canvas' 的课程库及其文档，再重新导入。
"""
import json
import os
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(BASE, "data.db")
EDU = sys.argv[1] if len(sys.argv) > 1 else "/opt/mingyue/data_import/edu_export.json"
CHUNKS = sys.argv[2] if len(sys.argv) > 2 else "/opt/mingyue/data_import/chunks_export.json"

now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.%f")


def ts(v, default=None):
    """EJSON 的日期是 {"$date": ...}，统一转成字符串。"""
    if isinstance(v, dict):
        v = v.get("$date") or v.get("$numberLong")
    if isinstance(v, str) and v:
        return v.replace("T", " ").replace("Z", "")[:26]
    return default or now
edu = json.load(open(EDU, encoding="utf-8"))
chunks = json.load(open(CHUNKS, encoding="utf-8")) if os.path.exists(CHUNKS) else {}

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("PRAGMA foreign_keys=ON")

admin = cur.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
admin_id = admin[0] if admin else None

# ---------- 1. 清理旧的 Canvas 导入 ----------
old_bases = [r[0] for r in cur.execute(
    "SELECT id FROM kb_bases WHERE sync_source='canvas'").fetchall()]
for bid in old_bases:
    doc_ids = [r[0] for r in cur.execute(
        "SELECT id FROM kb_documents WHERE kb_id=?", (bid,)).fetchall()]
    if doc_ids:
        marks = ",".join("?" * len(doc_ids))
        cur.execute(f"DELETE FROM kb_document_versions WHERE document_id IN ({marks})", doc_ids)
        cur.execute(f"DELETE FROM kb_conflicts WHERE document_id IN ({marks})", doc_ids)
    cur.execute("DELETE FROM kb_documents WHERE kb_id=?", (bid,))
    cur.execute("DELETE FROM kb_bases WHERE id=?", (bid,))
cur.execute("DELETE FROM kb_knowledge_points")
cur.execute("DELETE FROM kb_classes")

# ---------- 2. 建立课程目录 ----------
code2name = {}
for c in edu["classes"]:
    if c.get("course_code") and c.get("course_name"):
        code2name[c["course_code"]] = c["course_name"]
# 课程文档里的代码也映射到课程名（补上只有知识点、没有班级的课）
for c in edu["courses"]:
    nm = (c.get("course_name") or "").strip()
    for cl in c.get("courses_list", []):
        code = cl.get("course_code")
        if nm and code and code not in code2name:
            code2name[code] = nm

# 课程名 -> 代码集合
name2codes = defaultdict(set)
for c in edu["courses"]:
    nm = (c.get("course_name") or "").strip()
    if not nm:
        continue
    name2codes[nm]  # 保证存在
    for cl in c.get("courses_list", []):
        if cl.get("course_code"):
            name2codes[nm].add(cl["course_code"])
for code, nm in code2name.items():
    name2codes[nm].add(code)
# 只有知识点、没有班级也没有课程文档的代码，用代码当课程名兜底
for k in edu["knowledges"]:
    code = k.get("course_code") or ""
    if code and code not in code2name:
        code2name[code] = code
        name2codes[code]

# ---------- 3. 班级 ----------
classes_by_name = defaultdict(list)
for c in edu["classes"]:
    nm = code2name.get(c.get("course_code"), c.get("course_name") or "")
    classes_by_name[nm].append(c)
    cur.execute(
        """INSERT INTO kb_classes
           (course_code, course_name, sis_course_id, class_id, term_id,
            student_count, teacher_count, student_list, teacher_list)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (c.get("course_code", ""), nm, c.get("sis_course_id", ""),
         int(c.get("id") or 0), int(c.get("enrollment_term_id") or 0),
         int(c.get("student_count") or 0), int(c.get("teacher_count") or 0),
         json.dumps(c.get("student_list") or [], ensure_ascii=False),
         json.dumps(c.get("teacher_list") or [], ensure_ascii=False)))

# ---------- 4. 知识点（按课程名 + 知识点名去重） ----------
kp_by_name = defaultdict(list)
seen_kp = set()
for k in edu["knowledges"]:
    code = k.get("course_code") or ""
    nm = code2name.get(code, code)
    key = (nm, (k.get("knowledge_name") or "").strip())
    if key in seen_kp:
        continue
    seen_kp.add(key)
    kp_by_name[nm].append(k)
    cur.execute(
        """INSERT INTO kb_knowledge_points
           (course_code, course_name, knowledge_id, name, doc_count)
           VALUES (?,?,?,?,0)""",
        (code, nm, int(k.get("knowledge_id") or 0), k.get("knowledge_name") or ""))

# 知识点表里没有的课程，用课程文档自带的 knowledge_list 补齐
for c in edu["courses"]:
    nm = (c.get("course_name") or "").strip()
    if not nm or kp_by_name.get(nm):
        continue
    for k in c.get("knowledge_list") or []:
        name = (k.get("knowledge_name") or "").strip()
        if not name or (nm, name) in seen_kp:
            continue
        seen_kp.add((nm, name))
        kp_by_name[nm].append(k)
        cur.execute(
            """INSERT INTO kb_knowledge_points
               (course_code, course_name, knowledge_id, name, doc_count)
               VALUES (?,?,?,?,0)""",
            (name2codes.get(nm) and sorted(name2codes[nm])[0] or "",
             nm, int(k.get("knowledge_id") or 0), name))

# ---------- 5. 课程知识库 ----------
name2base = {}
for nm in sorted(name2codes):
    codes = sorted(name2codes[nm])
    terms = sorted({str(c.get("enrollment_term_id")) for c in classes_by_name.get(nm, [])},
                   key=lambda x: int(x) if x.isdigit() else 0)
    kps = kp_by_name.get(nm, [])
    cur.execute(
        """INSERT INTO kb_bases
           (name, kind, code, description, term, owner_id, team_id, is_active,
            class_count, knowledge_count, sync_source, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (nm, "course", ",".join(codes)[:80],
         f"Canvas 同步 · {len(codes)} 个课程代码", ",".join(terms), admin_id, None, 1,
         len(classes_by_name.get(nm, [])), len(kps), "canvas", now, now))
    name2base[nm] = cur.lastrowid

# ---------- 6. 个人知识库 + 文档 ----------
docs = edu["kb_documents"]
by_user = defaultdict(list)
for d in docs:
    by_user[d.get("username") or "unknown"].append(d)

doc_count = 0
user2base = {}
for user, items in by_user.items():
    bname = f"个人知识库_{user}"
    cur.execute(
        """INSERT INTO kb_bases
           (name, kind, code, description, term, owner_id, team_id, is_active,
            class_count, knowledge_count, sync_source, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (bname, "personal", f"personal:{user}", "FastGPT 个人知识库", "", admin_id, None, 1,
         0, 0, "canvas", now, now))
    bid = cur.lastrowid
    user2base[user] = bid

    # 同名文件归并为同一文档的多版本
    groups = defaultdict(list)
    for d in items:
        groups[d.get("filename") or "untitled"].append(d)

    for fn, versions in groups.items():
        versions.sort(key=lambda x: str(x.get("upload_time") or ""))
        cur.execute(
            """INSERT INTO kb_documents
               (kb_id, title, topic, doc_type, source, source_ref, active_version_id,
                external_id, dataset_id, owner_username, file_status, is_shared,
                chunk_count, folder_id, collection_id, name_synced,
                uploaded_at, processed_at, unshared_at,
                created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (bid, fn, "", (versions[0].get("file_type") or "other"), "canvas",
             versions[0].get("doc_id") or "", None,
             versions[0].get("doc_id") or "", versions[0].get("dataset_id") or "",
             user, versions[0].get("status") or "", 1 if versions[0].get("shared") else 0,
             int(versions[0].get("chunk_count") or 0),
             versions[0].get("folder_id"), versions[0].get("collection_id"),
             1 if versions[0].get("name_synced") else 0,
             ts(versions[0].get("upload_time")), ts(versions[0].get("processed_at")),
             ts(versions[0].get("unshared_at")) if versions[0].get("unshared_at") else None,
             admin_id, now, now))
        did = cur.lastrowid

        active_vid = None
        for idx, v in enumerate(versions, start=1):
            ds = v.get("dataset_id") or ""
            text = "\n\n".join(chunks.get(ds, []))
            state = "active" if idx == len(versions) else "superseded"
            cur.execute(
                """INSERT INTO kb_document_versions
                   (document_id, version_no, filename, file_path, file_size, mime,
                    sha256, extracted_text, text_length, meta, state, note,
                    created_by, created_at, activated_at, deactivated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (did, idx, v.get("filename") or fn, "", int(v.get("file_size") or 0),
                 v.get("file_type") or "", "",
                 text, len(text),
                 json.dumps({"dataset_id": ds, "chunk_count": v.get("chunk_count"),
                             "status": v.get("status"),
                             "upload_time": v.get("upload_time")}, ensure_ascii=False),
                 state, "Canvas 同步导入",
                 admin_id, ts(v.get("upload_time")),
                 ts(v.get("processed_at")) if state == "active" else None,
                 None if state == "active" else now))
            if state == "active":
                active_vid = cur.lastrowid
        cur.execute("UPDATE kb_documents SET active_version_id=? WHERE id=?",
                    (active_vid, did))
        doc_count += 1


# ---------- 7. 共享知识库（FastGPT dataset: 共享知识库） ----------
SHARED = "/opt/mingyue/data_import/shared_kb.json"
shared_extra = 0
try:
    sh = json.load(open(SHARED, encoding="utf-8"))
except Exception:  # noqa: BLE001
    sh = {}

if sh.get("collections"):
    cur.execute(
        """INSERT INTO kb_bases
           (name, kind, code, description, term, owner_id, team_id, is_active,
            class_count, knowledge_count, sync_source, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("共享知识库", "shared", "shared", "FastGPT 共享知识库（用户共享文档）", "",
         admin_id, None, 1, 0, 0, "canvas", now, now))
    sbid = cur.lastrowid

    # collection_id -> 上传者
    owner_by_coll = {}
    for d in docs:
        if d.get("collection_id"):
            owner_by_coll[str(d["collection_id"])] = (d.get("username") or "",
                                                      d.get("file_size") or 0,
                                                      d.get("file_type") or "",
                                                      d.get("status") or "")
    for d in (edu.get("kb_shared_documents") or []):
        if d.get("collection_id"):
            owner_by_coll[str(d["collection_id"])] = (d.get("uploader") or "",
                                                      d.get("file_size") or 0,
                                                      d.get("file_type") or "",
                                                      d.get("status") or "")

    owner_by_name = {}
    for d in docs:
        if d.get("filename"):
            owner_by_name[d["filename"]] = d.get("username") or ""
    for d in (edu.get("kb_shared_documents") or []):
        if d.get("filename"):
            owner_by_name[d["filename"]] = d.get("uploader") or ""

    for col in sh["collections"]:
        cid = col["id"]
        name = (col.get("name") or "untitled").replace("【用户共享】", "")
        user, size, ftype, status = owner_by_coll.get(cid, ("", 0, "", "ready"))
        if not user:
            user = owner_by_name.get(name, "")
        text = "\n\n".join(sh["chunks"].get(cid, []))
        cur.execute(
            """INSERT INTO kb_documents
               (kb_id, title, topic, doc_type, source, source_ref, active_version_id,
                external_id, dataset_id, owner_username, file_status, is_shared,
                chunk_count, collection_id, name_synced, uploaded_at, processed_at,
                created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (sbid, name, "", ftype or "other", "canvas", "", None,
             "shared:" + cid, "69c0cbbc799878a22bccad22", user, status, 1,
             len(sh["chunks"].get(cid, [])), cid, 1, now, now,
             admin_id, now, now))
        did = cur.lastrowid
        cur.execute(
            """INSERT INTO kb_document_versions
               (document_id, version_no, filename, file_path, file_size, mime, sha256,
                extracted_text, text_length, meta, state, note, created_by,
                created_at, activated_at, deactivated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (did, 1, name, "", int(size or 0), ftype or "", "", text, len(text),
             json.dumps({"dataset_id": "69c0cbbc799878a22bccad22",
                         "collection_id": cid,
                         "chunk_count": len(sh["chunks"].get(cid, []))},
                        ensure_ascii=False),
             "active", "共享知识库同步", admin_id, now, now, None))
        cur.execute("UPDATE kb_documents SET active_version_id=? WHERE id=?",
                    (cur.lastrowid, did))
        shared_extra += 1

conn.commit()
stat = {
    "shared_docs": shared_extra,
    "courses": len(name2base),
    "classes": len(edu["classes"]),
    "knowledge_points": len(edu["knowledges"]),
    "docs": doc_count,
    "personal_bases": len(by_user),
}
print(json.dumps(stat, ensure_ascii=False))
conn.close()
