#!/usr/bin/env python3
"""生成一套用于演示「多版本 / 冲突处理」的测试数据。

可重复执行：先删除 code=DEMO-ROBOT 的库及其文档、版本、冲突、任务。
"""
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timedelta

BASE = "/opt/mingyue/backend"
DB = os.path.join(BASE, "data.db")
UPLOADS = "/opt/mingyue/uploads"
DEMO_CODE = "DEMO-ROBOT"
DEMO_NAME = "演示课程 · 智能机器人（测试数据）"

now = datetime.utcnow()


def ts(days_ago=0, hours_ago=0):
    return (now - timedelta(days=days_ago, hours=hours_ago)).strftime("%Y-%m-%d %H:%M:%S.%f")


conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA foreign_keys=ON")
cur = conn.cursor()
admin = cur.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
admin_id = admin[0] if admin else None

# ---------- 清理旧数据 ----------
old_bases = [r[0] for r in cur.execute(
    "SELECT id FROM kb_bases WHERE code=?", (DEMO_CODE,)).fetchall()]
for bid in old_bases:
    ids = [r[0] for r in cur.execute("SELECT id FROM kb_documents WHERE kb_id=?", (bid,)).fetchall()]
    if ids:
        marks = ",".join("?" * len(ids))
        cur.execute(f"DELETE FROM kb_document_versions WHERE document_id IN ({marks})", ids)
        cur.execute(f"DELETE FROM kb_conflicts WHERE document_id IN ({marks})", ids)
        cur.execute(f"DELETE FROM kb_ingestion_jobs WHERE kb_id=?", (bid,))
    cur.execute("DELETE FROM kb_documents WHERE kb_id=?", (bid,))
    cur.execute("DELETE FROM kb_bases WHERE id=?", (bid,))

# ---------- 演示文件 ----------
demo_dir = os.path.join(UPLOADS, "demo")
os.makedirs(demo_dir, exist_ok=True)


def write_file(name, text):
    path = os.path.join(demo_dir, name)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    data = text.encode("utf-8")
    return f"demo/{name}", len(data), hashlib.sha256(data).hexdigest()


cur.execute(
    """INSERT INTO kb_bases
       (name,kind,code,description,term,owner_id,team_id,is_active,
        class_count,knowledge_count,sync_source,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (DEMO_NAME, "course", DEMO_CODE, "用于演示多版本、冲突识别与处理的模拟数据",
     "2026春", admin_id, None, 1, 3, 12, "", ts(30), ts(0)))
kb_id = cur.lastrowid


def add_doc(title, topic, doc_type="txt"):
    cur.execute(
        """INSERT INTO kb_documents
           (kb_id,title,topic,doc_type,source,source_ref,active_version_id,
            external_id,dataset_id,owner_username,file_status,is_shared,chunk_count,
            created_by,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (kb_id, title, topic, doc_type, "upload", "", None, "", "", "", "ready", 0, 0,
         admin_id, ts(30), ts(0)))
    return cur.lastrowid


def add_version(doc_id, no, fname, text, state, note, days_ago, activated_days=None):
    rel, size, sha = write_file(fname, text)
    cur.execute(
        """INSERT INTO kb_document_versions
           (document_id,version_no,filename,file_path,file_size,mime,sha256,
            extracted_text,text_length,meta,state,note,created_by,created_at,
            activated_at,deactivated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (doc_id, no, fname, rel, size, "text/plain", sha, text, len(text),
         json.dumps({"pages": 1, "demo": True}, ensure_ascii=False), state, note,
         admin_id, ts(days_ago),
         ts(activated_days) if state == "active" else None,
         ts(days_ago) if state in ("superseded", "archived") else None))
    return cur.lastrowid


# 文档 1：三个历史版本 + 一个待生效新版本（open 冲突，可点“采用新版本”）
text_v1 = """第1章 机器人运动学基础
1.1 坐标变换
本节介绍齐次变换矩阵、旋转矩阵与平移向量的基本定义。
1.2 D-H 参数法
采用标准 D-H 参数建立连杆坐标系，每个连杆有四个参数。
1.3 正运动学
给定关节角，求解末端执行器位姿。
"""
text_v2 = """第1章 机器人运动学基础
1.1 坐标变换
本节介绍齐次变换矩阵、旋转矩阵与平移向量的基本定义，并补充欧拉角与四元数。
1.2 D-H 参数法
采用标准 D-H 参数与改进 D-H 参数两种建模方式，给出参数表。
1.3 正运动学
给定关节角，通过连杆变换连乘求解末端位姿。
1.4 逆运动学
新增解析法与数值法（雅可比迭代）两种求解思路。
"""
text_v3 = """第1章 机器人运动学基础
1.1 坐标变换
齐次变换矩阵、旋转矩阵、平移向量；欧拉角与四元数的相互转换。
1.2 D-H 参数法
标准 D-H 与改进 D-H 对照表，含典型六轴机械臂参数示例。
1.3 正运动学
连杆变换连乘，给出 UR5 的末端位姿算例。
1.4 逆运动学
解析法（几何法）与数值法（雅可比伪逆迭代），讨论奇异位形。
1.5 动力学基础
新增拉格朗日方程与牛顿-欧拉递推，给出二连杆动力学方程。
"""
text_v4 = """第1章 机器人运动学基础
1.1 坐标变换
齐次变换矩阵、旋转矩阵、平移向量；欧拉角与四元数互转，补充轴角表示。
1.2 D-H 参数法
标准 D-H 与改进 D-H 对照表，六轴机械臂参数示例（UR5、Franka）。
1.3 正运动学
连杆变换连乘，UR5 末端位姿算例与 MATLAB 验证。
1.4 逆运动学
解析法、数值法；奇异位形判定与阻尼最小二乘。
1.5 动力学基础
拉格朗日方程、牛顿-欧拉递推；二连杆动力学推导与仿真。
1.6 轨迹规划
新增关节空间与笛卡尔空间轨迹规划，梯形速度与 S 型曲线。
"""

d1 = add_doc("机器人运动学与动力学", "运动学")
v1 = add_version(d1, 1, "robotics_v1.txt", text_v1, "superseded", "初版讲义", 28, 28)
v2 = add_version(d1, 2, "robotics_v2.txt", text_v2, "superseded", "补充逆运动学", 14, 14)
v3 = add_version(d1, 3, "robotics_v3.txt", text_v3, "active", "补充动力学章节", 3, 3)
v4 = add_version(d1, 4, "robotics_v4.txt", text_v4, "pending", "新增轨迹规划章节（待审核）", 0)
cur.execute("UPDATE kb_documents SET active_version_id=?, chunk_count=3 WHERE id=?", (v3, d1))

cur.execute(
    """INSERT INTO kb_conflicts
       (kb_id,document_id,new_version_id,base_version_id,kind,severity,summary,detail,
        status,resolution,resolution_note,resolved_by,created_at,resolved_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (kb_id, d1, v4, v3, "content_diff", "high",
     "新版本 v4 与当前有效版本 v3 相比：新增 1 节（轨迹规划），修改 4 处表述，相似度 78%",
     json.dumps({
         "similarity": 0.78, "added": 6, "removed": 1,
         "sample": " 1.5 动力学基础\n- 拉格朗日方程与牛顿-欧拉递推\n+ 拉格朗日方程、牛顿-欧拉递推；二连杆动力学推导与仿真\n+ 1.6 轨迹规划\n+ 关节空间与笛卡尔空间轨迹规划，梯形速度与 S 型曲线"
     }, ensure_ascii=False),
     "open", "", "", None, ts(0), None))

# 文档 2/3：完全相同的文件 -> duplicate 冲突
text_dup = """传感器标定作业指导书
一、准备工作
1. 检查 IMU 与相机固定支架是否松动。
2. 预热设备 10 分钟。
二、标定步骤
1. 采集 30 组静态数据，计算零偏。
2. 使用棋盘格完成相机内参标定。
3. 联合标定外参，重投影误差需小于 0.5 像素。
三、验收标准
重投影误差 < 0.5px，IMU 零偏漂移 < 0.02°/s。
"""
d2 = add_doc("传感器标定作业指导书", "标定")
v2a = add_version(d2, 1, "calib_main.txt", text_dup, "active", "首版", 9, 9)
cur.execute("UPDATE kb_documents SET active_version_id=? WHERE id=?", (v2a, d2))

d3 = add_doc("传感器标定作业指导书（重复上传）", "标定")
v3a = add_version(d3, 1, "calib_copy.txt", text_dup, "active", "重复上传的同一文件", 2, 2)
cur.execute("UPDATE kb_documents SET active_version_id=? WHERE id=?", (v3a, d3))

cur.execute(
    """INSERT INTO kb_conflicts
       (kb_id,document_id,new_version_id,base_version_id,kind,severity,summary,detail,
        status,resolution,resolution_note,resolved_by,created_at,resolved_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (kb_id, d3, v3a, v2a, "duplicate", "medium",
     "与《传感器标定作业指导书》的文件内容完全相同（sha256 一致），判定为重复资料",
     json.dumps({"sha256_prefix": hashlib.sha256(text_dup.encode()).hexdigest()[:16]},
                ensure_ascii=False),
     "open", "", "", None, ts(1), None))

# 文档 4/5：同名不同内容 -> title_clash
text_exp_a = """实验一 直流电机闭环调速
目的：掌握 PID 参数整定方法。
步骤：搭建电机-编码器实验台，阶跃给定 1000rpm，记录响应曲线。
要求：超调 < 10%，调节时间 < 0.5s。
"""
text_exp_b = """实验一 直流电机闭环调速（2026 修订版）
目的：掌握 PID 与串级控制的整定方法。
步骤：搭建实验台，分别测试 P、PI、PID 三组参数，记录阶跃响应。
要求：超调 < 8%，调节时间 < 0.4s，并提交参数整定报告。
"""
d4 = add_doc("实验指导书", "实验")
v4a = add_version(d4, 1, "exp_guide_2025.txt", text_exp_a, "active", "2025 版", 20, 20)
cur.execute("UPDATE kb_documents SET active_version_id=? WHERE id=?", (v4a, d4))

d5 = add_doc("实验指导书", "实验")
v5a = add_version(d5, 1, "exp_guide_2026.txt", text_exp_b, "active", "2026 修订版", 1, 1)
cur.execute("UPDATE kb_documents SET active_version_id=? WHERE id=?", (v5a, d5))

cur.execute(
    """INSERT INTO kb_conflicts
       (kb_id,document_id,new_version_id,base_version_id,kind,severity,summary,detail,
        status,resolution,resolution_note,resolved_by,created_at,resolved_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (kb_id, d5, v5a, v4a, "title_clash", "low",
     "同一知识库内出现同名文档《实验指导书》，但内容不同（2025 版 vs 2026 修订版）",
     json.dumps({"title": "实验指导书", "similarity": 0.62}, ensure_ascii=False),
     "open", "", "", None, ts(1), None))

# 已处理冲突示例（resolved）
cur.execute(
    """INSERT INTO kb_conflicts
       (kb_id,document_id,new_version_id,base_version_id,kind,severity,summary,detail,
        status,resolution,resolution_note,resolved_by,created_at,resolved_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (kb_id, d1, v3, v2, "content_diff", "medium",
     "v3 与 v2 相比新增动力学章节，相似度 65%",
     json.dumps({"similarity": 0.65, "added": 4, "removed": 0}, ensure_ascii=False),
     "resolved", "keep_new", "已确认采用 v3，v2 置为 superseded", admin_id, ts(3), ts(3)))

# ---------- 处理流水线任务 ----------
jobs = [
    ("robotics_v4.txt", "upload", "done", 100, "解析完成：2.1 KB，识别 6 个小节"),
    ("calib_copy.txt", "upload", "failed", 40, "解析失败：文件编码不是 UTF-8（演示）"),
    ("exp_guide_2026.txt", "upload", "done", 100, "解析完成：与同名文档比对，登记 1 条标题冲突"),
]
for fn, src, status, progress, msg in jobs:
    cur.execute(
        """INSERT INTO kb_ingestion_jobs
           (kb_id,document_id,version_id,filename,source,status,stage,progress,
            auto_activate,message,created_at,started_at,finished_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (kb_id, None, None, fn, src, status, "done" if status == "done" else "extracting",
         progress, 1, msg, ts(2), ts(2), ts(2)))

conn.commit()
print(json.dumps({
    "kb_id": kb_id, "docs": 5, "versions": 8, "conflicts": 4, "jobs": 3,
}, ensure_ascii=False))
conn.close()
