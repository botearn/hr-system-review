# API 规范（v1）

约定：
- 基础路径 `/api/v1`
- 认证：JWT Bearer（登录后返回 access + refresh）
- 分页：`?page=1&page_size=20`，响应 `{items, total, page, page_size}`
- 排序：`?sort=-created_at`（前缀 `-` 降序）
- 错误：`{code, message, details}`，HTTP 状态码语义化
- 时间：所有时间字段 ISO8601 UTC
- 权限：除 auth 外所有接口鉴权；候选人/企业数据默认**归属过滤**（非管理员只能看 `owner_id == self` 或被转交给自己的）

---

## 1. 认证与用户

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/login` | 用户名+密码登录，返回 `{access_token, refresh_token, user}` |
| POST | `/auth/refresh` | 刷新 token |
| POST | `/auth/logout` | 吊销 refresh token |
| GET | `/auth/me` | 当前用户信息 |
| GET | `/users` | 用户列表（admin） |
| POST | `/users` | 创建用户（admin） |
| PATCH | `/users/{id}` | 修改用户（admin） |
| DELETE | `/users/{id}` | 禁用用户（admin，软删） |
| GET | `/roles` | 角色列表（admin） |

---

## 2. 候选人

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/candidates` | 列表，支持筛选参数见下方 |
| POST | `/candidates` | 手动创建 |
| GET | `/candidates/{id}` | 详情（含经历、项目、教育、标签） |
| PATCH | `/candidates/{id}` | 单个编辑 |
| POST | `/candidates/batch-update` | 批量编辑（`{ids, patch}`） |
| POST | `/candidates/{id}/void` | 作废（软删） |
| POST | `/candidates/{id}/restore` | 恢复 |
| POST | `/candidates/{id}/transfer` | 转交给其他顾问（`{to_user_id, reason}`） |
| GET | `/candidates/{id}/edit-logs` | 修改日志 |
| GET | `/candidates/{id}/attachments` | 附件列表 |
| POST | `/candidates/{id}/attachments` | 上传附件 |

**列表筛选参数**：`name, phone, email, industry, city, min_years, max_years, min_salary, max_salary, status, tag_ids[], skills[], owner_id, keyword(模糊)`

### 简历导入（异步）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/resumes/upload` | 上传单份/多份简历（multipart），返回 `{task_ids}` |
| GET | `/resumes/tasks/{task_id}` | 查询解析任务状态（pending/parsing/extracting/vectorizing/done/failed） |
| POST | `/resumes/tasks/{task_id}/confirm` | 解析完成后，顾问确认并落库，生成候选人（可在确认前编辑解析结果） |
| GET | `/resumes/tasks` | 当前用户的解析任务列表 |

---

## 3. 标签与分类

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/tags` | 标签列表 |
| POST | `/tags` | 新建标签 |
| PATCH | `/tags/{id}` | 重命名/改色 |
| DELETE | `/tags/{id}` | 删除（软删） |
| POST | `/candidates/{id}/tags` | 给候选人打标签（`{tag_ids}`） |
| DELETE | `/candidates/{id}/tags/{tag_id}` | 移除标签 |

---

## 4. 企业

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/companies` | 列表（按领域、融资阶段筛选） |
| POST | `/companies` | 新建 |
| GET | `/companies/{id}` | 详情（含关联岗位、成功对接候选人） |
| PATCH | `/companies/{id}` | 编辑 |
| POST | `/companies/{id}/archive` | 归档 |
| POST | `/companies/{id}/restore` | 取消归档 |

---

## 5. 岗位

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/positions` | 列表，支持 `company_id, type, status, keyword` |
| POST | `/positions` | 新建 |
| GET | `/positions/{id}` | 详情 |
| PATCH | `/positions/{id}` | 编辑 |
| POST | `/positions/{id}/close` | 关闭（`{reason}`） |
| POST | `/positions/{id}/reopen` | 重开 |
| GET | `/positions/templates` | 模板列表 |
| POST | `/positions/templates` | 保存模板 |

---

## 6. 跟进

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/follow-ups` | 按 candidate_id / position_id / date_range / status 筛选 |
| POST | `/follow-ups` | 新建（候选人、岗位可选、方式、内容、next_plan、附件） |
| PATCH | `/follow-ups/{id}` | 编辑/补充 |
| DELETE | `/follow-ups/{id}` | 删除（软删） |
| POST | `/candidates/{id}/status` | 变更跟进状态（`{new_status, reason, position_id?}`），会同步生成一条 status_change 记录 |
| GET | `/candidates/{id}/status-history` | 状态变更历史 |
| GET | `/follow-ups/reminders` | 需跟进提醒（根据 next_plan.due_date） |

---

## 7. 匹配

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/matches/run` | 触发匹配（`{position_id, top_k?, weight_profile_id?}`），异步，返回 `task_id` |
| GET | `/matches/tasks/{task_id}` | 匹配任务状态 |
| GET | `/positions/{id}/matches` | 获取岗位的匹配结果列表（含分数、匹配点、差异点） |
| POST | `/positions/{id}/matches/{candidate_id}/push` | 标记已推送 |
| GET | `/weight-profiles` | 权重配置列表 |
| POST | `/weight-profiles` | 新建权重方案（`{name, weights: {skill, experience, salary, city, education, industry}}`） |
| PATCH | `/weight-profiles/{id}` | 编辑权重 |

---

## 8. 统计与导出

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/stats/talent-pool` | 人才库概览（总数、学历分布、岗位类型分布、技能方向分布、经验段分布） |
| GET | `/stats/matching-funnel` | 匹配漏斗（匹配数→推送→面试邀约→面试通过→入职），支持 `position_id`、`date_range` |
| GET | `/stats/follow-up` | 跟进统计（各状态数量、近期跟进数、未及时跟进数） |
| POST | `/stats/export` | 导出（`{scope, format: excel\|pdf, date_range, filters}`），返回下载链接 |

---

## 9. 搜索

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/search/candidates` | 多条件 + 关键词模糊搜索（ILIKE + 向量召回并集） |
| GET | `/search/positions` | 岗位搜索 |

---

## 10. 文件

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/files` | 通用上传，返回 `file_id` |
| GET | `/files/{id}` | 下载（带权限校验） |
