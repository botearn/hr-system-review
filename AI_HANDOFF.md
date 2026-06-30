# AI Session Handoff — hr_system_review

**项目定位**  
这是专门用来开发「面试平台 + 代码作品评估」功能的独立副本。  
- 主系统（hr_system_cloud）保持不变，负责完整 HR 功能。  
- 本仓库（hr_system_review）专注实现面试者（interviewee）和面试官（interviewer）的受限流程。

**当前角色体系（必须严格遵守）**
- `admin`：完整 HR 系统权限
- `interviewer`：仅能看到候选人 + 代码评估相关功能（后台创建）
- `interviewee`：**只能通过前端公开注册**，强制角色，只能访问面试题、选题、提交作品、查看自己记录。**绝对禁止**访问任何 HR 数据和接口。

**已实现内容（2026-06-30）**
- 新增模型 `CodeSubmission`（代码作品提交）
- 强化权限依赖：
  - `require_interviewer`
  - `require_interviewee`
- 接口：
  - `POST /api/v1/auth/register/interviewee`（公开注册，强制 interviewee 角色）
  - `POST /api/v1/code-submissions`（面试者提交作品）
  - `GET /api/v1/code-submissions/mine`（面试者看自己记录）
  - `GET /api/v1/code-submissions/pending`（面试官看待评估列表）
  - `POST /api/v1/code-submissions/{id}/score`（面试官打分）
- Schema、路由、模型注册已更新

**当前仓库状态**
- backend 核心代码已复制并开始改造
- frontend 尚未完整复制（需要后续补）
- 目前没有数据库迁移脚本和种子数据（需要补充角色初始化）

**核心约束（不可违背）**
- 面试者（interviewee）必须做到**零可见、零可访问**后台 HR 数据
- 面试官账号只能后台创建，不能走前端注册
- 当前阶段只做「代码作品留存 + 手动打分」，不做自动评测

**建议下一步**
1. 确保数据库里有 `interviewee` 和 `interviewer` 角色（可在启动时自动创建）
2. 把 frontend 完整复制进来
3. 实现前端的角色隔离（interviewee 只看到面试平台界面）
4. 和同事确认提交记录的对接方式（接口调用还是其他）

---

**给新窗口的简短说明（可直接复制）**：

我已经把工作切换到 hr_system_review 这个目录了。
这是专门开发面试平台（interviewee + interviewer）的副本，主系统 hr_system_cloud 不动。

目前后端已经实现了：
- 强制 interviewee 角色的公开注册接口
- CodeSubmission 模型 + 提交/打分接口
- 严格的角色权限隔离（require_interviewee / require_interviewer）

仓库当前只有 backend，frontend 还没完整带过来。

请基于这个目录继续开发，严格遵守：
- 面试者只能看到面试题相关界面
- 面试官只能做代码评估
- 不能让 interviewee 访问任何 HR 数据

需要我现在做什么？（可以先把角色初始化、数据库迁移、前端复制、还是前端界面隔离先做）
