"""插入用于演示和匹配测试的种子数据。

设计目标：
- 6 位候选人覆盖不同行业/岗位方向
- 3 家企业覆盖不同领域
- 5 个岗位，与候选人形成**有区分度**的多对多匹配关系
- 能力字段（derived_capabilities / required_capabilities）手写，避免依赖 LLM

用法（清空并重灌）：
    cd backend
    python -m app.scripts.seed_demo --wipe

默认只在当前库为空时插入（幂等）。
"""

from __future__ import annotations

import argparse
from datetime import date

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.candidate import (
    Candidate,
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
)
from app.models.company import Company
from app.models.position import Position
from app.models.user import User

# ---------------------------------------------------------------------------
# 候选人定义
# ---------------------------------------------------------------------------

CANDIDATES = [
    {
        "name": "张三",
        "phone": "13800000001",
        "email": "zhangsan@example.com",
        "city": "上海",
        "industry": "通用AI",
        "years_of_experience": 8,
        "education_level": "硕士",
        "expected_salary_min": 50,
        "expected_salary_max": 70,
        "skills": ["PyTorch", "DeepSpeed", "Transformer", "LLM", "RLHF", "分布式训练", "CUDA"],
        "derived_capabilities": [
            {"capability": "大规模分布式训练（多机多卡）", "evidence_ref": "字节AI Lab"},
            {"capability": "多模态大模型预训练与 SFT / RLHF 调优", "evidence_ref": "字节AI Lab"},
            {"capability": "大模型评测框架设计", "evidence_ref": "个人开源项目"},
        ],
        "resume_quality_score": 85,
        "experiences": [
            {
                "company_name": "字节跳动 AI Lab",
                "position_title": "高级算法工程师",
                "start_date": date(2021, 7, 1),
                "end_date": None,
                "description": "多模态大模型预训练与 SFT，64卡 A100 分布式训练 pipeline，吞吐提升 2.3x；RLHF 流程落地，准确率 78%→91%。",
            },
            {
                "company_name": "商汤科技",
                "position_title": "计算机视觉工程师",
                "start_date": date(2017, 7, 1),
                "end_date": date(2021, 6, 30),
                "description": "自动驾驶 BEV 感知模型研发；TensorRT 部署，延迟 120ms→38ms，Orin 平台 30FPS。",
            },
        ],
        "projects": [
            {
                "project_name": "多模态大模型评测框架",
                "role": "主要开发者",
                "description": "30+ 任务评测框架，覆盖 VQA、OCR、数学推理，开源 2k+ star",
                "tech_stack": ["Python", "PyTorch", "DeepSpeed", "Gradio"],
            }
        ],
        "educations": [
            {
                "school": "清华大学",
                "degree": "硕士",
                "major": "计算机科学与技术",
                "start_date": date(2014, 9, 1),
                "end_date": date(2017, 6, 30),
            },
        ],
    },
    {
        "name": "李四",
        "phone": "13800000002",
        "email": "lisi@example.com",
        "city": "北京",
        "industry": "通用AI",
        "years_of_experience": 5,
        "education_level": "本科",
        "expected_salary_min": 40,
        "expected_salary_max": 55,
        "skills": ["产品设计", "用户研究", "Figma", "Prompt Engineering", "AI 产品", "数据分析"],
        "derived_capabilities": [
            {"capability": "AI 产品从 0 到 1 的定义与落地", "evidence_ref": "百度文心"},
            {"capability": "LLM 应用场景挖掘与 Prompt 工程", "evidence_ref": "百度文心"},
            {"capability": "B端 AI 产品需求分析与用户研究", "evidence_ref": "百度文心"},
            {"capability": "跨团队协作与技术团队沟通能力", "evidence_ref": "百度文心"},
        ],
        "resume_quality_score": 78,
        "experiences": [
            {
                "company_name": "百度",
                "position_title": "AI 产品经理",
                "start_date": date(2021, 3, 1),
                "end_date": None,
                "description": "文心一言 B 端方向，负责企业智能客服场景落地，服务 30+ 企业客户；主导 Prompt 模板市场产品化，DAU 提升 40%。",
            },
            {
                "company_name": "字节跳动",
                "position_title": "产品经理",
                "start_date": date(2019, 6, 1),
                "end_date": date(2021, 2, 28),
                "description": "内容推荐系统产品化，A/B 实验驱动。",
            },
        ],
        "projects": [],
        "educations": [
            {
                "school": "北京大学",
                "degree": "本科",
                "major": "信息管理与信息系统",
                "start_date": date(2015, 9, 1),
                "end_date": date(2019, 6, 30),
            },
        ],
    },
    {
        "name": "王五",
        "phone": "13800000003",
        "email": "wangwu@example.com",
        "city": "深圳",
        "industry": "自动驾驶",
        "years_of_experience": 3,
        "education_level": "硕士",
        "expected_salary_min": 30,
        "expected_salary_max": 45,
        "skills": ["PyTorch", "C++", "CUDA", "TensorRT", "BEV", "点云", "目标检测"],
        "derived_capabilities": [
            {"capability": "BEV 感知模型设计与训练", "evidence_ref": "小鹏汽车"},
            {"capability": "TensorRT / ONNX 模型部署与量化优化", "evidence_ref": "小鹏汽车"},
            {"capability": "多传感器融合（相机+激光雷达）", "evidence_ref": "毕业课题"},
        ],
        "resume_quality_score": 72,
        "experiences": [
            {
                "company_name": "小鹏汽车",
                "position_title": "计算机视觉算法工程师",
                "start_date": date(2022, 7, 1),
                "end_date": None,
                "description": "BEV 感知与障碍物检测；TensorRT INT8 量化部署，推理延迟 60ms→22ms；量产车型落地。",
            },
        ],
        "projects": [
            {
                "project_name": "多传感器融合 3D 目标检测",
                "role": "主要开发者",
                "description": "相机 + LiDAR 融合的 3D 检测网络，KITTI mAP 提升 4.2%",
                "tech_stack": ["PyTorch", "C++", "ROS"],
            }
        ],
        "educations": [
            {
                "school": "哈尔滨工业大学",
                "degree": "硕士",
                "major": "计算机科学",
                "start_date": date(2019, 9, 1),
                "end_date": date(2022, 6, 30),
            },
        ],
    },
    {
        "name": "赵六",
        "phone": "13800000004",
        "email": "zhaoliu@example.com",
        "city": "上海",
        "industry": "AI医疗",
        "years_of_experience": 10,
        "education_level": "博士",
        "expected_salary_min": 70,
        "expected_salary_max": 100,
        "skills": ["NLP", "BERT", "Transformer", "PyTorch", "医疗NLP", "知识图谱", "Python"],
        "derived_capabilities": [
            {"capability": "医疗文本结构化与知识图谱构建", "evidence_ref": "平安好医生"},
            {"capability": "医学 NLP 大模型微调与领域适配", "evidence_ref": "平安好医生"},
            {"capability": "AI 医疗产品从研究到落地的全链路经验", "evidence_ref": "多段经历"},
            {"capability": "NLP 团队负责人，带 10+ 人团队", "evidence_ref": "平安好医生"},
        ],
        "resume_quality_score": 88,
        "experiences": [
            {
                "company_name": "平安好医生",
                "position_title": "NLP 算法负责人",
                "start_date": date(2019, 3, 1),
                "end_date": None,
                "description": "医疗知识图谱构建，覆盖 30 万病种；电子病历结构化；领域大模型微调，在医疗问答任务上超过 GPT-3.5。",
            },
            {
                "company_name": "阿里健康",
                "position_title": "高级算法工程师",
                "start_date": date(2015, 7, 1),
                "end_date": date(2019, 2, 28),
                "description": "医疗搜索相关性优化，智能问诊 NLU。",
            },
        ],
        "projects": [],
        "educations": [
            {
                "school": "复旦大学",
                "degree": "博士",
                "major": "计算机应用技术",
                "start_date": date(2010, 9, 1),
                "end_date": date(2015, 6, 30),
            },
        ],
    },
    {
        "name": "钱七",
        "phone": "13800000005",
        "email": "qianqi@example.com",
        "city": "杭州",
        "industry": "金融科技",
        "years_of_experience": 2,
        "education_level": "本科",
        "expected_salary_min": 25,
        "expected_salary_max": 35,
        "skills": ["Python", "scikit-learn", "XGBoost", "SQL", "特征工程", "时序模型"],
        "derived_capabilities": [
            {"capability": "金融风控模型开发与特征工程", "evidence_ref": "蚂蚁"},
            {"capability": "大规模样本数据处理与训练流水线", "evidence_ref": "蚂蚁"},
        ],
        "resume_quality_score": 65,
        "experiences": [
            {
                "company_name": "蚂蚁集团",
                "position_title": "机器学习工程师",
                "start_date": date(2022, 7, 1),
                "end_date": None,
                "description": "信贷风控模型研发；XGBoost + LightGBM 特征工程；AUC 提升 0.015。",
            },
        ],
        "projects": [],
        "educations": [
            {
                "school": "浙江大学",
                "degree": "本科",
                "major": "数学与应用数学",
                "start_date": date(2018, 9, 1),
                "end_date": date(2022, 6, 30),
            },
        ],
    },
    {
        "name": "孙八",
        "phone": "13800000006",
        "email": "sunba@example.com",
        "city": "上海",
        "industry": "通用AI",
        "years_of_experience": 6,
        "education_level": "硕士",
        "expected_salary_min": 55,
        "expected_salary_max": 80,
        "skills": ["CUDA", "TensorRT", "vLLM", "Triton", "C++", "大模型推理", "性能优化", "分布式"],
        "derived_capabilities": [
            {"capability": "大模型推理引擎开发与性能优化", "evidence_ref": "旷视 → 智谱"},
            {
                "capability": "KV cache、continuous batching、paged attention 等优化技术实战",
                "evidence_ref": "智谱",
            },
            {"capability": "CUDA kernel 编写与 GPU 性能分析", "evidence_ref": "旷视"},
            {"capability": "多卡张量并行 / 流水并行部署经验", "evidence_ref": "智谱"},
        ],
        "resume_quality_score": 82,
        "experiences": [
            {
                "company_name": "智谱AI",
                "position_title": "推理性能优化工程师",
                "start_date": date(2022, 5, 1),
                "end_date": None,
                "description": "ChatGLM 推理引擎优化；KV cache、continuous batching 落地，吞吐 5x；多卡张量并行部署。",
            },
            {
                "company_name": "旷视",
                "position_title": "高级软件工程师",
                "start_date": date(2018, 7, 1),
                "end_date": date(2022, 4, 30),
                "description": "自研推理框架 kernel 层优化；CUDA 开发，矩阵乘法 kernel 达到 cuBLAS 95%。",
            },
        ],
        "projects": [],
        "educations": [
            {
                "school": "上海交通大学",
                "degree": "硕士",
                "major": "计算机科学",
                "start_date": date(2016, 9, 1),
                "end_date": date(2018, 6, 30),
            },
        ],
    },
]


# ---------------------------------------------------------------------------
# 企业定义
# ---------------------------------------------------------------------------

COMPANIES = [
    {
        "name": "智元无界科技",
        "industry_tags": ["通用AI", "大模型", "多模态"],
        "scale": "20-100",
        "funding_stage": "A",
        "address": "上海市浦东新区张江科学城",
        "website": "https://example-ai.com",
        "contact_name": "李总",
        "contact_phone": "13911112222",
        "cooperation_status": "active",
        "notes": "专注多模态大模型的 AI 创业公司",
    },
    {
        "name": "明日视觉",
        "industry_tags": ["自动驾驶", "计算机视觉"],
        "scale": "100-500",
        "funding_stage": "B",
        "address": "深圳市南山区",
        "website": "https://example-cv.com",
        "contact_name": "王总",
        "contact_phone": "13922223333",
        "cooperation_status": "active",
        "notes": "L4 级自动驾驶感知和决策技术",
    },
    {
        "name": "医智未来",
        "industry_tags": ["AI医疗", "医疗NLP"],
        "scale": "100-500",
        "funding_stage": "C",
        "address": "上海市徐汇区",
        "website": "https://example-med.com",
        "contact_name": "张博士",
        "contact_phone": "13933334444",
        "cooperation_status": "active",
        "notes": "医疗大模型和知识图谱",
    },
]


# ---------------------------------------------------------------------------
# 岗位定义（company_key 指向 COMPANIES 里的 name）
# ---------------------------------------------------------------------------

POSITIONS = [
    {
        "company_name": "智元无界科技",
        "title": "高级AI算法工程师（多模态大模型）",
        "type": "AI算法",
        "responsibilities": (
            "1. 负责多模态大模型（文本+图像）的预训练和 SFT、RLHF 调优；"
            "2. 搭建和优化分布式训练 pipeline，支持多机多卡训练；"
            "3. 参与模型评测框架设计。"
        ),
        "requirements": (
            "1. 计算机/AI 相关硕士及以上学历，5 年以上深度学习算法经验；"
            "2. 熟练掌握 PyTorch/DeepSpeed，有大规模分布式训练实战经验；"
            "3. 有多模态大模型项目经验或 RLHF 落地经验优先。"
        ),
        "required_skills": ["PyTorch", "DeepSpeed", "Transformer", "RLHF", "分布式训练"],
        "nice_to_have_skills": ["CUDA", "TensorRT"],
        "required_capabilities": [
            {"capability": "大规模分布式训练（多机多卡）", "priority": "must"},
            {"capability": "多模态大模型预训练与 SFT / RLHF 调优", "priority": "must"},
            {"capability": "深度学习模型性能优化", "priority": "must"},
            {"capability": "大模型评测框架设计", "priority": "nice"},
            {"capability": "CUDA kernel 开发", "priority": "nice"},
        ],
        "min_years": 3,
        "max_years": 10,
        "required_education": "硕士",
        "salary_min": 45,
        "salary_max": 80,
        "city": "上海",
        "remote_ok": False,
        "headcount": 2,
    },
    {
        "company_name": "智元无界科技",
        "title": "AI 产品经理（大模型方向）",
        "type": "AI产品",
        "responsibilities": (
            "1. 负责大模型 B 端产品从 0 到 1 的定义和规划；"
            "2. 挖掘行业应用场景，设计产品方案并推动落地；"
            "3. 跟踪行业动态，分析竞品并形成产品差异化。"
        ),
        "requirements": (
            "1. 本科及以上学历，3 年以上 AI 产品经验；"
            "2. 熟悉大模型应用生态，有 Prompt 工程或 RAG 落地经验；"
            "3. 出色的跨团队协作和沟通能力。"
        ),
        "required_skills": ["AI 产品", "Prompt Engineering", "用户研究", "数据分析"],
        "nice_to_have_skills": ["RAG", "LLM"],
        "required_capabilities": [
            {"capability": "AI 产品从 0 到 1 的定义与落地", "priority": "must"},
            {"capability": "LLM 应用场景挖掘与 Prompt 工程", "priority": "must"},
            {"capability": "跨团队协作与技术团队沟通能力", "priority": "must"},
            {"capability": "B端产品规划经验", "priority": "nice"},
        ],
        "min_years": 3,
        "max_years": 8,
        "required_education": "本科",
        "salary_min": 35,
        "salary_max": 55,
        "city": "北京",
        "remote_ok": True,
        "headcount": 1,
    },
    {
        "company_name": "明日视觉",
        "title": "计算机视觉算法专家（自动驾驶）",
        "type": "AI算法",
        "responsibilities": (
            "1. 负责 BEV 感知、多传感器融合的算法研发；"
            "2. 推理部署优化，量产车型落地；"
            "3. 与工程团队协同优化 pipeline 延迟。"
        ),
        "requirements": (
            "1. 硕士及以上，3 年以上自动驾驶 CV 算法经验；"
            "2. 熟练 PyTorch/TensorRT/CUDA；"
            "3. 有量产落地项目经验优先。"
        ),
        "required_skills": ["PyTorch", "TensorRT", "C++", "CUDA", "BEV", "点云"],
        "nice_to_have_skills": ["ROS", "目标检测"],
        "required_capabilities": [
            {"capability": "BEV 感知模型设计与训练", "priority": "must"},
            {"capability": "TensorRT / ONNX 模型部署与量化优化", "priority": "must"},
            {"capability": "多传感器融合（相机+激光雷达）", "priority": "nice"},
            {"capability": "量产车型算法落地经验", "priority": "nice"},
        ],
        "min_years": 2,
        "max_years": 10,
        "required_education": "硕士",
        "salary_min": 35,
        "salary_max": 60,
        "city": "深圳",
        "remote_ok": False,
        "headcount": 2,
    },
    {
        "company_name": "医智未来",
        "title": "医疗 NLP 高级算法工程师",
        "type": "AI算法",
        "responsibilities": (
            "1. 医学文本结构化，电子病历、影像报告解析；"
            "2. 医学领域大模型微调与落地；"
            "3. 医疗知识图谱构建与维护。"
        ),
        "requirements": (
            "1. 硕士及以上，5 年以上 NLP 算法经验；"
            "2. 熟悉 BERT / Transformer，有医疗或垂直领域 NLP 经验优先；"
            "3. 有团队带领经验优先。"
        ),
        "required_skills": ["NLP", "BERT", "Transformer", "PyTorch", "知识图谱"],
        "nice_to_have_skills": ["医疗NLP", "LLM"],
        "required_capabilities": [
            {"capability": "医疗文本结构化与知识图谱构建", "priority": "must"},
            {"capability": "医学 NLP 大模型微调与领域适配", "priority": "must"},
            {"capability": "AI 医疗产品落地经验", "priority": "nice"},
            {"capability": "NLP 团队管理经验", "priority": "nice"},
        ],
        "min_years": 4,
        "max_years": 15,
        "required_education": "硕士",
        "salary_min": 55,
        "salary_max": 90,
        "city": "上海",
        "remote_ok": False,
        "headcount": 1,
    },
    {
        "company_name": "智元无界科技",
        "title": "大模型推理优化工程师",
        "type": "工程",
        "responsibilities": (
            "1. 自研大模型推理引擎，优化吞吐和延迟；"
            "2. 实现 paged attention、continuous batching 等主流优化；"
            "3. 支持多卡张量并行 / 流水并行部署。"
        ),
        "requirements": (
            "1. 本科及以上，3 年以上 GPU / CUDA 优化经验；"
            "2. 熟练 C++ / CUDA，熟悉 vLLM / TensorRT-LLM 等框架；"
            "3. 有大模型推理工程经验优先。"
        ),
        "required_skills": ["CUDA", "C++", "TensorRT", "vLLM", "大模型推理", "性能优化"],
        "nice_to_have_skills": ["Triton", "分布式"],
        "required_capabilities": [
            {"capability": "大模型推理引擎开发与性能优化", "priority": "must"},
            {"capability": "CUDA kernel 编写与 GPU 性能分析", "priority": "must"},
            {
                "capability": "KV cache、continuous batching、paged attention 等优化技术",
                "priority": "must",
            },
            {"capability": "多卡张量并行 / 流水并行部署经验", "priority": "nice"},
        ],
        "min_years": 3,
        "max_years": 12,
        "required_education": "本科",
        "salary_min": 50,
        "salary_max": 90,
        "city": "上海",
        "remote_ok": True,
        "headcount": 2,
    },
]


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------


def _admin(db: Session) -> User:
    u = db.query(User).filter_by(username="admin").first()
    if not u:
        raise RuntimeError("请先运行 python -m app.scripts.seed 创建 admin 用户")
    return u


def _wipe(db: Session) -> None:
    """清空 demo 数据（候选人 / 企业 / 岗位，不动用户）。"""
    from app.models.attachment import Attachment
    from app.models.resume_task import ResumeTask

    db.query(ResumeTask).delete()
    db.query(Attachment).delete()
    db.query(Position).delete()
    db.query(Company).delete()
    # 候选人通过外键级联删除 experience/project/education
    db.query(Candidate).delete()
    db.commit()


def run(wipe: bool = False) -> None:
    db: Session = SessionLocal()
    try:
        admin = _admin(db)

        if wipe:
            print("[wipe] 清空现有 demo 数据…")
            _wipe(db)

        if db.query(Candidate).count() > 0 or db.query(Company).count() > 0:
            print("[skip] 数据库已有 demo 数据，如需重灌请加 --wipe")
            return

        # ---------- companies ----------
        company_map: dict[str, Company] = {}
        for cc in COMPANIES:
            c = Company(owner_id=admin.id, **cc)
            db.add(c)
            db.flush()
            company_map[cc["name"]] = c
        print(f"[OK] 创建企业 {len(company_map)} 家")

        # ---------- positions ----------
        positions: list[Position] = []
        for pc in POSITIONS:
            cname = pc.pop("company_name")
            p = Position(company_id=company_map[cname].id, owner_id=admin.id, **pc)
            db.add(p)
            positions.append(p)
        db.flush()
        print(f"[OK] 创建岗位 {len(positions)} 个")

        # ---------- candidates ----------
        cands: list[Candidate] = []
        for cc in CANDIDATES:
            experiences = cc.pop("experiences", [])
            projects = cc.pop("projects", [])
            educations = cc.pop("educations", [])
            cand = Candidate(owner_id=admin.id, source="manual", **cc)
            for e in experiences:
                cand.experiences.append(CandidateExperience(**e))
            for p in projects:
                cand.projects.append(CandidateProject(**p))
            for edu in educations:
                cand.educations.append(CandidateEducation(**edu))
            db.add(cand)
            cands.append(cand)
        db.flush()
        print(f"[OK] 创建候选人 {len(cands)} 人")

        db.commit()

        # 触发向量化（同步）
        print("[vectorize] 开始向量化所有候选人和岗位…（首次会加载 bge-m3，约 10-30s）")
        from app.services.vectorize import vectorize_candidate, vectorize_position

        for cand in cands:
            vectorize_candidate(cand.id)
            print(f"  ✓ candidate #{cand.id} {cand.name}")
        for p in positions:
            vectorize_position(p.id)
            print(f"  ✓ position #{p.id} {p.title}")

        print("\nDone. 运行 python -m app.scripts.test_matching 查看自动化匹配结果。")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wipe", action="store_true", help="清空现有 demo 数据后再灌入")
    args = parser.parse_args()
    run(wipe=args.wipe)


if __name__ == "__main__":
    main()
