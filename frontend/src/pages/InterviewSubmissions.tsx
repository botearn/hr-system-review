import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Form,
  InputNumber,
  Modal,
  Select,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { LinkOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { submissionsApi, type SubmissionListItem } from "@/api/submissions";
import { useAuthStore } from "@/store/auth";

const { Text, Link } = Typography;

const CHALLENGE_NAMES: Record<string, string> = {
  "01": "自动化简历筛选器",
  "02": "Webhook 事件转发工具",
  "03": "AI 产品每日报告 Pipeline",
  "04": "AI 竞品分析报告",
};

const GRADE_COLOR: Record<string, string> = {
  S: "purple",
  A: "green",
  B: "blue",
  C: "gold",
};

function fmtSeconds(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function InterviewSubmissions() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<SubmissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");

  // 打分 Modal
  const [scoreTarget, setScoreTarget] = useState<SubmissionListItem | null>(null);
  const [scoreLoading, setScoringLoading] = useState(false);
  const [form] = Form.useForm();

  const load = (status?: string) => {
    setLoading(true);
    submissionsApi
      .list(status === "all" ? undefined : status)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(tab);
  }, [tab]);

  const handleScore = async (values: { score: number; grade: string | null; notes: string | null }) => {
    if (!scoreTarget) return;
    setScoringLoading(true);
    try {
      await submissionsApi.score(scoreTarget.id, values);
      message.success("评估已保存");
      setScoreTarget(null);
      form.resetFields();
      load(tab);
    } catch {
      message.error("保存失败，请重试");
    } finally {
      setScoringLoading(false);
    }
  };

  // 统计
  const total = data.length;
  const pending = data.filter((s) => s.status === "pending_evaluation").length;
  const evaluated = data.filter((s) => s.status === "evaluated").length;

  const columns: ColumnsType<SubmissionListItem> = [
    {
      title: "提交者",
      width: 160,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>
            {r.submitter_name || r.submitter_username}
          </div>
          {r.submitter_email && (
            <div style={{ fontSize: 11, color: "#8c8c8c" }}>{r.submitter_email}</div>
          )}
        </div>
      ),
    },
    {
      title: "题目",
      width: 200,
      render: (_, r) => (
        <div>
          <Tag color="geekblue" style={{ marginBottom: 2 }}>
            #{r.challenge_id}
          </Tag>
          <div style={{ fontSize: 12 }}>{CHALLENGE_NAMES[r.challenge_id] ?? `挑战 ${r.challenge_id}`}</div>
        </div>
      ),
    },
    {
      title: "GitHub",
      width: 200,
      render: (_, r) => (
        <Tooltip title={r.github_url}>
          <Link href={r.github_url} target="_blank" style={{ fontSize: 12 }}>
            <LinkOutlined style={{ marginRight: 4 }} />
            {r.github_url.replace("https://github.com/", "").slice(0, 30)}
            {r.github_url.length > 42 ? "…" : ""}
          </Link>
        </Tooltip>
      ),
    },
    {
      title: "提交时间",
      width: 140,
      render: (_, r) => (
        <Text style={{ fontSize: 12 }}>
          {new Date(r.submitted_at).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      ),
      sorter: (a, b) =>
        new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime(),
      defaultSortOrder: "descend",
    },
    {
      title: "用时",
      width: 80,
      render: (_, r) =>
        r.time_spent_seconds ? (
          <Text style={{ fontSize: 12 }}>{fmtSeconds(r.time_spent_seconds)}</Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
        ),
    },
    {
      title: "状态",
      width: 100,
      render: (_, r) =>
        r.status === "evaluated" ? (
          <Badge status="success" text={<Text style={{ fontSize: 12 }}>已评估</Text>} />
        ) : (
          <Badge status="warning" text={<Text style={{ fontSize: 12 }}>待评估</Text>} />
        ),
    },
    {
      title: "得分 / 等级",
      width: 120,
      render: (_, r) =>
        r.score != null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{Math.round(r.score)}</span>
            {r.grade && <Tag color={GRADE_COLOR[r.grade]}>{r.grade}</Tag>}
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
        ),
    },
    {
      title: "候选人档案",
      width: 90,
      render: (_, r) =>
        r.candidate_id ? (
          <Button
            type="link"
            size="small"
            icon={<UserOutlined />}
            onClick={() => navigate(`/candidates?highlight=${r.candidate_id}`)}
          >
            查看
          </Button>
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>无档案</Text>
        ),
    },
    {
      title: "操作",
      width: 90,
      fixed: "right",
      render: (_, r) =>
        r.status === "pending_evaluation" ? (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              setScoreTarget(r);
              form.resetFields();
            }}
          >
            去评估
          </Button>
        ) : (
          <Button
            size="small"
            onClick={() => {
              setScoreTarget(r);
              form.setFieldsValue({ score: r.score, grade: r.grade, notes: r.notes });
            }}
          >
            修改评分
          </Button>
        ),
    },
  ];

  return (
    <div style={{ padding: "24px 28px" }}>
      {/* 页头 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a4e" }}>面试挑战管理</div>
          <div style={{ fontSize: 13, color: "#8c8c8c", marginTop: 2 }}>
            管理候选人提交的面试作品，进行评分与结果反馈
          </div>
        </div>
      </div>

      {/* 统计卡 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "总提交", value: total, color: "#1a1a4e" },
          { label: "待评估", value: pending, color: "#f59e0b" },
          { label: "已评估", value: evaluated, color: "#10b981" },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: "#fff",
              border: "1px solid #f0f0f0",
              borderRadius: 10,
              padding: "14px 24px",
              minWidth: 120,
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color, lineHeight: 1 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* 筛选 tabs + 表格 */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #f0f0f0",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        <Tabs
          activeKey={tab}
          onChange={setTab}
          style={{ padding: "0 16px" }}
          items={[
            { key: "all", label: "全部" },
            { key: "pending_evaluation", label: `待评估 ${pending > 0 ? `(${pending})` : ""}` },
            { key: "evaluated", label: "已评估" },
          ]}
        />
        <Table
          rowKey="id"
          dataSource={data}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 1100 }}
          size="small"
          style={{ padding: "0 4px 8px" }}
        />
      </div>

      {/* 评分 Modal */}
      <Modal
        open={!!scoreTarget}
        title={
          scoreTarget
            ? `评估：${scoreTarget.submitter_name || scoreTarget.submitter_username} · 题目 ${scoreTarget.challenge_id}`
            : "评估"
        }
        onCancel={() => { setScoreTarget(null); form.resetFields(); }}
        footer={null}
        width={480}
      >
        {scoreTarget && (
          <div style={{ marginBottom: 16 }}>
            <a href={scoreTarget.github_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
              <LinkOutlined style={{ marginRight: 6 }} />
              {scoreTarget.github_url}
            </a>
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={handleScore}>
          <div style={{ display: "flex", gap: 16 }}>
            <Form.Item
              name="score"
              label="综合得分（0–100）"
              rules={[{ required: true, message: "请输入分数" }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={0} max={100} precision={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="grade" label="等级" style={{ width: 100 }}>
              <Select allowClear placeholder="选填">
                {["S", "A", "B", "C"].map((g) => (
                  <Select.Option key={g} value={g}>
                    <Tag color={GRADE_COLOR[g]}>{g}</Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="notes" label="评语（候选人可见）">
            <textarea
              style={{
                width: "100%",
                minHeight: 100,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #d9d9d9",
                fontSize: 13,
                resize: "vertical",
                fontFamily: "inherit",
                outline: "none",
              }}
              placeholder="写一段给候选人的反馈（可选，完成后候选人能在结果页看到）"
            />
          </Form.Item>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => { setScoreTarget(null); form.resetFields(); }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={scoreLoading}>
              保存评分
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
