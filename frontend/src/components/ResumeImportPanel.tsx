import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
  Input,
  List,
  Modal,
  Popconfirm,
  Progress,
  Segmented,
  Space,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import {
  DeleteOutlined,
  InboxOutlined,
  LinkOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { resumesApi, type ResumeTaskBrief, type ResumeTaskDetail } from "@/api/resumes";

const { Dragger } = Upload;
const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const STATUS_ORDER = [
  "pending",
  "parsing",
  "extracting",
  "deriving_capabilities",
  "scoring_quality",
  "ready_to_confirm",
  "confirmed",
];

const STATUS_LABEL: Record<string, string> = {
  pending: "排队中",
  parsing: "文本提取",
  extracting: "结构化抽取",
  deriving_capabilities: "能力提炼",
  scoring_quality: "简历质量评分",
  ready_to_confirm: "待去重确认",
  confirmed: "已落库",
  failed: "失败",
};

function percentOf(status: string): number {
  if (status === "failed") return 100;
  const idx = STATUS_ORDER.indexOf(status);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / STATUS_ORDER.length) * 100);
}

function tagColor(status: string): string {
  if (status === "confirmed") return "green";
  if (status === "failed") return "red";
  if (status === "ready_to_confirm") return "gold";
  return "blue";
}

function formatDateTime(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  onConfirmed?: () => void;
}

const TERMINAL_TASK_STATUSES = new Set(["confirmed", "failed", "ready_to_confirm"]);
const ACTIVE_POLL_MS = 3_000;
const IDLE_POLL_MS = 30_000;
const HIDDEN_POLL_MS = 60_000;

type HistoryStatusFilter = "all" | "confirmed" | "failed" | "ready_to_confirm";
type HistorySourceFilter = "all" | "upload" | "url";

const HISTORY_STATUS_BACKEND: Record<HistoryStatusFilter, string[] | undefined> = {
  all: ["confirmed", "failed", "ready_to_confirm"],
  confirmed: ["confirmed"],
  failed: ["failed"],
  ready_to_confirm: ["ready_to_confirm"],
};

export default function ResumeImportPanel({ onConfirmed }: Props) {
  const [activeTasks, setActiveTasks] = useState<ResumeTaskBrief[]>([]);
  const [url, setUrl] = useState("");
  const [submittingUrl, setSubmittingUrl] = useState(false);
  const [detail, setDetail] = useState<ResumeTaskDetail | null>(null);
  const timer = useRef<number | null>(null);
  const cancelled = useRef(false);
  // Single-flight: don't fire a second /tasks request until the first finishes,
  // even on slow Render cold starts. Otherwise the queue piles up and starves
  // the dashboard endpoint sharing the worker.
  const inflight = useRef(false);
  const pokeRef = useRef<() => void>(() => {});

  // 历史筛选/分页状态
  const [historyStatus, setHistoryStatus] = useState<HistoryStatusFilter>("all");
  const [historySource, setHistorySource] = useState<HistorySourceFilter>("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyDateRange, setHistoryDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(
    null,
  );
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [historyItems, setHistoryItems] = useState<ResumeTaskBrief[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const historyReqId = useRef(0);

  // 拉取"进行中"任务：高频轮询，永远只看非终态
  useEffect(() => {
    cancelled.current = false;

    const tick = async () => {
      if (cancelled.current) return;
      if (document.hidden) {
        timer.current = window.setTimeout(tick, HIDDEN_POLL_MS);
        return;
      }
      if (inflight.current) {
        timer.current = window.setTimeout(tick, ACTIVE_POLL_MS);
        return;
      }
      inflight.current = true;
      try {
        // 拉所有非终态。后端没有 not-in 过滤，所以取前 50 条按 created_at desc，
        // 前端再筛一遍——进行中的任务很少，足够用。
        const res = await resumesApi.listTasks({ page: 1, page_size: 50 });
        if (cancelled.current) return;
        const active = res.items.filter((t) => !TERMINAL_TASK_STATUSES.has(t.status));
        setActiveTasks(active);
        const hasActive = active.length > 0;
        timer.current = window.setTimeout(tick, hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
      } catch {
        if (!cancelled.current) {
          timer.current = window.setTimeout(tick, IDLE_POLL_MS);
        }
      } finally {
        inflight.current = false;
      }
    };

    pokeRef.current = () => {
      if (timer.current != null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      tick();
    };

    tick();

    const onVisible = () => {
      if (!document.hidden) pokeRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled.current = true;
      if (timer.current != null) window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const pokeActive = () => pokeRef.current();

  // 拉历史 = 服务端筛选 + 分页
  const fetchHistory = useCallback(async () => {
    const myReqId = ++historyReqId.current;
    setHistoryLoading(true);
    try {
      const statusList = HISTORY_STATUS_BACKEND[historyStatus];
      const params: Parameters<typeof resumesApi.listTasks>[0] = {
        page: historyPage,
        page_size: historyPageSize,
        status: statusList,
        q: historyQuery.trim() || undefined,
        source_type: historySource === "all" ? undefined : historySource,
      };
      const [from, to] = historyDateRange ?? [null, null];
      if (from) params.date_from = from.startOf("day").toISOString();
      if (to) params.date_to = to.endOf("day").toISOString();
      const res = await resumesApi.listTasks(params);
      if (myReqId !== historyReqId.current) return; // 已被新请求覆盖
      setHistoryItems(res.items);
      setHistoryTotal(res.total);
    } catch (e: any) {
      if (myReqId === historyReqId.current) {
        message.error(e?.response?.data?.detail ?? "加载历史失败");
      }
    } finally {
      if (myReqId === historyReqId.current) setHistoryLoading(false);
    }
  }, [historyStatus, historySource, historyQuery, historyDateRange, historyPage, historyPageSize]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const refreshAll = () => {
    pokeActive();
    fetchHistory();
  };

  const [uploading, setUploading] = useState(false);

  // 收集文件后一次性批量提交
  const uploadProps: UploadProps = {
    name: "file",
    multiple: true,
    accept: ".pdf,.docx,.txt,.md,.html,.htm",
    showUploadList: false,
    // 阻止 antd 自动上传，改为手动批量提交
    beforeUpload: (file, fileList) => {
      // 只在最后一个文件时触发批量上传
      if (file === fileList[fileList.length - 1]) {
        setUploading(true);
        resumesApi
          .uploadBatch(fileList as unknown as File[])
          .then((res) => {
            if (res.task_ids.length > 0) {
              message.success(`已提交 ${res.task_ids.length} 份简历，正在解析`);
            }
            if (res.failed.length > 0) {
              res.failed.forEach((f) => message.error(f));
            }
            refreshAll();
          })
          .catch((e: any) => {
            message.error(e?.response?.data?.detail ?? "上传失败");
          })
          .finally(() => setUploading(false));
      }
      return false; // 阻止默认上传行为
    },
  };

  const handleSubmitUrl = async () => {
    if (!url.trim()) return;
    setSubmittingUrl(true);
    try {
      await resumesApi.fromUrl(url.trim());
      message.success("URL 已提交，正在抓取并解析");
      setUrl("");
      refreshAll();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "提交失败");
    } finally {
      setSubmittingUrl(false);
    }
  };

  const openDetail = async (id: number) => {
    const d = await resumesApi.getTask(id);
    setDetail(d);
  };

  const handleConfirm = async (mergeCandidateId?: number) => {
    if (!detail) return;
    try {
      await resumesApi.confirm(detail.id, { merge_candidate_id: mergeCandidateId });
      message.success(
        mergeCandidateId ? `已合并到候选人 #${mergeCandidateId}` : "已落库到候选人库",
      );
      setDetail(null);
      refreshAll();
      onConfirmed?.();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "确认失败");
    }
  };

  const quickConfirm = async (taskId: number) => {
    try {
      await resumesApi.confirm(taskId, {});
      message.success("已落库到候选人库");
      refreshAll();
      onConfirmed?.();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "入库失败");
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      await resumesApi.deleteTask(taskId);
      message.success(`已删除任务 #${taskId}`);
      refreshAll();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "删除失败");
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      const res = await resumesApi.batchDelete(selectedRowKeys);
      const msgs: string[] = [];
      if (res.deleted.length > 0) msgs.push(`成功删除 ${res.deleted.length} 项`);
      if (res.skipped.length > 0) {
        msgs.push(`跳过 ${res.skipped.length} 项（已落库或无权）`);
      }
      message.success(msgs.join("，") || "无可删除项");
      setSelectedRowKeys([]);
      refreshAll();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "批量删除失败");
    }
  };

  const handleRetry = async (taskId: number) => {
    try {
      await resumesApi.retryTask(taskId);
      message.success(`任务 #${taskId} 已重新加入队列`);
      refreshAll();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "重试失败");
    }
  };

  const renderActiveItem = (t: ResumeTaskBrief) => (
    <List.Item
      actions={[
        <Button key="view" type="link" onClick={() => openDetail(t.id)}>
          查看
        </Button>,
        ...(t.status === "ready_to_confirm"
          ? [
              <Popconfirm
                key="quick"
                title="忽略疑似重复，直接创建新候选人？"
                okText="确定入库"
                cancelText="取消"
                onConfirm={() => quickConfirm(t.id)}
              >
                <Button type="link">一键入库</Button>
              </Popconfirm>,
            ]
          : []),
        <Popconfirm
          key="delete"
          title="删除该解析任务？"
          okText="删除"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => handleDeleteTask(t.id)}
        >
          <Button type="link" danger>
            删除
          </Button>
        </Popconfirm>,
      ]}
    >
      <List.Item.Meta
        title={
          <Space>
            <Tag color={tagColor(t.status)}>{STATUS_LABEL[t.status] ?? t.status}</Tag>
            <Text>
              {t.source_type === "upload"
                ? `#${t.id} ${t.filename ?? "上传文件"}`
                : `#${t.id} ${t.source_url}`}
            </Text>
          </Space>
        }
        description={
          <Progress
            percent={percentOf(t.status)}
            size="small"
            status={t.status === "failed" ? "exception" : undefined}
          />
        }
      />
      {t.error_msg && (
        <Text type="danger" style={{ marginLeft: 16 }}>
          {t.error_msg}
        </Text>
      )}
    </List.Item>
  );

  const historyColumns: ColumnsType<ResumeTaskBrief> = useMemo(
    () => [
      {
        title: "ID",
        dataIndex: "id",
        width: 72,
        render: (id: number) => <Text type="secondary">#{id}</Text>,
      },
      {
        title: "状态",
        dataIndex: "status",
        width: 110,
        render: (s: string) => <Tag color={tagColor(s)}>{STATUS_LABEL[s] ?? s}</Tag>,
      },
      {
        title: "来源",
        dataIndex: "source_type",
        width: 90,
        render: (s: string) => (s === "upload" ? <Tag>上传</Tag> : <Tag color="cyan">URL</Tag>),
      },
      {
        title: "文件 / URL",
        dataIndex: "filename",
        ellipsis: true,
        render: (_: unknown, t: ResumeTaskBrief) => {
          const label = t.source_type === "upload" ? t.filename ?? "(已删除)" : t.source_url ?? "";
          return (
            <Tooltip title={label}>
              <Text ellipsis style={{ maxWidth: 280, display: "inline-block" }}>
                {label}
              </Text>
            </Tooltip>
          );
        },
      },
      {
        title: "候选人",
        dataIndex: "candidate_name",
        width: 160,
        render: (_: unknown, t: ResumeTaskBrief) => {
          if (t.candidate_id && t.candidate_name) {
            return (
              <Text>
                {t.candidate_name}{" "}
                <Text type="secondary">#{t.candidate_id}</Text>
              </Text>
            );
          }
          if (t.status === "failed") {
            return (
              <Tooltip title={t.error_msg ?? ""}>
                <Text type="danger">解析失败</Text>
              </Tooltip>
            );
          }
          return <Text type="secondary">—</Text>;
        },
      },
      {
        title: "创建时间",
        dataIndex: "created_at",
        width: 150,
        render: (s: string) => <Text type="secondary">{formatDateTime(s)}</Text>,
      },
      {
        title: "操作",
        key: "actions",
        width: 200,
        fixed: "right",
        render: (_: unknown, t: ResumeTaskBrief) => (
          <Space size="small">
            <Button type="link" size="small" onClick={() => openDetail(t.id)}>
              查看
            </Button>
            {t.status === "failed" && (
              <Button
                type="link"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => handleRetry(t.id)}
              >
                重试
              </Button>
            )}
            {t.status === "ready_to_confirm" && (
              <Popconfirm
                title="忽略疑似重复，直接创建新候选人？"
                okText="确定入库"
                cancelText="取消"
                onConfirm={() => quickConfirm(t.id)}
              >
                <Button type="link" size="small">
                  一键入库
                </Button>
              </Popconfirm>
            )}
            {t.status !== "confirmed" && (
              <Popconfirm
                title="删除该解析任务？"
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                onConfirm={() => handleDeleteTask(t.id)}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    // openDetail/handleRetry/etc reference latest state via closures from re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Card title="上传简历文件（支持批量）" size="small">
          <Dragger {...uploadProps} style={{ padding: 16 }} disabled={uploading}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">拖拽一份或多份简历到这里，或点击选择</p>
            <p className="ant-upload-hint">
              支持 PDF / DOCX / TXT / MD / HTML。文件会并发上传并独立异步解析。
            </p>
          </Dragger>
        </Card>

        <Card title="从 URL 导入简历" size="small">
          <Space.Compact style={{ width: "100%" }}>
            <Input
              prefix={<LinkOutlined />}
              placeholder="简历 PDF 的公开链接 / 个人主页 URL（招聘平台候选人主页不支持）"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPressEnter={handleSubmitUrl}
            />
            <Button type="primary" loading={submittingUrl} onClick={handleSubmitUrl}>
              开始抓取
            </Button>
          </Space.Compact>
        </Card>

        <Card title={`进行中（${activeTasks.length}）`} size="small">
          <List
            dataSource={activeTasks}
            locale={{ emptyText: "暂无进行中的解析任务" }}
            renderItem={renderActiveItem}
          />
        </Card>

        <Card
          title="历史记录"
          size="small"
          extra={
            <Space>
              {selectedRowKeys.length > 0 && (
                <Popconfirm
                  title={`批量删除选中的 ${selectedRowKeys.length} 项？`}
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={handleBatchDelete}
                >
                  <Button danger size="small" icon={<DeleteOutlined />}>
                    删除选中（{selectedRowKeys.length}）
                  </Button>
                </Popconfirm>
              )}
              <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchHistory()}>
                刷新
              </Button>
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: "100%" }} size="small">
            <Space wrap>
              <Segmented
                size="small"
                value={historyStatus}
                onChange={(v) => {
                  setHistoryStatus(v as HistoryStatusFilter);
                  setHistoryPage(1);
                  setSelectedRowKeys([]);
                }}
                options={[
                  { label: "全部", value: "all" },
                  { label: "已落库", value: "confirmed" },
                  { label: "失败", value: "failed" },
                  { label: "待确认", value: "ready_to_confirm" },
                ]}
              />
              <Segmented
                size="small"
                value={historySource}
                onChange={(v) => {
                  setHistorySource(v as HistorySourceFilter);
                  setHistoryPage(1);
                }}
                options={[
                  { label: "全部来源", value: "all" },
                  { label: "上传", value: "upload" },
                  { label: "URL", value: "url" },
                ]}
              />
              <Input.Search
                allowClear
                size="small"
                placeholder="搜索文件名 / 候选人 / URL"
                prefix={<SearchOutlined />}
                style={{ width: 240 }}
                onSearch={(v) => {
                  setHistoryQuery(v);
                  setHistoryPage(1);
                }}
              />
              <RangePicker
                size="small"
                value={historyDateRange ?? undefined}
                onChange={(v) => {
                  setHistoryDateRange(v as [Dayjs | null, Dayjs | null] | null);
                  setHistoryPage(1);
                }}
              />
            </Space>

            <Table<ResumeTaskBrief>
              size="small"
              rowKey="id"
              loading={historyLoading}
              dataSource={historyItems}
              columns={historyColumns}
              scroll={{ x: 920 }}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as number[]),
                getCheckboxProps: (t) => ({
                  disabled: t.status === "confirmed",
                }),
              }}
              pagination={{
                current: historyPage,
                pageSize: historyPageSize,
                total: historyTotal,
                showSizeChanger: true,
                showTotal: (n) => `共 ${n} 项`,
                onChange: (p, ps) => {
                  setHistoryPage(p);
                  setHistoryPageSize(ps);
                },
              }}
            />
          </Space>
        </Card>
      </Space>

      <Modal
        open={!!detail}
        title={detail ? `任务 #${detail.id}` : ""}
        onCancel={() => setDetail(null)}
        width={760}
        footer={
          detail?.status === "ready_to_confirm" ? (
            <Space wrap>
              <Button onClick={() => setDetail(null)}>取消</Button>
              {(detail.duplicates ?? []).map((d) => (
                <Button key={d.candidate_id} onClick={() => handleConfirm(d.candidate_id)}>
                  合并到 #{d.candidate_id} {d.name}
                </Button>
              ))}
              <Button type="primary" onClick={() => handleConfirm()}>
                {(detail.duplicates ?? []).length > 0 ? "仍然创建新候选人" : "确认并落库"}
              </Button>
            </Space>
          ) : (
            <Button onClick={() => setDetail(null)}>关闭</Button>
          )
        }
      >
        {detail && <TaskDetailView detail={detail} />}
      </Modal>
    </div>
  );
}

function TaskDetailView({ detail }: { detail: ResumeTaskDetail }) {
  const ex = detail.extracted ?? {};
  const q = detail.resume_quality ?? {};
  const currentStep = STATUS_ORDER.indexOf(detail.status);
  return (
    <>
      <Steps
        size="small"
        current={currentStep >= 0 ? currentStep : 0}
        status={detail.status === "failed" ? "error" : undefined}
        items={[
          { title: "排队" },
          { title: "文本提取" },
          { title: "结构化抽取" },
          { title: "能力提炼" },
          { title: "质量评分" },
          { title: "待确认" },
          { title: "已落库" },
        ]}
      />
      {detail.error_msg && (
        <Alert
          type="error"
          message="解析失败"
          description={detail.error_msg}
          style={{ marginTop: 16 }}
        />
      )}
      {detail.status === "ready_to_confirm" && (detail.duplicates ?? []).length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message={`检测到 ${detail.duplicates!.length} 位可能重复的候选人`}
          description={
            <List
              size="small"
              dataSource={detail.duplicates}
              renderItem={(d: any) => (
                <List.Item>
                  <Space wrap>
                    <Text strong>#{d.candidate_id}</Text>
                    <Text>{d.name}</Text>
                    {d.phone && <Tag>电话: {d.phone}</Tag>}
                    {d.email && <Tag>邮箱: {d.email}</Tag>}
                    {d.city && <Tag>{d.city}</Tag>}
                    {d.matched_by.includes("phone") && <Tag color="orange">手机重复</Tag>}
                    {d.matched_by.includes("email") && <Tag color="orange">邮箱重复</Tag>}
                  </Space>
                </List.Item>
              )}
            />
          }
        />
      )}
      {detail.extracted && (
        <>
          <Divider orientation="left">解析出的基本信息</Divider>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="姓名">{ex.name ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="手机">{ex.phone ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{ex.email ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="城市">{ex.city ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="行业">{ex.industry ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="年限">{ex.years_of_experience ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="学历">{ex.education_level ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="期望薪资">
              {ex.expected_salary_min ?? "-"} ~ {ex.expected_salary_max ?? "-"} k/月
            </Descriptions.Item>
            <Descriptions.Item label="技能" span={2}>
              <Space size={[0, 4]} wrap>
                {(ex.skills ?? []).map((s: string) => (
                  <Tag key={s}>{s}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        </>
      )}
      {detail.derived_capabilities && detail.derived_capabilities.length > 0 && (
        <>
          <Divider orientation="left">AI 提炼的能力</Divider>
          <List
            size="small"
            dataSource={detail.derived_capabilities}
            renderItem={(c: any) => (
              <List.Item>
                <List.Item.Meta
                  title={<Text strong>{c.capability}</Text>}
                  description={
                    <>
                      <Tag>{c.evidence_ref}</Tag> {c.evidence_detail}
                    </>
                  }
                />
              </List.Item>
            )}
          />
        </>
      )}
      {detail.resume_quality && (
        <>
          <Divider orientation="left">简历书写质量</Divider>
          <Paragraph>
            <Text strong>总分：</Text>
            <Tag color="blue">{q.score ?? "-"}</Tag>
          </Paragraph>
          {q.dimensions &&
            Object.entries(q.dimensions).map(([k, v]: any) => (
              <Paragraph key={k}>
                <Text strong>
                  {k === "detail" ? "详尽度" : k === "causality" ? "因果说明" : "量化实例"}：
                </Text>
                <Tag>{v.score}</Tag> {v.comment}
              </Paragraph>
            ))}
          {q.overall_comment && <Paragraph italic>{q.overall_comment}</Paragraph>}
        </>
      )}
    </>
  );
}
