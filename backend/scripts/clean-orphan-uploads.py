#!/usr/bin/env python3
"""清理 uploads/temp 下未被任何资源引用的孤儿文件。

用途：上传接口会把文件先落在 uploads/temp/，正常发布时会被归档到 uploads/{team_id}/。
若上传后未发布（用户中途放弃），文件会遗留在 temp/，长期累积占用磁盘。

默认 dry-run（只列出，不删除）；确认后加 --apply 才真正删除。

用法：
    ./venv/bin/python scripts/clean-orphan-uploads.py            # 预览
    ./venv/bin/python scripts/clean-orphan-uploads.py --apply    # 实际删除
"""
import os
import sqlite3
import sys

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(BASE, "backend", "data.db")
TEMP_DIR = os.path.join(BASE, "uploads", "temp")
APPLY = "--apply" in sys.argv


def main() -> int:
    if not os.path.isdir(TEMP_DIR):
        print(f"目录不存在：{TEMP_DIR}")
        return 1

    con = sqlite3.connect(DB)
    ref = set()
    for (p,) in con.execute("select file_path from media_resources where file_path is not null"):
        ref.add(p)
    for (p,) in con.execute("select file_path from resource_images where file_path is not null"):
        ref.add(p)
    # 站点配置（管理端「背景配图」）引用的图片也不能删
    try:
        for (v,) in con.execute("select value from site_configs where value is not null and value != ''"):
            import json as _json
            try:
                data = _json.loads(v)
            except Exception:
                continue
            for key in ("backgrounds", "images"):
                node = data.get(key)
                if isinstance(node, dict):
                    urls = node.values()
                elif isinstance(node, list):
                    urls = [i.get("url") for i in node if isinstance(i, dict)]
                else:
                    urls = []
                for u in urls:
                    if isinstance(u, str) and "/uploads/temp/" in u:
                        ref.add(u.split("/uploads/", 1)[-1])
    except sqlite3.OperationalError:
        pass
    con.close()

    orphans, keep, freed = [], 0, 0
    for name in sorted(os.listdir(TEMP_DIR)):
        full = os.path.join(TEMP_DIR, name)
        if not os.path.isfile(full):
            continue
        if f"temp/{name}" in ref:
            keep += 1
            continue
        size = os.path.getsize(full)
        orphans.append((name, size))
        freed += size
        if APPLY:
            os.remove(full)

    print(f"temp/ 中：被引用 {keep} 个，孤儿 {len(orphans)} 个（约 {freed / 1024 / 1024:.2f} MB）")
    for name, size in orphans:
        print(f"  {'已删除' if APPLY else '待删除'}  {name}  ({size} B)")
    if orphans and not APPLY:
        print("\n以上为预览。确认无误后加 --apply 执行删除。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
