# AI 人才管理系统

面向 AI 猎头 / 顾问团队的候选人—企业—岗位管理与**智能匹配**系统。支持 PDF 简历批量导入、URL 抓取（简历 / 企业官网）、本地 LLM 结构化抽取、能力提炼、简历质量评分、向量召回 + 多维度可解释打分。

> **使用说明**：[USER_GUIDE.md](USER_GUIDE.md)（含 6 张面板截图）

## 架构概览

```
React (Vite + AntD) ──┐
                      ├──► FastAPI (SQLAlchemy + Alembic)
                      │         │
                      │         ├──► PostgreSQL 16           (结构化数据)
                      │         ├──► Qdrant                  (向量库：候选人/岗位 命名向量)
                      │         ├──► Redis                   (缓存/队列，预留)
                      │         ├──► Ollama + GLM-4-9B       (简历结构化抽取/能力提炼/质量评分/企业信息抽取)
                      │         └──► bge-m3 (sentence-tx)     (Embedding 1024 维)
```

所有本地服务、零云依赖。16G 内存 Mac 可完整运行。

## 设计文档

| 文档 | 内容 |
|---|---|
| [docs/01-api-spec.md](docs/01-api-spec.md) | 10 个模块的 REST API 规范 |
| [docs/02-data-model.md](docs/02-data-model.md) | Mermaid ER 图 + 所有表 / Qdrant collection 定义 |
| [docs/03-matching-engine.md](docs/03-matching-engine.md) | 匹配引擎算法：硬过滤 → 召回 → 六维度打分 |
| [docs/04-platform-scraping.md](docs/04-platform-scraping.md) | 招聘平台抓取（BOSS/拉勾/LinkedIn）拒绝处理的理由和未来扩展点 |

## 当前模块状态

| 模块 | 后端 | 前端 | 备注 |
|---|---|---|---|
| 认证 / JWT | ✅ | ✅ | admin/admin123 默认账号 |
| 候选人 CRUD + 软删 + 编辑日志 | ✅ | ✅ (编辑 + 作废按钮) | 修改日志模型预留，UI 待做 |
| 简历导入（PDF 批量 / URL / LLM 解析） | ✅ | ✅ (Drawer in 候选人页) | 包含能力提炼 + 简历质量评分 |
| 企业 CRUD + 归档 | ✅ | ✅ | |
| **企业从 URL 导入**（LLM 抽取官网/PDF） | ✅ | ✅ | |
| 岗位 CRUD + 模板 + 关闭/重开 | ✅ | ✅ | `required_capabilities` 自动提炼 |
| 向量化（bge-m3 + Qdrant） | ✅ | - | 候选人/岗位创建后自动异步生成，含手动 reindex |
| **智能匹配**（硬过滤 + 召回 + 六维度重排） | ✅ | ✅ | 权重可调，匹配点/差异点可解释 |
| 跟进记录 + 跟进状态 + 状态变更 timeline | ✅ | ✅ | 候选人/岗位详情都可看;状态变 onboarded 自动同步 `candidate.job_status` |
| 数据统计看板（KPI/漏斗/行业分布/活动） | ✅ | ✅ | Dashboard 页；右侧 AI 可解释 |
| 用户 / 角色管理 UI | ❌ | ❌ | 种子脚本建用户，API 已有 |

> 说明：**技能锅 / 能力锅**相关能力仍保留在后端与代码中，但当前版本已隐藏入口（避免分散主线演示）。

## 快速启动

### 一次性依赖

```bash
# 1) conda env
conda create -n hr_system python=3.11 -y
conda activate hr_system

# 2) 基础设施（Postgres / Redis 走 brew，Qdrant 走 Colima+Docker）
brew install postgresql@16 redis colima docker docker-compose
brew services start postgresql@16
brew services start redis
colima start --cpu 2 --memory 4 --disk 20

# 3) Ollama + GLM-4-9B（本地 LLM，~6G）
#    到 https://ollama.com 下载安装，然后：
ollama pull glm4:9b
```

### 后端

```bash
# 建库
psql -d postgres -c "CREATE USER hr WITH PASSWORD 'hr_pass';"
psql -d postgres -c "CREATE DATABASE hr_system OWNER hr;"

cp .env.example .env

# 装依赖
cd backend
python -m pip install -e ".[dev]"

# 迁移 + 种子
python -m alembic upgrade head
python -m app.scripts.seed            # 创建 admin / admin123

# Qdrant
docker-compose up -d qdrant           # (项目根目录)

# 启动
python -m uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173，用 `admin / admin123` 登录。

#### 前端开发辅助命令

```bash
cd frontend
npm run format          # prettier 自动格式化
npm run lint            # eslint（warning 不阻断）
npm run typecheck        # tsc 严格类型检查
```

## 测试数据（6 位候选人 + 3 家企业 + 5 个岗位）

一个覆盖"算法 / 产品 / 自动驾驶 / 医疗NLP / 推理优化"五种方向的 demo 数据集：

```bash
cd backend
python -m app.scripts.seed_demo --wipe    # 清空后重灌
python -m app.scripts.test_matching       # 自动跑匹配，打印 Top-N
```

### 匹配测试结果（能力维度 + bge-m3 语义匹配）

| 岗位 | Top1 | 分数 | 与 Top2 分差 |
|---|---|---|---|
| 高级AI算法工程师（多模态大模型） | 张三 | 73.1 | 14 |
| AI 产品经理（大模型方向） | 李四 | 77.5 | 47 |
| 计算机视觉算法专家（自动驾驶） | 王五 | 77.6 | 42 |
| 医疗 NLP 高级算法工程师 | 赵六 | 84.4 | 46 |
| 大模型推理优化工程师 | 孙八 | 88.7 | 43 |

每个岗位的第一名都是预期的人选，Top1 与 Top2 有显著分差，说明向量召回 + 六维度重排工作正常。

非目标候选人（钱七 - 金融科技机器学习）在所有岗位里都排后半段，符合预期。

### 跑完后打开前端体验

1. **候选人**：看列表 → 点"上传简历 / URL 导入"测试批量 PDF + URL 导入
2. **企业**：点"从 URL 导入"测试官网抽取（如 `https://www.anthropic.com/company`）
3. **岗位**：查看 required_capabilities 是否由 LLM 异步提炼出来
4. **智能匹配**：选一个岗位 → 点"开始匹配" → 看各维度打分 + 匹配点 / 差异点

## 项目结构

```
hr_system_cloud/
├── USER_GUIDE.md                # 使用说明书（含截图）
├── README.md                    # 本文
├── CONTRIBUTING.md              # 协作与开发规范（建议先看）
├── docker-compose.yml           # qdrant + (postgres/redis 可选走 docker)
├── .editorconfig                # 跨编辑器一致的换行/空格
├── .env.example
├── docs/
│   ├── 01-api-spec.md
│   ├── 02-data-model.md
│   ├── 03-matching-engine.md
│   ├── 04-platform-scraping.md
│   ├── 06-architecture-process-analysis.md  # 架构与流程分析报告（试验期）
│   └── screenshots/             # 自动生成的 UI 截图
├── backend/
│   ├── pyproject.toml
│   ├── alembic/                 # 数据库迁移
│   └── app/
│       ├── main.py
│       ├── core/                # 配置 / 安全 / 依赖
│       ├── db/
│       ├── models/              # User/Role/Candidate/Company/Position/ResumeTask/Attachment/Tag
│       ├── schemas/             # Pydantic
│       ├── api/v1/              # auth/candidates/companies/positions/resumes/matches
│       ├── services/
│       │   ├── embedding.py           # bge-m3 单例
│       │   ├── vector_store.py        # Qdrant 封装
│       │   ├── vectorize.py           # candidate/position → Qdrant
│       │   ├── matcher.py             # 匹配引擎
│       │   ├── position_capability.py # 岗位能力 LLM 提炼
│       │   ├── company_extract.py     # 企业 URL → LLM 抽取
│       │   └── resume/
│       │       ├── text_extract.py   # PDF/DOCX/HTML 文本提取
│       │       ├── url_fetch.py      # URL 抓取 + 平台黑名单
│       │       ├── llm_client.py     # Ollama JSON 调用
│       │       ├── prompts.py        # 三类 prompt
│       │       └── pipeline.py       # 解析流水线
│       └── scripts/
│           ├── seed.py                # admin 用户初始化
│           ├── seed_demo.py           # 演示数据（6/3/5）
│           └── test_matching.py       # 自动化匹配测试
└── frontend/
    ├── package.json
    ├── eslint.config.js
    ├── .prettierrc.json
    ├── vite.config.ts
    ├── scripts/
    │   └── take-screenshots.mjs     # puppeteer-core 截图脚本
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/                     # auth/candidates/companies/positions/resumes/matches
        ├── store/                   # Zustand
        ├── components/
        │   └── ResumeImportPanel.tsx   # 简历导入抽屉内容
        └── pages/
            ├── Login.tsx
            ├── Dashboard.tsx
            ├── Candidates.tsx
            ├── Companies.tsx
            ├── Positions.tsx
            └── Matches.tsx
```

## 关键设计决策

| 决策 | 选择 | 原因 |
|---|---|---|
| 本地 vs 云 LLM | **本地 GLM-4-9B via Ollama** | 数据不出本地，候选人隐私 |
| 向量库 | **Qdrant**（命名向量） | 一个 point 存多维度向量，召回时分路查询 |
| 能力 vs 技能 | **独立维度，权重 0.40 : 0.20** | 能力是"他做过什么"（证据驱动），技能是"他说自己会什么"（声明） |
| 能力命中判断 | **bge-m3 语义相似度 ≥ 0.72** | 同义能力表述（"大规模分布式训练" ≈ "多机多卡训练"）能匹配上 |
| 年限 | **硬过滤，不打分** | 不够年限直接排除，超龄不扣分（AI 圈资深降维常见） |
| 简历解析 | **异步 Celery 替代方案：FastAPI BackgroundTasks** | 单人/小团队够用；切 Celery 只需换接口层，pipeline 代码不改 |
| 招聘平台候选人主页抓取 | **显式拒绝 + 文档说明** | 合规风险高，详见 [docs/04](docs/04-platform-scraping.md) |

## 常见问题

完整 FAQ 见 [USER_GUIDE.md §9](USER_GUIDE.md#9-常见问题)。最常见的几个：

- **bge-m3 首次调用卡很久** — 要从 HuggingFace 下载 ~2GB 模型，只在第一次。之后缓存在 `~/.cache/huggingface/`，秒级加载
- **匹配结果为空** — 点"**重建向量索引**"，新旧数据全部重新写入 Qdrant
- **岗位能力列显示 "-"** — LLM 异步提炼中，等 10-30 秒刷新即可

## 刷新截图

```bash
cd frontend
node scripts/take-screenshots.mjs       # puppeteer-core 驱动系统 Chrome，输出到 docs/screenshots/
```

要求：系统安装 Google Chrome（已覆盖 Apple Silicon 默认路径）。
