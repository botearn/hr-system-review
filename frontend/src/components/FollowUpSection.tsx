import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import {
  CommentOutlined,
  EditOutlined,
  DeleteOutlined,
  PhoneOutlined,
  WechatOutlined,
  MailOutlined,
  TeamOutlined,
  PlusOutlined,
  SwapOutlined,
  DownOutlined,
  UpOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  followUpsApi,
  STATUS_LABEL,
  STATUS_COLOR,
  CHANNEL_LABEL,
  type FollowUp,
  type FollowUpChannel,
  type StatusChange,
} from "@/api/follow-ups";
import StatusChangeModal from "@/components/StatusChangeModal";

const { Text, Paragraph } = Typography;

interface Props {
  candidateId?: number;
  positionId?: number;
  /** 默认折叠（仅候选人模式生效） */
  defaultCollapsed?: boolean;
}

interface FormValues {
  occurred_at: Dayjs;
  channel: FollowUpChannel;
  content: string;
  next_plan?: string;
  next_plan_due?: Dayjs;
}

const CHANNEL_ICON: Record<FollowUpChannel, React.ReactNode> = {
  phone: <PhoneOutlined />,
  wechat: <WechatOutlined />,
  email: <MailOutlined />,
  in_person: <TeamOutlined />,
  other: <CommentOutlined />,
};

type TimelineEntry =
  | { kind: "follow_up"; at: string; data: FollowUp }
  | { kind: "status_change"; at: string; data: StatusChange };

export default function FollowUpSection({
  candidateId,
  positionId,
  defaultCollapsed = true,
}: Props) {
  const mode: "candidate" | "position" = candidateId ? "candidate" : "position";

  const [loading, setLoading] = useState(true);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [statuses, setStatuses] = useState<StatusChange[]>([]);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const [statusModalOpen, setStatusModalOpen] = useState(false);

  const refresh = async () => {
    if (!candidateId && !positionId) return;
    setLoading(true);
    try {
      const fuRes = await followUpsApi.list({
        candidate_id: candidateId,
        position_id: positionId,
        page: 1,
        page_size: 200,
      });
      setFollowUps(fuRes.items);
      if (candidateId) {
        const scRes = await followUpsApi.statusHistory(candidateId);
        setStatuses(scRes);
      } else {
        setStatuses([]);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "加载跟进记录失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, positionId]);

  const currentStatus = statuses[0]?.to_status ?? null;

  const timeline: TimelineEntry[] = useMemo(() => {
    const list: TimelineEntry[] = [
      ...followUps.map((f) => ({ kind: "follow_up" as const, at: f.occurred_at, data: f })),
      ...statuses.map((s) => ({ kind: "status_change" as const, at: s.changed_at, data: s })),
    ];
    list.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return list;
  }, [followUps, statuses]);

  const visibleEntries = collapsed ? timeline.slice(0, 1) : timeline;

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ occurred_at: dayjs(), channel: "phone" });
    setModalOpen(true);
  };

  const openEdit = (f: FollowUp) => {
    setEditing(f);
    form.setFieldsValue({
      occurred_at: dayjs(f.occurred_at),
      channel: f.channel,
      content: f.content,
      next_plan: f.next_plan ?? undefined,
      next_plan_due: f.next_plan_due ? dayjs(f.next_plan_due) : undefined,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!candidateId) return;
    const v = await form.validateFields();
    setSubmitting(true);
    try {
      const payload = {
        candidate_id: candidateId,
        occurred_at: v.occurred_at.toISOString(),
        channel: v.channel,
        content: v.content,
        next_plan: v.next_plan || null,
        next_plan_due: v.next_plan_due ? v.next_plan_due.format("YYYY-MM-DD") : null,
      };
      if (editing) {
        await followUpsApi.update(editing.id, {
          occurred_at: payload.occurred_at,
          channel: payload.channel,
          content: payload.content,
          next_plan: payload.next_plan,
          next_plan_due: payload.next_plan_due,
        });
        message.success("已更新");
      } else {
        await followUpsApi.create(payload);
        message.success("已新增跟进");
      }
      setModalOpen(false);
      setEditing(null);
      refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await followUpsApi.delete(id);
      message.success("已删除");
      refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "删除失败");
    }
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <span>跟进记录</span>
          {currentStatus && (
            <Tag color={STATUS_COLOR[currentStatus]}>{STATUS_LABEL[currentStatus]}</Tag>
          )}
          {timeline.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              共 {timeline.length} 条
            </Text>
          )}
        </Space>
      }
      extra={
        <Space>
          {timeline.length > 1 && (
            <Button
              type="text"
              size="small"
              icon={collapsed ? <DownOutlined /> : <UpOutlined />}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? "看全部" : "收起"}
            </Button>
          )}
          {mode === "candidate" && (
            <>
              <Button size="small" icon={<SwapOutlined />} onClick={() => setStatusModalOpen(true)}>
                改状态
              </Button>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
                新增跟进
              </Button>
            </>
          )}
        </Space>
      }
      styles={{ body: { padding: 12 } }}
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spin />
        </div>
      ) : timeline.length === 0 ? (
        <Empty description="还没有跟进记录" imageStyle={{ height: 40 }} />
      ) : (
        <Timeline
          mode="left"
          items={visibleEntries.map((e) => {
            if (e.kind === "follow_up") {
              const f = e.data;
              return {
                color: "blue",
                dot: CHANNEL_ICON[f.channel],
                children: (
                  <div>
                    <Space size={8}>
                      <Text strong>{CHANNEL_LABEL[f.channel]}沟通</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(f.occurred_at).format("YYYY-MM-DD HH:mm")}
                      </Text>
                      {mode === "candidate" && (
                        <>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openEdit(f)}
                          />
                          <Popconfirm title="删除该条跟进？" onConfirm={() => handleDelete(f.id)}>
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </>
                      )}
                    </Space>
                    <Paragraph style={{ marginTop: 4, marginBottom: 4, fontSize: 13 }}>
                      {f.content}
                    </Paragraph>
                    {f.next_plan && (
                      <div
                        style={{
                          background: "#fffbe6",
                          border: "1px solid #ffe58f",
                          borderRadius: 4,
                          padding: "4px 8px",
                          fontSize: 12,
                        }}
                      >
                        <Text strong>下一步：</Text>
                        {f.next_plan}
                        {f.next_plan_due && (
                          <Tag color="gold" style={{ marginLeft: 8 }}>
                            {dayjs(f.next_plan_due).format("YYYY-MM-DD")}
                          </Tag>
                        )}
                      </div>
                    )}
                  </div>
                ),
              };
            }
            const s = e.data;
            return {
              color: "purple",
              dot: <SwapOutlined />,
              children: (
                <div>
                  <Space size={6}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(s.changed_at).format("YYYY-MM-DD HH:mm")}
                    </Text>
                    <Text>状态变更：</Text>
                    {s.from_status && (
                      <Tag color={STATUS_COLOR[s.from_status]}>{STATUS_LABEL[s.from_status]}</Tag>
                    )}
                    <Text type="secondary">→</Text>
                    <Tag color={STATUS_COLOR[s.to_status]}>{STATUS_LABEL[s.to_status]}</Tag>
                  </Space>
                  {s.reason && (
                    <Paragraph type="secondary" style={{ margin: "2px 0 0", fontSize: 12 }}>
                      {s.reason}
                    </Paragraph>
                  )}
                </div>
              ),
            };
          })}
        />
      )}

      {/* 新增 / 编辑跟进 */}
      <Modal
        title={editing ? "编辑跟进" : "新增跟进"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onOk={handleSubmit}
        confirmLoading={submitting}
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical">
          <Space style={{ display: "flex", width: "100%" }}>
            <Form.Item
              name="occurred_at"
              label="沟通时间"
              rules={[{ required: true }]}
              style={{ flex: 1 }}
            >
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              name="channel"
              label="沟通方式"
              rules={[{ required: true }]}
              style={{ flex: 1 }}
            >
              <Select
                popupMatchSelectWidth={false}
                options={(Object.keys(CHANNEL_LABEL) as FollowUpChannel[]).map((c) => ({
                  value: c,
                  label: CHANNEL_LABEL[c],
                }))}
              />
            </Form.Item>
          </Space>
          <Form.Item name="content" label="沟通内容" rules={[{ required: true, message: "必填" }]}>
            <Input.TextArea
              rows={4}
              placeholder="例：电话沟通薪资和到岗时间，候选人对岗位有兴趣，期望 60-80k..."
            />
          </Form.Item>
          <Form.Item name="next_plan" label="下一步（HR TODO）">
            <Input placeholder="例：周三 14:00 安排一面" />
          </Form.Item>
          <Form.Item name="next_plan_due" label="下一步截止日">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 状态变更 */}
      {candidateId && (
        <StatusChangeModal
          open={statusModalOpen}
          onClose={() => setStatusModalOpen(false)}
          candidateId={candidateId}
          currentStatus={currentStatus}
          onChanged={refresh}
        />
      )}
    </Card>
  );
}
