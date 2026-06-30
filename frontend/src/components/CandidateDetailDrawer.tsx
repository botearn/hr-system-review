import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  FilePdfOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { candidatesApi, type CandidateDetail } from "@/api/candidates";
import FollowUpSection from "@/components/FollowUpSection";
import ContactPopover from "@/components/ContactPopover";
import AIAssessmentCard from "@/components/AIAssessmentCard";
import MatchContextBanner from "@/components/MatchContextBanner";
import WebProfileCard from "@/components/WebProfileCard";
import StatusChangeModal from "@/components/StatusChangeModal";
import NewFollowUpModal from "@/components/NewFollowUpModal";
import CandidateOutcomeTimeline from "@/components/CandidateOutcomeTimeline";

const { Text, Paragraph } = Typography;

// Maps follow-up `to_status` enum -> display label / antd Tag color.
// Used to render the candidate's *current* pipeline stage in the drawer.
const PIPELINE_STAGE: Record<string, { color: string; text: string }> = {
  initial_contact: { color: "default", text: "初步沟通" },
  resume_pushed: { color: "blue", text: "已推送" },
  interview_scheduled: { color: "geekblue", text: "面试安排中" },
  interview_1_passed: { color: "geekblue", text: "一面通过" },
  interview_2_passed: { color: "purple", text: "二面通过" },
  offer_sent: { color: "orange", text: "Offer 发放" },
  onboarded: { color: "green", text: "已入职" },
  rejected_1: { color: "red", text: "一面淘汰" },
  rejected_2: { color: "red", text: "二面淘汰" },
  declined_offer: { color: "red", text: "拒绝 Offer" },
  dropped: { color: "default", text: "流失" },
};

export interface MatchContextProp {
  position_id: number;
  position_title: string;
  score: number;
  sub_scores: Record<string, number>;
  matched_points: Array<{ dim: string; detail: string }>;
  gap_points: Array<{ dim: string; detail: string }>;
  rank_reason: string;
  analysis: string;
  interview_advice: string[];
}

interface Props {
  candidateId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** When provided, the drawer renders match-mode (banner + AI 评估 against this position). */
  matchContext?: MatchContextProp | null;
}

interface EditFormValues {
  name: string;
  phone?: string;
  email?: string;
  wechat?: string;
  city?: string;
  industry?: string;
  years_of_experience?: number;
  education_level?: string;
  current_salary_min?: number;
  current_salary_max?: number;
  expected_salary_min?: number;
  expected_salary_max?: number;
  skills_csv?: string;
  notes?: string;
}

export default function CandidateDetailDrawer({
  candidateId,
  open,
  onClose,
  onSaved,
  matchContext = null,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CandidateDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<string>("overview");
  const [statusOpen, setStatusOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [outcomeReloadKey, setOutcomeReloadKey] = useState(0);
  const [form] = Form.useForm<EditFormValues>();

  // Refetches the candidate detail. Called on first open + after any
  // mutation (status change / new follow-up / edit) so the drawer's own
  // displayed `last_follow_status` etc. stay in sync.
  const refetch = async (resetTab = false) => {
    if (!candidateId) return;
    setLoading(true);
    if (resetTab) {
      setEditing(false);
      setTab("overview");
    }
    try {
      setData(await candidatesApi.get(candidateId));
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !candidateId) {
      setData(null);
      setEditing(false);
      setTab("overview");
      return;
    }
    refetch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidateId]);

  useEffect(() => {
    if (editing && data) {
      const toDateStr = (s: string | null) => (s ? s.slice(0, 10) : undefined);
      form.setFieldsValue({
        name: data.name,
        phone: data.phone ?? undefined,
        email: data.email ?? undefined,
        wechat: data.wechat ?? undefined,
        city: data.city ?? undefined,
        industry: data.industry ?? undefined,
        years_of_experience: data.years_of_experience ?? undefined,
        education_level: data.education_level ?? undefined,
        current_salary_min: data.current_salary_min ?? undefined,
        current_salary_max: data.current_salary_max ?? undefined,
        expected_salary_min: data.expected_salary_min ?? undefined,
        expected_salary_max: data.expected_salary_max ?? undefined,
        skills_csv: (data.skills ?? []).join(", "),
        experiences: data.experiences.map((e) => ({
          company_name: e.company_name,
          position_title: e.position_title,
          start_date: toDateStr(e.start_date),
          end_date: toDateStr(e.end_date),
          description: e.description ?? undefined,
        })),
        projects: data.projects.map((p) => ({
          project_name: p.project_name,
          role: p.role ?? undefined,
          start_date: toDateStr(p.start_date),
          end_date: toDateStr(p.end_date),
          description: p.description ?? undefined,
          tech_stack_csv: (p.tech_stack ?? []).join(", "),
        })),
        educations: data.educations.map((e) => ({
          school: e.school,
          degree: e.degree ?? undefined,
          major: e.major ?? undefined,
          start_date: toDateStr(e.start_date),
          end_date: toDateStr(e.end_date),
        })),
      } as any);
    }
  }, [editing, data, form]);

  // Render an experience/project/education date range. When BOTH ends are
  // null (e.g. agent imported a resume that wrote "2023 Q3" — which our
  // loose-date parser couldn't pin down), return "" so the caller can hide
  // the line entirely instead of showing the absurd "至今 ~ 至今".
  const fmtDateRange = (start: string | null, end: string | null): string => {
    if (!start && !end) return "";
    if (start && !end) return `${start.slice(0, 7)} ~ 至今`;
    if (!start && end) return `— ~ ${end.slice(0, 7)}`;
    return `${(start as string).slice(0, 7)} ~ ${(end as string).slice(0, 7)}`;
  };
  const fmtSalary = (min: number | null, max: number | null): string =>
    min == null && max == null ? "-" : `${min ?? "?"}-${max ?? "?"}k/月`;

  const subline = useMemo(() => {
    if (!data) return "";
    const parts: string[] = [];
    if (data.years_of_experience != null) parts.push(`${data.years_of_experience} 年经验`);
    if (data.city) parts.push(data.city);
    if (data.industry) parts.push(data.industry);
    if (data.education_level) parts.push(data.education_level);
    return parts.join(" · ");
  }, [data]);

  const handleSave = async () => {
    if (!data) return;
    const values: any = await form.validateFields();
    const skills =
      typeof values.skills_csv === "string"
        ? values.skills_csv
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : undefined;
    const csvToArr = (s: string | undefined): string[] =>
      typeof s === "string"
        ? s
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
    const emptyToNull = (v: any) => (v === "" ? null : v);
    setSaving(true);
    try {
      await candidatesApi.update(data.id, {
        name: values.name,
        phone: values.phone,
        email: values.email,
        city: values.city,
        industry: values.industry,
        years_of_experience: values.years_of_experience,
        education_level: values.education_level,
        current_salary_min: values.current_salary_min,
        current_salary_max: values.current_salary_max,
        expected_salary_min: values.expected_salary_min,
        expected_salary_max: values.expected_salary_max,
        skills,
        notes: values.notes,
        experiences: (values.experiences ?? []).map((e: any) => ({
          company_name: e.company_name,
          position_title: e.position_title,
          start_date: emptyToNull(e.start_date),
          end_date: emptyToNull(e.end_date),
          description: e.description ?? null,
        })),
        projects: (values.projects ?? []).map((p: any) => ({
          project_name: p.project_name,
          role: p.role ?? null,
          start_date: emptyToNull(p.start_date),
          end_date: emptyToNull(p.end_date),
          description: p.description ?? null,
          tech_stack: csvToArr(p.tech_stack_csv),
        })),
        educations: (values.educations ?? []).map((edu: any) => ({
          school: edu.school,
          degree: edu.degree ?? null,
          major: edu.major ?? null,
          start_date: emptyToNull(edu.start_date),
          end_date: emptyToNull(edu.end_date),
        })),
      } as any);
      message.success("已保存");
      const fresh = await candidatesApi.get(data.id);
      setData(fresh);
      setEditing(false);
      onSaved?.();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const openResume = async () => {
    if (!data?.resume_file_id) return;
    try {
      const res = await candidatesApi.resumeBlob(data.id);
      const mime = (res.headers["content-type"] as string) || "application/octet-stream";
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "打开失败");
    }
  };

  const titleNode = data ? (
    <Space size={8} wrap>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{data.name}</span>
      <Text type="secondary" style={{ fontSize: 12 }}>
        #{data.id}
      </Text>
      {editing && (
        <Tag color="gold" style={{ marginLeft: 4 }}>
          编辑中
        </Tag>
      )}
    </Space>
  ) : (
    "候选人详情"
  );

  const headerExtra = data ? (
    editing ? (
      <Space>
        <Button icon={<CloseOutlined />} onClick={() => setEditing(false)}>
          取消
        </Button>
        <Button type="primary" icon={<CheckOutlined />} loading={saving} onClick={handleSave}>
          保存
        </Button>
      </Space>
    ) : (
      <Space>
        <ContactPopover
          candidateId={data.id}
          candidateName={data.name}
          phone={data.phone}
          email={data.email}
          wechat={data.wechat}
          onLogged={() => {
            refetch();
            onSaved?.();
          }}
        />
        <Dropdown
          menu={{
            items: [
              {
                key: "edit",
                icon: <EditOutlined />,
                label: "编辑全部",
                onClick: () => setEditing(true),
              },
              {
                key: "status",
                label: `更改状态${
                  data.last_follow_status && PIPELINE_STAGE[data.last_follow_status]
                    ? ` (当前: ${PIPELINE_STAGE[data.last_follow_status].text})`
                    : ""
                }`,
                onClick: () => setStatusOpen(true),
              },
              {
                key: "log",
                label: "记一笔沟通",
                onClick: () => setLogOpen(true),
              },
              { type: "divider" },
              {
                key: "delete",
                icon: <DeleteOutlined />,
                label: "删除候选人",
                danger: true,
                onClick: () => {
                  Modal.confirm({
                    title: `删除候选人「${data.name}」？`,
                    content: "软删除，可在后台恢复。同时会从看板/列表/卡片视图中移除。",
                    okText: "确认删除",
                    okType: "danger",
                    cancelText: "取消",
                    onOk: async () => {
                      try {
                        await candidatesApi.void(data.id);
                        message.success("已删除");
                        onSaved?.();
                        onClose();
                      } catch (e: any) {
                        message.error(e?.response?.data?.detail ?? "删除失败");
                      }
                    },
                  });
                },
              },
            ],
          }}
          placement="bottomRight"
          trigger={["click"]}
        >
          <Button icon={<MoreOutlined />} type="text" />
        </Dropdown>
      </Space>
    )
  ) : null;

  // ── Overview tab ─────────────────────────────────────────────────────────
  const overviewTab = !data ? null : (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      <AIAssessmentCard
        candidate={data}
        matchContext={matchContext}
        onCapabilitiesDerived={async () => {
          await refetch();
          onSaved?.();
        }}
      />

      <Card size="small" title="基本资料" styles={{ body: { padding: 12 } }}>
        {editing ? (
          <Form form={form} layout="vertical">
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="name" label="姓名" rules={[{ required: true, message: "必填" }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="phone" label="手机">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="email" label="邮箱">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="wechat" label="微信">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="city" label="城市">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="industry" label="行业">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="years_of_experience" label="工作年限">
                  <InputNumber min={0} max={50} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="education_level" label="学历">
                  <Select
                    allowClear
                    options={[
                      { value: "高中", label: "高中" },
                      { value: "专科", label: "专科" },
                      { value: "本科", label: "本科" },
                      { value: "硕士", label: "硕士" },
                      { value: "博士", label: "博士" },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="期望薪资 (k/月)" style={{ marginBottom: 0 }}>
                  <Space.Compact style={{ width: "100%" }}>
                    <Form.Item name="expected_salary_min" noStyle>
                      <InputNumber min={0} style={{ width: "50%" }} placeholder="下限" />
                    </Form.Item>
                    <Form.Item name="expected_salary_max" noStyle>
                      <InputNumber min={0} style={{ width: "50%" }} placeholder="上限" />
                    </Form.Item>
                  </Space.Compact>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        ) : (
          <Descriptions column={2} size="small">
            <Descriptions.Item label="当前阶段">
              {data.last_follow_status && PIPELINE_STAGE[data.last_follow_status] ? (
                <Tag color={PIPELINE_STAGE[data.last_follow_status].color}>
                  {PIPELINE_STAGE[data.last_follow_status].text}
                </Tag>
              ) : (
                <Tag>未跟进</Tag>
              )}
            </Descriptions.Item>
            {data.landed_company && (
              <Descriptions.Item label="去向" span={2}>
                <Tag color="green" style={{ marginRight: 8 }}>
                  已入职
                </Tag>
                <span style={{ color: "#1a1a4e", fontWeight: 500 }}>{data.landed_company}</span>
                {data.landed_role && (
                  <span style={{ color: "#52527a" }}> · {data.landed_role}</span>
                )}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="手机">{data.phone ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{data.email ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="微信">{data.wechat ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="城市">{data.city ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="行业">{data.industry ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="年限">
              {data.years_of_experience ?? "-"} 年
            </Descriptions.Item>
            <Descriptions.Item label="学历">{data.education_level ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="当前薪资">
              {fmtSalary(data.current_salary_min, data.current_salary_max)}
            </Descriptions.Item>
            <Descriptions.Item label="期望薪资">
              {fmtSalary(data.expected_salary_min, data.expected_salary_max)}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card size="small" title="技能" styles={{ body: { padding: 12 } }}>
        {editing ? (
          <Form form={form} layout="vertical">
            <Form.Item
              name="skills_csv"
              label="技能 (逗号分隔)"
              extra="例: PyTorch, Transformer, CUDA"
              style={{ marginBottom: 0 }}
            >
              <Input />
            </Form.Item>
          </Form>
        ) : (data.skills ?? []).length === 0 ? (
          <Text type="secondary">未填写</Text>
        ) : (
          <Space size={[0, 6]} wrap>
            {data.skills.map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </Space>
        )}
      </Card>

      {editing && (
        <Card size="small" title="备注" styles={{ body: { padding: 12 } }}>
          <Form form={form} layout="vertical">
            <Form.Item name="notes" noStyle>
              <Input.TextArea rows={3} placeholder="补充信息、沟通记录" />
            </Form.Item>
          </Form>
        </Card>
      )}
    </Space>
  );

  // ── Resume & history tab ─────────────────────────────────────────────────
  const resumeTab = !data ? null : (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      {(data.resume_file_id || data.resume_source_url) && (
        <Card size="small" title="原简历" styles={{ body: { padding: 12 } }}>
          <Space wrap>
            {data.resume_file_id && (
              <Button icon={<FilePdfOutlined />} onClick={openResume}>
                查看原文件
                {data.resume_file_name ? (
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                    {data.resume_file_name}
                  </Text>
                ) : null}
              </Button>
            )}
            {data.resume_source_url && (
              <Button
                icon={<LinkOutlined />}
                onClick={() => window.open(data.resume_source_url!, "_blank", "noopener,noreferrer")}
              >
                打开来源链接
              </Button>
            )}
          </Space>
        </Card>
      )}

      {editing ? (
        <ExperiencesEditor form={form} />
      ) : (
        <Card size="small" title="工作经历" styles={{ body: { padding: 16 } }}>
          {data.experiences.length === 0 ? (
            <Empty description="无记录" imageStyle={{ height: 40 }} />
          ) : (
            <Timeline
              items={data.experiences.map((e) => ({
                children: (
                  <div>
                    <Text strong>{e.company_name}</Text>
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      {e.position_title}
                    </Text>
                    {fmtDateRange(e.start_date, e.end_date) && (
                      <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 2 }}>
                        {fmtDateRange(e.start_date, e.end_date)}
                      </div>
                    )}
                    {e.description && (
                      <Paragraph style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}>
                        {e.description}
                      </Paragraph>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </Card>
      )}

      {editing ? (
        <ProjectsEditor form={form} />
      ) : (
        data.projects.length > 0 && (
          <Card size="small" title="项目" styles={{ body: { padding: 16 } }}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {data.projects.map((p) => (
                <div key={p.id}>
                  <Space>
                    <Text strong>{p.project_name}</Text>
                    {p.role && <Tag>{p.role}</Tag>}
                  </Space>
                  {fmtDateRange(p.start_date, p.end_date) && (
                    <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 2 }}>
                      {fmtDateRange(p.start_date, p.end_date)}
                    </div>
                  )}
                  {p.description && (
                    <Paragraph style={{ marginTop: 4, marginBottom: 4, fontSize: 13 }}>
                      {p.description}
                    </Paragraph>
                  )}
                  {p.tech_stack.length > 0 && (
                    <Space size={[0, 4]} wrap>
                      {p.tech_stack.map((t) => (
                        <Tag key={t} color="blue">
                          {t}
                        </Tag>
                      ))}
                    </Space>
                  )}
                </div>
              ))}
            </Space>
          </Card>
        )
      )}

      {editing ? (
        <EducationsEditor form={form} />
      ) : (
        data.educations.length > 0 && (
          <Card size="small" title="教育背景" styles={{ body: { padding: 16 } }}>
            <Space direction="vertical" size={6} style={{ width: "100%" }}>
              {data.educations.map((e) => (
                <div key={e.id}>
                  <Space wrap>
                    <Text strong>{e.school}</Text>
                    {e.degree && <Tag>{e.degree}</Tag>}
                    {e.major && <Text type="secondary">{e.major}</Text>}
                  </Space>
                  {fmtDateRange(e.start_date, e.end_date) && (
                    <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                      {fmtDateRange(e.start_date, e.end_date)}
                    </div>
                  )}
                </div>
              ))}
            </Space>
          </Card>
        )
      )}
    </Space>
  );

  // ── Activity tab ─────────────────────────────────────────────────────────
  const activityTab = !data ? null : <FollowUpSection candidateId={data.id} defaultCollapsed={false} />;

  return (
    <Drawer
      open={open}
      onClose={() => {
        setEditing(false);
        onClose();
      }}
      width={960}
      title={titleNode}
      extra={headerExtra}
    >
      {loading || !data ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : (
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          {/* identity sub-line */}
          <div
            style={{
              fontSize: 12,
              color: "#8c8c9a",
              marginTop: -8,
            }}
          >
            {subline}
            {data.last_follow_at && (
              <span style={{ marginLeft: 8 }}>
                · 上次联系: {data.last_follow_at.slice(0, 10)}
              </span>
            )}
          </div>

          {matchContext && !editing && (
            <MatchContextBanner
              positionTitle={matchContext.position_title}
              score={matchContext.score}
              onJumpToAssessment={() => setTab("overview")}
            />
          )}

          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: "overview", label: "概览", children: overviewTab },
              { key: "resume", label: "履历", children: resumeTab },
              { key: "activity", label: "跟进与活动", children: activityTab },
              {
                key: "web_profile",
                label: "网络画像",
                children: data ? (
                  <WebProfileCard
                    candidateId={data.id}
                    webProfile={data.web_profile}
                    updatedAt={data.web_profile_updated_at}
                    onRefreshed={() => refetch()}
                  />
                ) : null,
              },
              {
                key: "outcome",
                label: "去向",
                children: data ? (
                  <CandidateOutcomeTimeline
                    candidateId={data.id}
                    reloadKey={outcomeReloadKey}
                  />
                ) : null,
              },
            ]}
          />
        </Space>
      )}

      <StatusChangeModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        candidateId={data?.id ?? 0}
        currentStatus={(data?.last_follow_status as any) ?? null}
        onChanged={() => {
          refetch();
          setOutcomeReloadKey((k) => k + 1);
          onSaved?.();
        }}
      />
      <NewFollowUpModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        candidateId={data?.id ?? 0}
        candidateName={data?.name}
        onCreated={() => {
          refetch();
          onSaved?.();
        }}
      />
    </Drawer>
  );
}

// ─── Section editors (kept inline; only mounted in edit mode) ────────────────

function ExperiencesEditor({ form }: { form: any }) {
  return (
    <Card size="small" title="工作经历" styles={{ body: { padding: 16 } }}>
      <Form form={form} layout="vertical">
        <Form.List name="experiences">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    border: "1px dashed #d9d9d9",
                    borderRadius: 6,
                  }}
                >
                  <Row gutter={8}>
                    <Col span={12}>
                      <Form.Item
                        {...field}
                        name={[field.name, "company_name"]}
                        label="公司"
                        rules={[{ required: true, message: "必填" }]}
                        style={{ marginBottom: 8 }}
                      >
                        <Input placeholder="字节跳动" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        {...field}
                        name={[field.name, "position_title"]}
                        label="职位"
                        rules={[{ required: true, message: "必填" }]}
                        style={{ marginBottom: 8 }}
                      >
                        <Input placeholder="高级算法工程师" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        {...field}
                        name={[field.name, "start_date"]}
                        label="开始"
                        style={{ marginBottom: 8 }}
                      >
                        <Input type="date" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        {...field}
                        name={[field.name, "end_date"]}
                        label="结束 (留空为至今)"
                        style={{ marginBottom: 8 }}
                      >
                        <Input type="date" />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        {...field}
                        name={[field.name, "description"]}
                        label="描述"
                        style={{ marginBottom: 8 }}
                      >
                        <Input.TextArea rows={2} placeholder="项目成绩、业务指标" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => remove(field.name)}
                  >
                    删除这段
                  </Button>
                </div>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({})}>
                添加工作经历
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Card>
  );
}

function ProjectsEditor({ form }: { form: any }) {
  return (
    <Card size="small" title="项目" styles={{ body: { padding: 16 } }}>
      <Form form={form} layout="vertical">
        <Form.List name="projects">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    border: "1px dashed #d9d9d9",
                    borderRadius: 6,
                  }}
                >
                  <Row gutter={8}>
                    <Col span={16}>
                      <Form.Item
                        {...field}
                        name={[field.name, "project_name"]}
                        label="项目名"
                        rules={[{ required: true, message: "必填" }]}
                        style={{ marginBottom: 8 }}
                      >
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        {...field}
                        name={[field.name, "role"]}
                        label="角色"
                        style={{ marginBottom: 8 }}
                      >
                        <Input placeholder="主要开发者" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        {...field}
                        name={[field.name, "start_date"]}
                        label="开始"
                        style={{ marginBottom: 8 }}
                      >
                        <Input type="date" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        {...field}
                        name={[field.name, "end_date"]}
                        label="结束"
                        style={{ marginBottom: 8 }}
                      >
                        <Input type="date" />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        {...field}
                        name={[field.name, "description"]}
                        label="描述"
                        style={{ marginBottom: 8 }}
                      >
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        {...field}
                        name={[field.name, "tech_stack_csv"]}
                        label="技术栈 (逗号分隔)"
                        style={{ marginBottom: 8 }}
                      >
                        <Input placeholder="PyTorch, Transformer" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => remove(field.name)}
                  >
                    删除项目
                  </Button>
                </div>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({})}>
                添加项目
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Card>
  );
}

function EducationsEditor({ form }: { form: any }) {
  return (
    <Card size="small" title="教育背景" styles={{ body: { padding: 16 } }}>
      <Form form={form} layout="vertical">
        <Form.List name="educations">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    border: "1px dashed #d9d9d9",
                    borderRadius: 6,
                  }}
                >
                  <Row gutter={8}>
                    <Col span={12}>
                      <Form.Item
                        {...field}
                        name={[field.name, "school"]}
                        label="学校"
                        rules={[{ required: true, message: "必填" }]}
                        style={{ marginBottom: 8 }}
                      >
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        {...field}
                        name={[field.name, "degree"]}
                        label="学历"
                        style={{ marginBottom: 8 }}
                      >
                        <Select
                          allowClear
                          options={[
                            { value: "高中", label: "高中" },
                            { value: "专科", label: "专科" },
                            { value: "本科", label: "本科" },
                            { value: "硕士", label: "硕士" },
                            { value: "博士", label: "博士" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        {...field}
                        name={[field.name, "major"]}
                        label="专业"
                        style={{ marginBottom: 8 }}
                      >
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        {...field}
                        name={[field.name, "start_date"]}
                        label="入学"
                        style={{ marginBottom: 8 }}
                      >
                        <Input type="date" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        {...field}
                        name={[field.name, "end_date"]}
                        label="毕业"
                        style={{ marginBottom: 8 }}
                      >
                        <Input type="date" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => remove(field.name)}
                  >
                    删除这段
                  </Button>
                </div>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({})}>
                添加教育经历
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Card>
  );
}