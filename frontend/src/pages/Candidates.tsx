import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";

const { Text } = Typography;
import {
  AppstoreOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  ProjectOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Pagination, Segmented, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { candidatesApi, type Candidate, type CandidateCreate } from "@/api/candidates";
import { poolsApi } from "@/api/pools";
import { saveBlobResponse } from "@/api/download";
import ResumeImportPanel from "@/components/ResumeImportPanel";
import CandidateDetailDrawer from "@/components/CandidateDetailDrawer";
import CandidateRowActions from "@/components/CandidateRowActions";
import CandidateCard from "@/components/CandidateCard";
import CandidatesKanban from "@/components/CandidatesKanban";
import FilterChips, { type FilterDef, type FilterValue } from "@/components/FilterChips";

function fmtRelative(ts: string | null | undefined): string {
  if (!ts) return "-";
  const t = new Date(ts).getTime();
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 月前`;
  return `${Math.floor(days / 365)} 年前`;
}

export default function CandidatesPage() {
  const [data, setData] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [view, setView] = useState<"card" | "table" | "kanban">(() => {
    return (localStorage.getItem("candidates.view") as "card" | "table" | "kanban") ?? "card";
  });
  const [form] = Form.useForm<CandidateCreate>();

  // 初始筛选可由 URL 携带 (e.g. /candidates?industry=AI&job_status=active)
  // 让从看板"行业分布"、"求职状态"等点过来的链接能落到正确的过滤视图。
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState<string | undefined>(
    searchParams.get("job_status") ?? undefined,
  );
  const [filterIndustry, setFilterIndustry] = useState<string | undefined>(
    searchParams.get("industry") ?? undefined,
  );
  const [filterSkills, setFilterSkills] = useState<string[]>([]);
  const [filterCaps, setFilterCaps] = useState<string[]>([]);
  // Bumped by the AiPanel's `candidate:created` event so a chat-driven
  // import shows up here without the user having to F5.
  const [refreshTick, setRefreshTick] = useState(0);

  // Keep URL in sync so the filtered view is shareable / refresh-safe.
  useEffect(() => {
    const next = new URLSearchParams();
    if (filterStatus) next.set("job_status", filterStatus);
    if (filterIndustry) next.set("industry", filterIndustry);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterIndustry]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Array<{ value: string; label: string }>>([]);
  const [skillOptions, setSkillOptions] = useState<string[]>([]);
  const [capOptions, setCapOptions] = useState<string[]>([]);

  const buildParams = () => ({
    keyword: keyword || undefined,
    job_status: filterStatus,
    industry: filterIndustry,
    skills: filterSkills.length > 0 ? filterSkills : undefined,
    capabilities: filterCaps.length > 0 ? filterCaps : undefined,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await candidatesApi.list({
        ...buildParams(),
        page,
        page_size: pageSize,
      });
      setData(res.items);
      setTotal(res.total);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filterStatus, filterIndustry, filterSkills, filterCaps, refreshTick]);

  // Refetch when the AI assistant just created a candidate, so the kanban /
  // card view picks up the new row immediately.
  useEffect(() => {
    const handler = () => setRefreshTick((t) => t + 1);
    window.addEventListener("candidate:created", handler);
    return () => window.removeEventListener("candidate:created", handler);
  }, []);

  useEffect(() => {
    // 首次加载筛选项的下拉源
    candidatesApi.facets().then((f) => {
      setIndustries(f.industries);
      setStatuses(f.job_statuses);
    });
    poolsApi.list("skills").then((items) => {
      setSkillOptions(items.map((it) => it.name));
    });
    poolsApi.list("capabilities").then((items) => {
      setCapOptions(items.map((it) => it.name));
    });
  }, []);

  const resetFilters = () => {
    setFilterStatus(undefined);
    setFilterIndustry(undefined);
    setFilterSkills([]);
    setFilterCaps([]);
    setKeyword("");
    setPage(1);
  };

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ job_status: "active" });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const skills =
      typeof (values as any).skills === "string"
        ? (values as any).skills
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : values.skills;
    try {
      await candidatesApi.create({ ...values, skills });
      message.success("已创建");
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "提交失败");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await candidatesApi.exportXlsx(buildParams() as any);
      saveBlobResponse(res, "candidates.xlsx");
      message.success("已开始下载");
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (row: Candidate) => {
    try {
      await candidatesApi.void(row.id);
      message.success("已删除");
      fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "删除失败");
    }
  };

  const columns: ColumnsType<Candidate> = [
    {
      title: "姓名",
      dataIndex: "name",
      width: 220,
      render: (_: any, row: Candidate) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <a onClick={() => setDetailId(row.id)} style={{ fontWeight: 500 }}>
              {row.name}
            </a>
            <span style={{ fontSize: 12, color: "#bfbfbf" }}>#{row.id}</span>
          </Space>
          <Space size={6} wrap>
            <CandidateRowActions
              candidateId={row.id}
              candidateName={row.name}
              phone={row.phone}
              email={row.email}
              wechat={row.wechat}
              onChanged={fetchData}
            />
            {row.last_follow_at && (
              <Tooltip title={new Date(row.last_follow_at).toLocaleString()}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  · {fmtRelative(row.last_follow_at)}
                </Text>
              </Tooltip>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: "技能",
      dataIndex: "skills",
      render: (skills: string[]) => (
        <Space size={[0, 4]} wrap>
          {skills?.slice(0, 6).map((s) => (
            <Tag key={s}>{s}</Tag>
          ))}
          {skills && skills.length > 6 && <Tag>+{skills.length - 6}</Tag>}
        </Space>
      ),
    },
    {
      title: "能力",
      dataIndex: "derived_capabilities",
      render: (caps: Candidate["derived_capabilities"]) =>
        !caps || caps.length === 0 ? (
          <span style={{ color: "#bfbfbf" }}>-</span>
        ) : (
          <Space size={[0, 4]} wrap>
            {caps.slice(0, 3).map((c, i) => (
              <Tag key={i} color="purple">
                {c.capability}
              </Tag>
            ))}
            {caps.length > 3 && <Tag>+{caps.length - 3}</Tag>}
          </Space>
        ),
    },
    {
      title: "状态",
      dataIndex: "job_status",
      width: 160,
      render: (s: string, row: Candidate) => {
        if (row.landed_company) {
          return (
            <Tooltip
              title={`已入职 ${row.landed_company}${row.landed_role ? " · " + row.landed_role : ""}`}
            >
              <Tag color="green" style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>
                🎯 {row.landed_company}
              </Tag>
            </Tooltip>
          );
        }
        const map: Record<string, { color: string; text: string }> = {
          active: { color: "green", text: "积极求职" },
          watching: { color: "blue", text: "观望中" },
          onboarded: { color: "default", text: "已入职" },
        };
        const it = map[s] ?? { color: "default", text: s };
        return <Tag color={it.color}>{it.text}</Tag>;
      },
    },
    { title: "行业", dataIndex: "industry", width: 120 },
    {
      title: "",
      key: "actions",
      width: 88,
      fixed: "right",
      align: "center",
      render: (_: any, row: Candidate) => (
        <Space size={2}>
          <Tooltip title="查看详情">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setDetailId(row.id)}
            />
          </Tooltip>
          <Popconfirm
            title="删除该候选人？"
            description="软删除,可在后台恢复"
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(row)}
          >
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const filterDefs: FilterDef[] = [
    { key: "job_status", label: "求职状态", kind: "single", options: statuses },
    {
      key: "industry",
      label: "行业",
      kind: "single",
      options: industries.map((x) => ({ value: x, label: x })),
    },
    {
      key: "skills",
      label: "技能",
      kind: "multi",
      options: skillOptions.map((x) => ({ value: x, label: x })),
    },
    {
      key: "capabilities",
      label: "能力",
      kind: "multi",
      options: capOptions.map((x) => ({ value: x, label: x })),
    },
  ];

  const filterValues: Record<string, FilterValue> = {
    job_status: filterStatus,
    industry: filterIndustry,
    skills: filterSkills.length > 0 ? filterSkills : undefined,
    capabilities: filterCaps.length > 0 ? filterCaps : undefined,
  };

  const onFilterChange = (key: string, v: FilterValue) => {
    setPage(1);
    if (key === "job_status") setFilterStatus(v as string | undefined);
    else if (key === "industry") setFilterIndustry(v as string | undefined);
    else if (key === "skills") setFilterSkills((v as string[]) ?? []);
    else if (key === "capabilities") setFilterCaps((v as string[]) ?? []);
  };

  return (
    <div
      style={{
        padding: "28px 40px 48px",
        background: "#fafafb",
        minHeight: "calc(100vh - 64px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Space>
          <Button type="primary" onClick={openCreate}>
            新增候选人
          </Button>
          <Button icon={<CloudUploadOutlined />} onClick={() => setImportOpen(true)}>
            上传简历 / URL 导入
          </Button>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            导出 Excel
          </Button>
        </Space>
      </div>

      <FilterChips
        defs={filterDefs}
        values={filterValues}
        onChange={onFilterChange}
        onReset={resetFilters}
        searchPlaceholder="搜索姓名 / 简历 / 备注"
        searchValue={keyword}
        onSearchChange={setKeyword}
        onSearch={() => {
          setPage(1);
          fetchData();
        }}
        extra={
          <Segmented
            value={view}
            onChange={(v) => {
              const next = v as "card" | "table" | "kanban";
              setView(next);
              localStorage.setItem("candidates.view", next);
            }}
            options={[
              { value: "kanban", icon: <ProjectOutlined />, title: "看板" } as any,
              { value: "card", icon: <AppstoreOutlined />, title: "卡片" } as any,
              { value: "table", icon: <UnorderedListOutlined />, title: "列表" } as any,
            ]}
          />
        }
      />

      {view === "kanban" ? (
        <CandidatesKanban candidates={data} onOpenDetail={setDetailId} onChanged={fetchData} />
      ) : view === "table" ? (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1100 }}
          size="middle"
          style={{ background: "#fff", borderRadius: 12, padding: 4 }}
          onRow={(row) => ({
            onClick: (e) => {
              const target = e.target as HTMLElement;
              if (target.closest("button, a, .ant-popover, .ant-popconfirm")) return;
              setDetailId(row.id);
            },
            style: { cursor: "pointer" },
          })}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      ) : (
        <>
          <Row gutter={[24, 24]}>
            {data.map((row) => (
              <Col key={row.id} xs={24} md={12} xl={8}>
                <CandidateCard candidate={row} onOpen={setDetailId} onChanged={fetchData} />
              </Col>
            ))}
          </Row>
          {data.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: 48, color: "#bfbfbf" }}>暂无数据</div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 16,
            }}
          >
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              onChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
            />
          </div>
        </>
      )}

      <Modal
        title="新增候选人"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
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
          </Row>
          <Row gutter={16}>
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
          </Row>
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
          <Form.Item name="job_status" label="求职状态">
            <Select
              options={[
                { value: "active", label: "积极求职" },
                { value: "watching", label: "观望中" },
                { value: "onboarded", label: "已入职" },
              ]}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="expected_salary_min" label="期望薪资下限 (k/月)">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expected_salary_max" label="期望薪资上限 (k/月)">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="skills"
            label="技能（逗号分隔）"
            extra="例：PyTorch, Transformer, LangChain"
          >
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="简历导入"
        open={importOpen}
        width={720}
        onClose={() => {
          setImportOpen(false);
          fetchData();
        }}
        destroyOnClose
      >
        <ResumeImportPanel onConfirmed={fetchData} />
      </Drawer>

      <CandidateDetailDrawer
        candidateId={detailId}
        open={detailId != null}
        onClose={() => setDetailId(null)}
        onSaved={fetchData}
      />
    </div>
  );
}
