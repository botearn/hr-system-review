# 首页改造计划

## 问题
系统现在默认落地到 `/candidates`,像一个普通的 admin 列表页。
招牌功能(智能匹配 + 技能/能力锅房)被藏在二级导航里,买方第一眼
看不出差异化价值。整体观感接近"学生作品"。

## 目标
一张 Home 页,让招牌功能(匹配)在第一屏就出现;同时把系统独有的
能力(锅房 / 语义聚类)顺带暴露出去。

## 设计

### 顶部 Hero
- 大标题:"让 AI 帮你,在人海里看到对的人"
- 副标题 + 主按钮 **🎯 开始匹配** → `/matches`
- 次按钮 **🍲 进锅房** → `/pools`
- 背景用紫→橙渐变,呼应锅房配色(`#722ed1` → `#fa8c16`)

### 统计卡片(一行 4 个,用 antd Statistic)
| 指标 | 说明 |
|---|---|
| 候选人库存 | 总数 · 本周新增 +N |
| 招聘中岗位 | 总数 · 本月新增 +N |
| 合作企业 | 总数 |
| 能力池规模 | 条数(我们独有的差异化) |

### 双列区
- 左:**最新 5 位候选人**(姓名 + 技能 tag + 能力 tag · 点击打开详情抽屉)
- 右:**活跃岗位**(岗位名 + 企业 + 城市 · 点击跳匹配页并选中)

### 底部快捷入口
- 上传简历 → 候选人页(弹出导入面板)
- 进锅房 → 池子页
- 添加岗位 → 岗位页

## 技术实现

### 后端
- 新端点 `GET /stats/overview` 返回一份 JSON:
  ```json
  {
    "candidates": { "total": 6, "new_this_week": 2 },
    "positions": { "active": 5, "new_this_month": 0 },
    "companies": { "total": 3 },
    "pools": { "skills": 33, "capabilities": 20 },
    "recent_candidates": [ { id, name, skills[], capabilities[] } ],
    "active_positions": [ { id, title, company_name, city } ]
  }
  ```
- 放在 `backend/app/api/v1/stats.py`,register 到 router

### 前端
- 新 `frontend/src/pages/Home.tsx`
- 新 `frontend/src/api/stats.ts`
- `App.tsx` 把 `/*` 的 fallback 从 `/candidates` 改成 `/`,`/` 指向 Home
- 顶部导航加一项 "首页"(放最前)

### 样式/依赖
- 不引入新依赖
- 用 antd Card / Statistic / Row / Col / Button
- 渐变背景用 CSS `linear-gradient` 直接写

## 刻意不做(本期外)

- **匹配次数统计**:当前没 `match_log` 表,需要新表 + 写入埋点。
  另起一期,届时把"今日匹配次数"补进统计卡
- **趋势图(折线/柱状)**:会引入 charts 库,本期不做
- **个性化推荐**:需要用户行为数据,当前没有

## 实现顺序(预估 ~0.5 天)

1. 后端 `/stats/overview` + smoke test
2. 前端 `Home.tsx` 骨架 + 统计卡接 API
3. 接入 Hero + 快捷入口
4. 最新候选人 / 活跃岗位双列
5. 路由调整 + 顶部菜单加"首页"
6. 联调 + 视觉微调

## 决策记录
- 买方演示中 `.vercel.app` 域名在国内会 timeout(见前期排查),
  如果首页做成"有冲击力"的形式,更需要解决访问稳定性。
  考虑同期或先行做 **自定义域名**(Vercel → Settings → Domains)。
