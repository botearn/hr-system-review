# 招聘平台候选人主页抓取（场景 C）

本文档说明为何 **BOSS直聘 / 拉勾 / 猎聘 / 51job / 智联 / LinkedIn** 等招聘平台的候选人主页不纳入自动抓取范围，并预留未来扩展点。

## 现状：拒绝处理

在 [`app/services/resume/url_fetch.py`](../backend/app/services/resume/url_fetch.py) 中维护了 `_PLATFORM_BLOCKLIST`。`POST /api/v1/resumes/url` 接口会在提交前先校验域名，命中黑名单直接返回 400 + `PlatformNotSupportedError`，不会发起任何请求。

当前黑名单：
- `zhipin.com`（BOSS直聘）
- `lagou.com`（拉勾）
- `liepin.com`（猎聘）
- `51job.com`（前程无忧）
- `zhaopin.com`（智联招聘）
- `linkedin.com`

## 为什么拒绝自动化

### 1. 合规风险

- 这些平台的用户协议均明确禁止**自动化抓取、爬取、镜像**候选人信息。
- 《网络安全法》《个人信息保护法》《数据安全法》对自动化采集他人简历设有严格限制，候选人的简历属于敏感个人信息。
- 已有多起司法案例：脉脉 vs 微博（2016）、猎聘 vs 某数据公司（2020）等，爬取招聘平台数据被认定为不正当竞争。

### 2. 技术难度

- **登录态强绑定**：候选人主页通常只对已登录的招聘者开放，公开 URL 抓不到完整内容。
- **动态渲染**：简历内容由 JS 异步加载（React/Vue 单页应用），`httpx + html.parser` 拿不到。需要 headless Chromium（Playwright），部署成本高。
- **反爬**：人机验证、滑块、字体反爬、请求频率限制。绕过成本高且不稳定，一次规则更新就得重写。
- **Cookie / token 流转**：跨域认证、设备指纹、短时效 token，在服务端模拟极易被风控识别。

### 3. 不符合单人/小团队工具定位

本系统面向**AI猎头顾问团队内部使用**，不是面向公众的数据聚合服务。如果猎头顾问本身就有平台登录态，最低成本的人工操作反而最可靠。

## 推荐的人工工作流

对招聘平台候选人，顾问走这条路径：

1. 在平台上登录自己的招聘者账号，查看候选人详情
2. 点击平台提供的"**导出简历**"或"**下载PDF**"按钮（几乎所有平台都有）
3. 把下载的 PDF 通过本系统的"上传简历"功能导入

这条路径完全合规，速度也不慢（每份 5-10 秒）。

## 未来扩展点（预留）

如果确实需要为招聘平台做接入，以下是最合规的顺序，按成本递增排列：

### 方案一：平台官方开放 API（首选）

部分平台有 ToB 的招聘者 API（如 LinkedIn Recruiter API、BOSS 直聘 CRM 接口），通过**企业合作接入**合法获取简历数据。流程：签合作协议 → 拿到 API key / OAuth → 在本系统里加 OAuth 登录 + API 调用。

预留扩展点：
- `app/services/resume/platforms/` 目录（还未创建）放各平台 adapter
- 每个 adapter 实现 `fetch_resume(candidate_ref: str, auth_ctx) -> FetchResult`
- `url_fetch.fetch_resume` 增加路由逻辑：先识别平台 → 查 adapter → 走 API

### 方案二：浏览器插件（顾问本地执行）

- 开发一个 Chrome 扩展
- 猎头顾问在平台登录后，右键"发送简历到人才库"
- 插件读取当前页面 DOM，通过本系统的 `POST /api/v1/resumes/paste`（未实现）上传结构化数据或原始文本

这条路径的关键是**数据采集发生在顾问自己的浏览器内**，由顾问主动触发，法律责任回归到顾问个人使用范畴。

预留扩展点（未来实现）：
- 新增 `POST /api/v1/resumes/paste`：接收 `{platform, candidate_ref, text|html, fields?}`
- 在 pipeline 里加 `source_type: "browser_ext"`
- 插件代码放在 `browser_extension/` 目录

### 方案三：RPA（自动填表，不推荐）

用 Playwright 模拟顾问的浏览器操作。技术可行，但在**效率、稳定性、合规**三方面都不如方案二，除非候选人量非常大，否则不建议。

## 总结

| 场景 | 自动化策略 | 状态 |
|---|---|---|
| A. 公开 PDF URL | `httpx` 下载 + PDF 解析 | ✅ 已实现 |
| B. 静态 HTML 简历网站 | `httpx` 抓 HTML + 文本提取 | ✅ 已实现 |
| C. 招聘平台候选人主页 | 平台 API / 浏览器插件 / 人工导出PDF | 🔒 仅保留人工通道 |

如果未来要做 C，优先走**方案一（平台官方 API）**或**方案二（浏览器插件）**，绝不走爬虫。
