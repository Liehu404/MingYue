#!/usr/bin/env python3
"""明月平台 · 清理 uploads/temp/ 下的孤儿临时文件
背景：/upload 选附件时文件先落到 temp/，提交资源后才归档到团队目录。
      若用户中途放弃提交 → 文件滞留在 temp/。
规则：只删除「超过 TTL 小时」且「未被任何资源/附件/图片引用」的 temp 文件。
用法：python cleanup_temp.py [--ttl 12] [--dry-run]
"""
import argparse
import os
import sqlite3
import time

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/opt/mingyue/uploads")
DB_PATH = os.environ.get("DB_PATH", "/opt/mingyue/backend/data.db")
TEMP_DIR = os.path.join(UPLOAD_DIR, "temp")


def referenced_paths():
    """返回所有被引用的 uploads 相对路径（如 'temp/xxx.png' / '1/xxx.pdf'）。"""
    refs = set()
    con = sqlite3.connect(DB_PATH)
    try:
        queries = [
            "SELECT file_path FROM media_resources WHERE file_path IS NOT NULL",
            "SELECT file_path FROM resource_images WHERE file_path IS NOT NULL",
            "SELECT file_path FROM resource_attachments WHERE file_path IS NOT NULL",
        ]
        for q in queries:
            try:
                for (p,) in con.execute(q):
                    if p:
                        refs.add(p.lstrip("/"))
            except sqlite3.OperationalError:
                pass
    finally:
        con.close()
    return refs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ttl", type=float, default=12, help="保留小时数（默认 12h）")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.isdir(TEMP_DIR):
        print("temp 目录不存在：", TEMP_DIR)
        return

    refs = referenced_paths()
    cutoff = time.time() - args.ttl * 3600
    removed, kept = [], []

    for name in sorted(os.listdir(TEMP_DIR)):
        rel = "temp/" + name
        full = os.path.join(TEMP_DIR, name)
        if not os.path.isfile(full):
            continue
        if rel in refs:
            kept.append((name, "referenced"))
            continue
        if os.path.getmtime(full) > cutoff:
            kept.append((name, "fresh"))
            continue
        if args.dry_run:
            removed.append((name, os.path.getsize(full)))
        else:
            try:
                os.remove(full)
                removed.append((name, 0))
            except OSError as e:
                print("删除失败", name, e)

    total = 0
    for name, size in removed:
        total += size
        print(("would remove " if args.dry_run else "removed ") + name)
    print("--- %s: %d 个文件, %.1f KB；保留 %d 个（引用/未过期）" % (
        "DRY-RUN" if args.dry_run else "DONE", len(removed), total / 1024, len(kept)))


if __name__ == "__main__":
    main()
