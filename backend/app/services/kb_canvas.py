"""Canvas（education2）数据同步：经校园网隧道拉取并导入明月 kb_* 表。

链路：明月(公网) -> 127.0.0.1:1080 (SSH 反向 SOCKS) -> gpu4(180.85.206.21) -> MongoDB
依赖：ubuntu 用户的 /home/ubuntu/.ssh/gpu4_ed25519 已在 gpu4 root 上授权。
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys

from app.config import settings

DATA_DIR = settings.KB_DATA_DIR
EDU_JSON = os.path.join(DATA_DIR, "edu_export.json")
CHUNK_JSON = os.path.join(DATA_DIR, "chunks_export.json")
COURSE_DS_JSON = os.path.join(DATA_DIR, "course_datasets.json")
SHARED_DS_ID = "69c0cbbc799878a22bccad22"   # FastGPT「共享知识库」dataset
SHARED_JSON = os.path.join(DATA_DIR, "shared_kb.json")
SSH_KEY = "/home/ubuntu/.ssh/gpu4_ed25519"
REMOTE = "root@180.85.206.21"
IMPORT_SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "scripts", "import_education2.py")
ATTACH_SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "scripts", "attach_course_datasets.py")

SSH_OPTS = [
    "ssh", "-i", SSH_KEY,
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=15",
    "-o", "ProxyCommand=nc -X 5 -x 127.0.0.1:1080 %h %p",
]

EXPORT_EDU = r"""cd /home/zgllm/test_server
set -a; . ./.env; set +a
mongosh "mongodb://$MONGO_HOST:$MONGO_PORT/education2?authSource=admin" \
  -u "$MONGO_USER" -p "$MONGO_PASSWORD" --quiet --eval '
const out={
 courses: db.courses.find({}).toArray(),
 classes: db.classes.find({}).toArray(),
 knowledges: db.knowledges.find({}).toArray(),
 kb_documents: db.kb_documents.find({}).toArray(),
 kb_shared_documents: db.kb_shared_documents.find({}).toArray()
};
print(EJSON.stringify(out));
'
"""

EXPORT_CHUNKS_TMPL = r"""cd /home/zgllm/test_server
set -a; . ./.env; set +a
URI=$(grep -m1 '^FASTGPT_MONGO_URI=' .env | cut -d= -f2-)
mongosh "$URI" --quiet --eval '
const ids=[__IDS__].map(x=>new ObjectId(x));
const o={};
ids.forEach(id=>{o[id]=db.dataset_datas.find({datasetId:id},{q:1,_id:0}).toArray().map(d=>d.q)});
print(EJSON.stringify(o));
'
"""


EXPORT_COURSE_DS = r"""cd /home/zgllm/test_server
set -a; . ./.env; set +a
URI=$(grep -m1 '^FASTGPT_MONGO_URI=' .env | cut -d= -f2-)
mongosh "$URI" --quiet --eval '
const ds=db.datasets.find({name:/-(课程知识点|课程基本信息)$/},{name:1}).toArray();
const out={datasets:ds.map(d=>({id:String(d._id),name:d.name}))};
const chunks={};
ds.forEach(d=>{chunks[String(d._id)]=db.dataset_datas.find({datasetId:d._id},{q:1,_id:0}).toArray().map(x=>x.q)});
out.chunks=chunks;
print(EJSON.stringify(out));
'
"""


EXPORT_SHARED_TMPL = r"""cd /home/zgllm/test_server
set -a; . ./.env; set +a
URI=$(grep -m1 '^FASTGPT_MONGO_URI=' .env | cut -d= -f2-)
mongosh "$URI" --quiet --eval '
const id=new ObjectId("__ID__");
const cols=db.dataset_collections.find({datasetId:id},{name:1,type:1,fileId:1}).toArray();
const out={collections:cols.map(c=>({id:String(c._id),name:c.name,type:c.type})),chunks:{}};
db.dataset_datas.find({datasetId:id},{collectionId:1,q:1,_id:0}).forEach(d=>{
  const k=String(d.collectionId||"");
  (out.chunks[k]=out.chunks[k]||[]).push(d.q);
});
print(EJSON.stringify(out));
'
"""


def tunnel_alive(host: str = "127.0.0.1", port: int = 1080, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _run(remote_cmd: str, out_path: str) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(out_path, "wb") as fh:
        proc = subprocess.run(
            SSH_OPTS + [REMOTE, remote_cmd],
            stdout=fh, stderr=subprocess.PIPE, timeout=240,
        )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "ignore")[-400:] or f"ssh 退出码 {proc.returncode}")
    if os.path.getsize(out_path) < 100:
        raise RuntimeError("导出的数据为空")


def pull_and_import() -> dict:
    if not tunnel_alive():
        raise RuntimeError("校园网隧道未连接（127.0.0.1:1080 不在监听）")

    _run(EXPORT_EDU, EDU_JSON)

    # 数据集 id 来自 education2（FastGPT 库里没有 kb_documents 集合）
    try:
        edu_data = json.load(open(EDU_JSON, encoding="utf-8"))
        ids = set()
        for d in edu_data.get("kb_documents") or []:
            if d.get("dataset_id"):
                ids.add(d["dataset_id"])
        for d in edu_data.get("kb_shared_documents") or []:
            if d.get("shared_dataset_id"):
                ids.add(d["shared_dataset_id"])
        id_list = ",".join('"%s"' % i for i in sorted(ids))
        _run(EXPORT_CHUNKS_TMPL.replace("__IDS__", id_list), CHUNK_JSON)
    except Exception as exc:  # noqa: BLE001 - 正文拉不到也要导入元数据
        with open(CHUNK_JSON, "w", encoding="utf-8") as fh:
            fh.write("{}")

    # 共享知识库数据集
    try:
        _run(EXPORT_SHARED_TMPL.replace("__ID__", SHARED_DS_ID), SHARED_JSON)
    except Exception:  # noqa: BLE001
        pass

    proc = subprocess.run(
        [sys.executable, IMPORT_SCRIPT, EDU_JSON, CHUNK_JSON],
        capture_output=True, timeout=300,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "ignore")[-500:])
    stats = json.loads(proc.stdout.decode("utf-8", "ignore").strip().splitlines()[-1])

    # 课程知识点/基本信息数据集（可选，失败不影响主体导入）
    try:
        _run(EXPORT_COURSE_DS, COURSE_DS_JSON)
        subprocess.run([sys.executable, ATTACH_SCRIPT], capture_output=True, timeout=300)
        stats["course_datasets"] = "ok"
    except Exception as exc:  # noqa: BLE001
        stats["course_datasets"] = f"skipped: {exc}"[:200]

    stats["synced_at"] = __import__("datetime").datetime.now().isoformat(timespec="seconds")
    return stats


STATE_FILE = os.path.join(DATA_DIR, "canvas_sync_state.json")
_RUNNING = {"flag": False}


def last_sync_info() -> dict:
    try:
        return json.load(open(STATE_FILE, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _write_state(payload: dict) -> None:
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)
    except OSError:
        pass


def maybe_auto_sync(interval_sec: int = 1800) -> dict | None:
    """隧道在线且距上次成功同步超过 interval 时自动拉一次。

    返回 None 表示本次跳过（隧道离线 / 未到时间 / 正在跑）。
    """
    if _RUNNING["flag"]:
        return None
    if not tunnel_alive():
        return None
    info = last_sync_info()
    if info.get("ok"):
        try:
            from datetime import datetime as _dt
            last = _dt.fromisoformat(info.get("synced_at"))
            if (_dt.now() - last).total_seconds() < interval_sec:
                return None
        except Exception:  # noqa: BLE001
            pass
    _RUNNING["flag"] = True
    try:
        stats = pull_and_import()
        _write_state({"ok": True, **stats})
        return stats
    except Exception as exc:  # noqa: BLE001
        _write_state({"ok": False, "error": str(exc)[:300],
                      "synced_at": __import__("datetime").datetime.now().isoformat(timespec="seconds")})
        raise
    finally:
        _RUNNING["flag"] = False


FG_SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "scripts", "import_fastgpt_dataset.py")


def sync_fastgpt_dataset(kb_id: int, dataset_id: str, dataset_name: str = "") -> dict:
    """拉取一个 FastGPT dataset（collection=文档）并导入指定知识库。"""
    if not tunnel_alive():
        raise RuntimeError("校园网隧道未连接（127.0.0.1:1080 不在监听）")
    out = os.path.join(DATA_DIR, f"fg_{dataset_id}.json")
    _run(EXPORT_SHARED_TMPL.replace("__ID__", dataset_id), out)
    proc = subprocess.run(
        [sys.executable, FG_SCRIPT, dataset_id, str(kb_id), out, dataset_name],
        capture_output=True, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "ignore")[-400:])
    return json.loads(proc.stdout.decode("utf-8", "ignore").strip().splitlines()[-1])


if __name__ == "__main__":
    print(json.dumps(pull_and_import(), ensure_ascii=False, indent=2))
