import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
} from "antd";
import { CheckOutlined, CloseOutlined, EditOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { positionsApi, type Position, type PositionCreate } from "@/api/positions";
import { companiesApi, type Company } from "@/api/companies";
import { matchesApi, type MatchItem } from "@/api/matches";
import FollowUpSection from "@/components/FollowUpSection";
import CandidateDetailDrawer from "@/components/CandidateDetailDrawer";

const { Text, Paragraph } = Typography;

const STATUS_MAP: Record<string, { color: string; text: string }> = {
  open: { color: "green", text: "招聘中" },
  paused: { color: "orange", text: "暂停" },
  closed: { color: "red", text: "已关闭" },
  filled: { color: "blue", text: "已招满" },
};

const JOB_STATUS_LABEL: Record<string, { color: string; text: string }> = {
  active: { color: "green", text: "积极求职" },
  watching: { color: "blue", text: "观望中" },
  onboarded: { color: "default", text: "已入职" },
};

interface Props {
  positionId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function PositionDetailDrawer({ positionId, open, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Position | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const [matchLoading, setMatchLoading] = useState(false);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [pickedCandidate, setPickedCandidate] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !positionId) {
      setData(null);
      setCompany(null);
      setMatches([]);
      setEditing(false);
      return;
    }
    setLoading(true);
    setEditing(false);
    positionsApi
      .get(positionId)
      .then(async (p) => {
        setData(p);
        try {
          const cs = await companiesApi.list({ page: 1, page_size: 100 });
          setCompany(cs.items.find((c) => c.id === p.company_id) ?? null);
        } catch {
          /* 没企业列表权限就跳过 */
        }
      })
      .catch((e: any) => {
        message.error(e?.response?.data?.detail ?? "加载失败");
      })
      .finally(() => setLoading(false));
  }, [open, positionId]);

  useEffect(() => {
    if (editing && data) {
      form.setFieldsValue({
        title: data.title,
        type: data.type ?? undefined,
        responsibilities: data.responsibilities ?? undefined,
        requirements: data.requirements ?? undefined,
        required_skills_csv: (data.required_skills ?? []).join(", "),
        nice_to_have_skills_csv: (data.nice_to_have_skills ?? []).join(", "),
        min_years: data.min_years ?? undefined,
        max_years: data.max_years ?? undefined,
        required_education: data.required_education ?? undefined,
        salary_min: data.salary_min ?? undefined,
        salary_max: data.salary_max ?? undefined,
        city: data.city ?? undefined,
        remote_ok: data.remote_ok,
        headcount: data.headcount,
        benefits: data.benefits ?? undefined,
        onboard_deadline: data.onboard_deadline ?? undefined,
      });
    }
  }, [editing, data, form]);

  const handleSave = async () => {
    if (!data) return;
    const v = await form.validateFields();
    const splitCSV = (s: any): string[] =>
      typeof s === "string"
        ? s
            .split(",")
            .map((x: string) => x.trim())
            .filter(Boolean)
        : (s ?? []);
    const patch: Partial<PositionCreate> = {
      title: v.title,
      type: v.type,
      responsibilities: v.responsibilities,
      requirements: v.requirements,
      required_skills: splitCSV(v.required_skills_csv),
      nice_to_have_skills: splitCSV(v.nice_to_have_skills_csv),
      min_years: v.min_years,
      max_years: v.max_years,
      required_education: v.required_education,
      salary_min: v.salary_min,
      salary_max: v.salary_max,
      city: v.city,
      remote_ok: v.remote_ok,
      headcount: v.headcount,
      benefits: v.benefits,
      onboard_deadline: v.onboard_deadline,
    };
    setSaving(true);
    try {
      const fresh = await positionsApi.update(data.id, patch);
      setData(fresh);
      setEditing(false);
      onSaved?.();
      message.success("已保存,正在后台重新提炼能力…");
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const runMatch = async () => {
    if (!data) return;
    setMatchLoading(true);
    try {
      const r = await matchesApi.run({
        position_id: data.id,
        top_k: 50,
        limit: 10,
      });
      setMatches(r.results);
      if (r.results.length === 0) {
        message.info("暂无匹配结果,可去匹配页重建向量索引");
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "匹配失败");
    } finally {
      setMatchLoading(false);
    }
  };

  const yearsText = useMemo(() => {
    if (!data) return "-";
    if (data.min_years == null && data.max_years == null) return "-";
    return `${data.min_years ?? 0}-${data.max_years ?? "∞"} 年`;
  }, [data]);
  const salaryText = useMemo(() => {
    if (!data || data.salary_min == null) return "-";
    return `${data.salary_min}~${data.salary_max ?? "∞"} k/月`;
  }, [data]);

  return (
    <>
      <Drawer
        open={open}
        onClose={() => {
          setEditing(false);
          onClose();
        }}
        width={760}
        title={
          data ? (
            <Space>
              <span>{data.title}</span>
              <Text type="secondary" style={{ fontSize: 13 }}>
                #{data.id}
              </Text>
              <Tag color={STATUS_MAP[data.status]?.color ?? "default"}>
                {STATUS_MAP[data.status]?.text ?? data.status}
              </Tag>
              {editing && (
                <Tag color="gold" style={{ marginLeft: 4 }}>
                  编辑中
                </Tag>
              )}
            </Space>
          ) : (
            "岗位详情"
          )
        }
        extra={
          data &&
          (editing ? (
            <Space>
              <Button icon={<CloseOutlined />} onClick={() => setEditing(false)}>
                取消
              </Button>
              <Button type="primary" icon={<CheckOutlined />} loading={saving} onClick={handleSave}>
                保存
              </Button>
            </Space>
          ) : (
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)} type="text">
              编辑
            </Button>
          ))
        }
      >
        {loading || !data ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Spin />
          </div>
        ) : (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {/* 基本信息 */}
            <Card size="small" title="基本信息" styles={{ body: { padding: 12 } }}>
              {editing ? (
                <Form form={form} layout="vertical">
                  <Row gutter={12}>
                    <Col span={16}>
                      <Form.Item
                        name="title"
                        label="岗位名称"
                        rules={[{ required: true, message: "必填" }]}
                      >
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="type" label="类型">
                        <Select
                          allowClear
                          options={[
                            { value: "AI算法", label: "AI算法" },
                            { value: "AI产品", label: "AI产品" },
                            { value: "数据", label: "数据" },
                            { value: "工程", label: "工程" },
                            { value: "其他", label: "其他" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="city" label="城市">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="headcount" label="招聘人数">
                        <InputNumber min={1} max={50} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="remote_ok" label="可远程" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="min_years" label="最低年限">
                        <InputNumber min={0} max={40} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="max_years" label="最高年限">
                        <InputNumber min={0} max={40} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="required_education" label="学历要求">
                        <Select
                          allowClear
                          options={[
                            { value: "专科", label: "专科" },
                            { value: "本科", label: "本科" },
                            { value: "硕士", label: "硕士" },
                            { value: "博士", label: "博士" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="salary_min" label="薪资下限 (k/月)">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="salary_max" label="薪资上限 (k/月)">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="onboard_deadline" label="到岗截止日">
                        <Input type="date" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              ) : (
                <Descriptions column={2} size="small" bordered>
                  <Descriptions.Item label="企业">
                    {company?.name ?? `#${data.company_id}`}
                  </Descriptions.Item>
                  <Descriptions.Item label="类型">{data.type ?? "-"}</Descriptions.Item>
                  <Descriptions.Item label="城市">
                    {data.city ?? "-"}
                    {data.remote_ok && (
                      <Tag color="green" style={{ marginLeft: 6 }}>
                        可远程
                      </Tag>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="工作年限">{yearsText}</Descriptions.Item>
                  <Descriptions.Item label="学历要求">
                    {data.required_education ?? "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="薪资">{salaryText}</Descriptions.Item>
                  <Descriptions.Item label="招聘人数">{data.headcount}</Descriptions.Item>
                  <Descriptions.Item label="到岗截止日">
                    {data.onboard_deadline ?? "-"}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </Card>

            {/* 技能与能力 */}
            <Card size="small" title="技能与能力" styles={{ body: { padding: 12 } }}>
              {editing ? (
                <Form form={form} layout="vertical">
                  <Form.Item
                    name="required_skills_csv"
                    label="必须技能(逗号分隔)"
                    extra="例:PyTorch, Transformer, RLHF"
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item name="nice_to_have_skills_csv" label="加分技能(逗号分隔)">
                    <Input />
                  </Form.Item>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    能力由 AI 从 JD 提炼，暂不在此处编辑
                  </Text>
                </Form>
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                      必须技能
                    </Text>
                    {(data.required_skills ?? []).length === 0 ? (
                      <Text type="secondary">-</Text>
                    ) : (
                      <Space size={[0, 6]} wrap>
                        {data.required_skills.map((s) => (
                          <Tag key={s} color="red">
                            {s}
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                      加分技能
                    </Text>
                    {(data.nice_to_have_skills ?? []).length === 0 ? (
                      <Text type="secondary">-</Text>
                    ) : (
                      <Space size={[0, 6]} wrap>
                        {data.nice_to_have_skills.map((s) => (
                          <Tag key={s} color="blue">
                            {s}
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                      能力
                    </Text>
                    {!data.required_capabilities || data.required_capabilities.length === 0 ? (
                      <Text type="secondary">等待 AI 提炼</Text>
                    ) : (
                      <Space size={[0, 6]} wrap>
                        {data.required_capabilities.map((c, i) => (
                          <Tag key={i} color={c.priority === "must" ? "red" : "blue"}>
                            {c.capability}
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </div>
                </>
              )}
            </Card>

            {/* 职责与要求 */}
            {!editing && (data.responsibilities || data.requirements || data.benefits) && (
              <Card size="small" title="职责与要求" styles={{ body: { padding: 12 } }}>
                {data.responsibilities && (
                  <div style={{ marginBottom: 12 }}>
                    <Text strong>岗位职责</Text>
                    <Paragraph style={{ marginBottom: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>
                      {data.responsibilities}
                    </Paragraph>
                  </div>
                )}
                {data.requirements && (
                  <div style={{ marginBottom: 12 }}>
                    <Text strong>任职要求</Text>
                    <Paragraph style={{ marginBottom: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>
                      {data.requirements}
                    </Paragraph>
                  </div>
                )}
                {data.benefits && (
                  <div>
                    <Text strong>福利</Text>
                    <Paragraph style={{ marginBottom: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>
                      {data.benefits}
                    </Paragraph>
                  </div>
                )}
              </Card>
            )}
            {editing && (
              <Card size="small" title="职责与要求" styles={{ body: { padding: 12 } }}>
                <Form form={form} layout="vertical">
                  <Form.Item name="responsibilities" label="岗位职责">
                    <Input.TextArea rows={4} />
                  </Form.Item>
                  <Form.Item name="requirements" label="任职要求">
                    <Input.TextArea rows={4} />
                  </Form.Item>
                  <Form.Item name="benefits" label="福利">
                    <Input.TextArea rows={2} />
                  </Form.Item>
                </Form>
              </Card>
            )}

            {/* 匹配候选人 */}
            {!editing && (
              <Card
                size="small"
                title={
                  <Space>
                    <span>匹配候选人</span>
                    {matches.length > 0 && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Top {matches.length}
                      </Text>
                    )}
                  </Space>
                }
                extra={
                  <Button
                    size="small"
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    loading={matchLoading}
                    onClick={runMatch}
                  >
                    {matches.length > 0 ? "重新匹配" : "开始匹配"}
                  </Button>
                }
                styles={{ body: { padding: 12 } }}
              >
                {matches.length === 0 ? (
                  <Empty
                    description={matchLoading ? "匹配中…" : "点击右上角开始匹配,看 Top 10"}
                    imageStyle={{ height: 40 }}
                  />
                ) : (
                  <List
                    size="small"
                    dataSource={matches}
                    renderItem={(m) => (
                      <List.Item
                        style={{ cursor: "pointer", padding: "8px 0" }}
                        onClick={() => setPickedCandidate(m.candidate_id)}
                      >
                        <Row style={{ width: "100%" }} align="middle" gutter={8}>
                          <Col flex="80px">
                            <Text
                              style={{
                                fontSize: 22,
                                fontWeight: 600,
                                color: "#1677ff",
                              }}
                            >
                              {m.score.toFixed(0)}
                            </Text>
                          </Col>
                          <Col flex="auto">
                            <div>
                              <Text strong>{m.candidate_name}</Text>
                              <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                                #{m.candidate_id}
                              </Text>
                              {m.job_status && (
                                <Tag
                                  color={JOB_STATUS_LABEL[m.job_status]?.color ?? "default"}
                                  style={{ marginLeft: 6 }}
                                >
                                  {JOB_STATUS_LABEL[m.job_status]?.text ?? m.job_status}
                                </Tag>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                              {[
                                m.city,
                                m.industry,
                                m.years_of_experience != null ? `${m.years_of_experience}年` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "-"}
                            </div>
                          </Col>
                        </Row>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            )}

            {/* 跟进记录(按 position 过滤) */}
            {!editing && <FollowUpSection positionId={data.id} />}
          </Space>
        )}
      </Drawer>

      {/* 嵌套候选人详情 */}
      <CandidateDetailDrawer
        candidateId={pickedCandidate}
        open={pickedCandidate != null}
        onClose={() => setPickedCandidate(null)}
      />
    </>
  );
}
