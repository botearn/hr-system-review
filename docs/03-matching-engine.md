# 匹配引擎算法设计

## 目标

给定一个岗位（position），返回 Top-N 候选人，每人一份可解释的**匹配点/差异点**报告，分数区间 0-100。

流程：**硬过滤** → **召回**（向量粗筛）→ **重排**（规则可解释打分）。

---

## 阶段零：硬过滤

在进入召回前，用 Qdrant payload 过滤直接排除：

- `is_deleted = false`
- 非管理员：`owner_id == self`
- **年限过滤**：候选人 `years_of_experience >= position.min_years`（岗位未指定则跳过）

年限不再参与打分，只作为硬性准入门槛。超出 `max_years` 的不过滤（允许资深候选人冲低阶岗位）。

---

## 阶段一：召回（Recall）

### 为什么分粒度向量

简历的"声称技能"、"项目"、"工作经历"、"能力提炼"语义重心不同。如果只做一个整体 embedding，技能关键词会被长文本稀释。分粒度后各自在各自语义空间召回，交集就是强相关候选人。

### 候选人 embedding 生成（写入 Qdrant）

简历解析 + 能力提炼完成后，异步生成五路向量：

| 向量名 | 输入文本 |
|---|---|
| `skill_vec` | `skills + 项目 tech_stack` 去重后拼接 |
| `capability_vec` | **新增**：`derived_capabilities` 列表拼接（LLM从经历里提炼出的能力） |
| `project_vec` | 每个项目 `"{name} / {role} / {description}"` 拼接，超过2000字做摘要 |
| `experience_vec` | 每段经历 `"{company} - {title}: {description}"` 拼接 |
| `summary_vec` | LLM生成的300字简历摘要，兜底用 |

所有向量走 `bge-m3`（1024维，中英混合支持好）。

### 岗位 embedding 生成

| 向量名 | 输入文本 |
|---|---|
| `skill_vec` | `required_skills + nice_to_have_skills` 拼接 |
| `capability_vec` | **新增**：`required_capabilities` 列表拼接 |
| `responsibility_vec` | `title + responsibilities + requirements` |
| `summary_vec` | LLM生成的岗位摘要 |

### 召回策略

对每个岗位向量维度分别在 Qdrant TopK 查询（默认 K=50），payload 预过滤如上。

- `position.skill_vec → candidate.skill_vec` 取 TopK
- `position.capability_vec → candidate.capability_vec` 取 TopK
- `position.responsibility_vec → candidate.project_vec` 取 TopK
- `position.responsibility_vec → candidate.experience_vec` 取 TopK
- `position.summary_vec → candidate.summary_vec` 取 TopK

合并五路结果取**并集**，得到召回候选池（通常 100-200 人）。每个候选人保留各维度的最高相似度分数，供重排使用。

---

## 阶段二：重排（Rerank）

对召回池的每个候选人计算六个维度的子分数（0-100），加权求和得总分。**权重来自 `weight_profile`，顾问可调。**

### 维度权重（默认）

| 维度 | 权重 | 说明 |
|---|---|---|
| 能力（提炼） | **0.40** | LLM从经历中读出的真实能力 |
| 技能（声称） | **0.20** | 简历中明写的技能标签 |
| 薪资 | 0.15 | 期望区间重叠率 |
| 行业 | 0.10 | 技能底座 |
| 学历 | 0.10 | 等级差打分 |
| 简历质量 | 0.05 | 候选人固有属性 |
| 城市 | 0 | 不参与打分，保留字段 |

合计 1.00。

---

### 维度1：能力匹配度 `score_capability`（最核心）

**输入**：岗位 `required_capabilities`（含 `must` / `nice` 优先级）；候选人 `derived_capabilities`；双方 `capability_vec`。

**算法**：
```
must_caps   = [c for c in pos.required_capabilities if c.priority == 'must']
nice_caps   = [c for c in pos.required_capabilities if c.priority == 'nice']

must_hit = 语义命中率(must_caps, cand.derived_capabilities)  # 用同义词表 + 小模型判断是否"覆盖"
nice_hit = 语义命中率(nice_caps, cand.derived_capabilities)
vec_sim  = cosine(pos.capability_vec, cand.capability_vec)   # 0~1

score_capability = 100 * (0.55 * must_hit + 0.20 * nice_hit + 0.25 * vec_sim)
```

"语义命中"不用字符串相等，而是对每条 must 能力在候选人能力列表里找最相似的一条（bge-m3 cosine > 0.75 视为命中），支持"分布式训练" ≈ "大规模并行训练" 这种。

---

### 维度2：技能匹配度 `score_skill`

**输入**：岗位 `required_skills` / `nice_to_have_skills`；候选人 `skills` + `skill_vec`。

**算法**：
```
required_hit_rate = |required_skills ∩ candidate_skills| / |required_skills|
nice_hit_rate     = |nice_to_have ∩ candidate_skills| / max(|nice_to_have|, 1)
vec_sim           = cosine(position.skill_vec, candidate.skill_vec)

score_skill = 100 * (0.6 * required_hit_rate + 0.2 * nice_hit_rate + 0.2 * vec_sim)
```

关键词命中用**归一化匹配**（小写、去空格、同义词表扩展，如"pytorch" ≈ "PyTorch"、"LLM" ≈ "大模型"）。同义词表放配置文件，可增删。

---

### 维度3：薪资适配度 `score_salary`

用**区间重叠率**，避免硬卡：
```
overlap = max(0, min(pos.salary_max, c.expected_max) - max(pos.salary_min, c.expected_min))
union   = max(pos.salary_max, c.expected_max) - min(pos.salary_min, c.expected_min)
score_salary = 100 * overlap / union  if union > 0 else 0
```

若候选人期望未填，取 `current_salary * 1.2` 作为隐含期望。

---

### 维度4：行业相关度 `score_industry`

```
vec_sim = cosine(position.responsibility_vec, candidate.experience_vec)
tag_overlap = |company.industry_tags ∩ candidate.industry_tags| / max(|company.industry_tags|, 1)
score_industry = 100 * (0.7 * vec_sim + 0.3 * tag_overlap)
```

---

### 维度5：学历匹配 `score_education`

岗位如未指定最低学历，统一给 80。否则按学历等级差打分：
```
levels = {'高中':1, '专科':2, '本科':3, '硕士':4, '博士':5}
diff = candidate_level - required_level
100 if diff >= 0 else max(0, 100 + diff * 30)
```

---

### 维度6：简历质量 `score_resume_quality`

**输入**：候选人 `resume_quality_score`（0-100，简历解析阶段 LLM 评出，存在候选人表）。

**算法**：
```
score_resume_quality = candidate.resume_quality_score
```

不跟岗位做任何匹配，直接读。这是候选人固有属性，所有岗位通用。

#### LLM 评分提示词要点

让 GLM 按三个要素打分，各占三分之一：

| 要素 | 什么算好 | 什么算差 |
|---|---|---|
| 描述详尽度 | 每段经历有项目背景、技术栈、产出 | 只写"负责XX项目" |
| 因果/动机说明 | 说清为什么做这个选择、解决了什么问题 | 只罗列任务清单 |
| 实例与量化 | 有具体成果数字（QPS提升30%、MAU 500k等） | 全是形容词、无数据 |

输出 JSON：
```json
{
  "score": 82,
  "dimensions": {
    "detail":    {"score": 85, "comment": "工作经历描述详细，技术栈明确"},
    "causality": {"score": 70, "comment": "项目动机清晰，但技术选型未解释"},
    "evidence":  {"score": 90, "comment": "有具体数据：训练效率提升40%、模型准确率91.2%"}
  },
  "overall_comment": "简历整体质量较好，建议补充技术选型的决策理由"
}
```

最终 `score` 取三维平均或让 LLM 直接给（两种都行，我建议取三维平均以约束LLM）。

---

### 总分

```
weights = weight_profile.weights
# 默认：{capability:0.40, skill:0.20, salary:0.15, industry:0.10, education:0.10, resume_quality:0.05, city:0}

total = Σ (weights[dim] * sub_scores[dim])
```

---

## 匹配点 / 差异点生成

每个维度在算分时同步产出一条**可读理由**，写入 `match_record.matched_points` / `gap_points`：

### 匹配点（正向）示例
- 能力：`"在「多模态大模型训练」能力上匹配度高，候选人有字节跳动AI Lab的相关项目作为佐证"`
- 技能：`"命中 5/6 项硬性要求：PyTorch, Transformer, LangChain, RAG, CUDA"`
- 薪资：`"期望 35-50k，岗位提供 40-60k，区间重叠度 80%"`
- 行业：`"过往在 AI 医疗方向有 3 年项目经验，与岗位领域强相关"`
- 简历质量：`"简历书写优秀（评分 85），项目描述详尽、有量化成果"`

### 差异点（反向）示例
- 能力：`"岗位要求的「大规模分布式训练」能力在候选人经历中未见体现"`
- 技能：`"缺少硬性要求：TensorRT；nice-to-have 未命中：Triton"`
- 薪资：`"期望 60-80k，岗位上限 50k，高出预算 20%"`
- 简历质量：`"简历书写偏弱（评分 55），缺少具体成果数据，建议补充再推送"`

**能力维度的匹配点特别有价值**：它不仅说"匹配了"，还能指出证据在哪段经历，帮助顾问和企业判断可信度。

---

## 权重调整与 A/B

- 默认权重方案：`{capability:0.40, skill:0.20, salary:0.15, industry:0.10, education:0.10, resume_quality:0.05, city:0}`
- 顾问可在 `weight_profile` 新建方案（如"极度看重能力"：`{capability:0.60, skill:0.10, ...}`）
- 触发匹配时传 `weight_profile_id`，不传用 default
- 同一个 (position, candidate) 配不同权重方案会存多条 match_record，便于对比

---

## 冷启动与无向量兜底

新录入、向量还没生成的候选人不会进入召回池。兜底方案：
- 后台 Celery 任务每分钟扫 `candidate.derived_capabilities IS NOT NULL AND no vector`，补生成
- 匹配接口返回前，检查岗位是否有向量；没有则先同步生成

## 简历质量分缺失的处理

- 手动录入的候选人没走 LLM 评分，`resume_quality_score` 为 NULL
- 打分时若为 NULL，该维度给 70（中性值），并在差异点里标注"未做简历质量评估"

---

## 性能预算

- 硬过滤 + 召回：5 路 TopK=50，Qdrant 单次 <10ms，总 <60ms
- 重排：召回池 ~150 人，每人 6 维度，纯计算 <150ms（能力维度语义命中会多耗时一点）
- 端到端：<250ms（不含 embedding 生成）
- embedding 生成：bge-m3 单条 ~80ms（CPU），batch=32 约 500ms，写入 Qdrant <50ms
- LLM 能力提炼 + 质量评分：一份简历约 5-15s（GLM-4-9B 本地推理），走 Celery 异步，不阻塞

匹配触发接口可以同步响应（<1s）。设计成异步任务主要支持"批量岗位匹配"、"全量重跑"等场景。
