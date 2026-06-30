# 云部署指南（Vercel + Render + Supabase + 智谱 API）

目标：把 HR 系统部署成 **5 人团队可用的 SaaS 形态**。总月成本 **¥0**（全部走免费档），零运维。

## 架构

```
 Browser
   │
   ▼
 Vercel (前端, React)                        ← Hobby 免费
   │ HTTPS /api/...
   ▼
 Render (后端, FastAPI, 512MB)               ← Free 免费
   │
   ├──► Supabase Postgres (数据库 + pgvector) ← Free 免费
   ├──► Supabase Storage  (简历 PDF/DOCX)     ← Free 免费
   ├──► 智谱 GLM-4-Flash  (LLM 结构化抽取/能力提炼/评分)   ← 免费
   └──► 智谱 embedding-3 (向量 1024 维)       ← 免费
```

三次替换：
- **本地 Ollama GLM-4-9B → 智谱 GLM-4-Flash API**（中文、同家族，prompt 不用改）
- **本地 bge-m3（2GB 模型）→ 智谱 embedding-3 API**（1024 维对齐，服务器内存降到 ~200MB）
- **本地 Qdrant → Supabase pgvector**（少一个独立服务）
- **本地 `./storage` → Supabase Storage**（多实例共享文件）

---

## 一次性准备

### 1. 注册三个账号

| 平台 | 注册地址 | 用途 |
|---|---|---|
| Supabase | https://supabase.com | Postgres + pgvector + Storage |
| Render | https://render.com | 部署 FastAPI 后端 |
| Vercel | https://vercel.com | 部署 React 前端 |
| 智谱 AI | https://open.bigmodel.cn | 免费 GLM-4-Flash |

### 2. 推代码到 GitHub

```bash
cd /path/to/hr_system_cloud
git init -b main
git add .
git commit -m "Initial cloud version"
git remote add origin https://github.com/<你的账号>/hr_system_cloud.git
git push -u origin main
```

---

## Supabase 配置

### 2.1 创建 project

1. Supabase Dashboard → **New project** → 随便取名，选 `Asia (Singapore)` 区域
2. 创建完成后进入 **Project Settings → Database → Connection string → URI**
   选 **Session pooler**（Render 适用），复制备用

### 2.2 启用 pgvector

SQL Editor → 新建查询，执行：
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2.3 创建 Storage bucket

1. Storage → **New bucket** → 名称 `resumes` → 取消勾选 "Public bucket"（保持私有）
2. Settings → API → 复制 **service_role** key（私密！只放服务器端）

---

## Render 配置（后端）

### 3.1 方式 A：Blueprint 自动导入（推荐）

Render 会读仓库里的 `render.yaml`：
1. Dashboard → **New** → **Blueprint**
2. 选 GitHub 仓库 `hr_system_cloud`
3. Render 会显示需要填写的环境变量（所有 `sync: false` 的）：
   - `DATABASE_URL`：贴上 Supabase 的 URI（注意要把 `postgres://` 留着，代码会自动转）
   - `LLM_API_KEY`：智谱后台 **API keys** → 创建 → 复制
   - `SUPABASE_URL`：`https://<项目ref>.supabase.co`
   - `SUPABASE_SERVICE_KEY`：刚才复制的 service_role key
   - `CORS_ORIGINS`：Vercel 部署后填（先留空，后面补）
4. **Plan 可以选 Free**（512MB 足够，因为 embedding 已走云 API）—— 注意 Free 档 15 分钟空闲会休眠，首次请求 ~30 秒冷启动。团队频繁使用时建议升到 **Starter $7/月**避免休眠。

### 3.2 方式 B：手动创建

1. New → Web Service → Docker
2. Root dir: `backend`，Dockerfile path: `./Dockerfile`
3. 手动填 env vars（参见 `.env.example`）

### 3.3 验证

部署完成后访问 `https://<你的服务>.onrender.com/health` 应返回 `{"status":"ok"}`。
数据库迁移在启动时自动跑（Dockerfile CMD 里有 `alembic upgrade head`）。

首次启动很快：没有本地模型下载（embedding 走云 API），只装 pip 依赖，通常 1-2 分钟完成。

---

## Vercel 配置（前端）

### 4.1 Import project

1. Dashboard → **Add New** → **Project** → 选 `hr_system_cloud` 仓库
2. **Root Directory** 改为 `frontend`
3. Framework 自动识别 Vite
4. Environment Variables：
   - `VITE_API_BASE` = `https://<你的 render 后端>.onrender.com`
5. Deploy

### 4.2 回填 CORS

拿到 Vercel 给的域名（比如 `https://hr-system-cloud.vercel.app`），回 Render 后端：
- env var `CORS_ORIGINS` = `https://hr-system-cloud.vercel.app`
- 保存，Render 会自动重启

---

## 首次初始化数据

### 5.1 建 admin 账号

Render Dashboard → 后端服务 → **Shell**（Standard 及以上有）：
```bash
python -m app.scripts.seed
```
→ 建出 `admin / admin123`。**立刻登录前端改密码**（或直接在 DB 改）。

### 5.2 （可选）灌入 demo 数据

```bash
python -m app.scripts.seed_demo
python -m app.scripts.test_matching
```

---

## 成本估算

| 项 | 方案 | 月成本 |
|---|---|---|
| Vercel | Hobby（免费） | ¥0 |
| Render | Free（512MB RAM，15 分钟空闲休眠）| ¥0 |
| Supabase | Free tier（500MB DB, 1GB Storage）| ¥0 |
| 智谱 GLM-4-Flash（LLM） | 免费 | ¥0 |
| 智谱 embedding-3（向量）| 免费 | ¥0 |
| **合计** | | **¥0/月** |

**建议升级点**（规模/体验到一定程度才需要）：
- Render Starter `$7/月`（~¥50）→ **不休眠**，首次请求无 30 秒冷启动。对日常高频使用的团队推荐
- Supabase Pro `$25/月` → DB 容量 8GB + 自动每日备份。简历数累计到几千份再考虑
- Vercel Pro `$20/月/人` → 正式商业用途的合规选项

---

## 常见问题

### Q1. `pgvector extension not found`
在 Supabase SQL Editor 执行 `CREATE EXTENSION IF NOT EXISTS vector;`。

### Q2. 简历上传失败 "supabase upload failed: HTTP 400"
检查 `SUPABASE_STORAGE_BUCKET` 值是否和你在 Supabase 创建的 bucket 名一致（默认 `resumes`）。

### Q3. LLM 调用报 401
检查 `LLM_API_KEY` 有没有填对。智谱 key 形如 `xxxx.xxxxxxxxxxxx`。

### Q4. 前端访问后端被 CORS 拦
确认 `CORS_ORIGINS` 包含 Vercel 域名，且**保存后 Render 已经重启**。

### Q5. Render Free 首次请求很慢（30 秒）
Free 档 15 分钟空闲会休眠，首次请求要冷启动。升 Starter $7/月就不休眠。

### Q6. 想改回本地 bge-m3 embedding
装可选依赖并切 provider：
```bash
pip install -e '.[local-embed]'
# .env 里：
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=BAAI/bge-m3
```
注意：本地 bge-m3 需要 ≥2GB RAM，Render Standard $25/月起。

---

## 未来优化（v2）

1. **接 Supabase Auth 替代自建 JWT** → 免去用户管理 UI 开发
2. **前端加 React Query** → 减少后端负载
3. **接 Sentry** → 生产环境错误监控
4. **embedding 质量对比**：智谱 embedding-3 vs bge-m3 的匹配质量是否有差异（需灌入真实简历数据做 A/B）
