import { useEffect, useState } from "react";
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  ProjectOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { positionsApi, type Position, type PositionCreate } from "@/api/positions";
import { companiesApi, type Company } from "@/api/companies";
import PositionDetailDrawer from "@/components/PositionDetailDrawer";
import PositionsKanban from "@/components/PositionsKanban";
import FilterChips, { type FilterDef, type FilterValue } from "@/components/FilterChips";

const STATUS_MAP: Record<string, { color: string; text: string }> = {
  open: { color: "green", text: "招聘中" },
  paused: { color: "orange", text: "暂停" },
  closed: { color: "red", text: "已关闭" },
  filled: { color: "blue", text: "已招满" },
};

export default function PositionsPage() {
  const [data, setData] = useState<Position[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [form] = Form.useForm<PositionCreate>();
  const [detailId, setDetailId] = useState<number | null>(null);
  const [view, setView] = useState<"kanban" | "table">(() => {
    return (localStorage.getItem("positions.view") as "kanban" | "table") ?? "kanban";
  });

  // 筛选
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterCompany, setFilterCompany] = useState<number | undefined>();
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterCity, setFilterCity] = useState<string | undefined>();
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<Array<{ value: string; label: string }>>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await positionsApi.list({
        keyword: keyword || undefined,
        status: filterStatus,
        company_id: filterCompany,
        type: filterType,
        city: filterCity,
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

  const fetchCompanies = async () => {
    const res = await companiesApi.list({ page: 1, page_size: 100 });
    setCompanies(res.items);
  };

  useEffect(() => {
    fetchCompanies();
    positionsApi.facets().then((f) => {
      setCityOptions(f.cities);
      setTypeOptions(f.types);
      setStatusOptions(f.statuses);
    });
  }, []);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filterStatus, filterCompany, filterType, filterCity]);

  const resetFilters = () => {
    setFilterStatus(undefined);
    setFilterCompany(undefined);
    setFilterType(undefined);
    setFilterCity(undefined);
    setKeyword("");
    setPage(1);
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ headcount: 1, remote_ok: false });
    setModalOpen(true);
  };

  const openEdit = (row: Position) => {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      type: row.type ?? undefined,
      responsibilities: row.responsibilities ?? undefined,
      requirements: row.requirements ?? undefined,
      city: row.city ?? undefined,
      salary_min: row.salary_min ?? undefined,
      salary_max: row.salary_max ?? undefined,
      benefits: row.benefits ?? undefined,
      min_years: row.min_years ?? undefined,
      max_years: row.max_years ?? undefined,
      required_education: row.required_education ?? undefined,
      required_skills: (row.required_skills ?? []).join(", ") as any,
      nice_to_have_skills: (row.nice_to_have_skills ?? []).join(", ") as any,
      onboard_deadline: (row.onboard_deadline ?? undefined) as any,
    });
    setModalOpen(true);
  };

  const splitCSV = (v: any): string[] =>
    typeof v === "string"
      ? v
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : (v ?? []);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = Object.fromEntries(
      Object.entries({
        ...values,
        required_skills: splitCSV((values as any).required_skills),
        nice_to_have_skills: splitCSV((values as any).nice_to_have_skills),
      }).map(([k, v]) => [k, v === null ? undefined : v]),
    ) as unknown as PositionCreate;
    try {
      if (editing) {
        await positionsApi.update(editing.id, payload);
        message.success("已更新，正在后台重新提炼能力…");
      } else {
        await positionsApi.create(payload);
        message.success("已创建，正在后台提炼能力…");
      }
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "提交失败");
    }
  };

  const handleClose = async (row: Position) => {
    await positionsApi.close(row.id);
    message.success("已删除");
    fetchData();
  };

  const handleReopen = async (row: Position) => {
    await positionsApi.reopen(row.id);
    message.success("已恢复");
    fetchData();
  };

  const companyName = (id: number) => companies.find((c) => c.id === id)?.name ?? `#${id}`;

  const columns: ColumnsType<Position> = [
    { title: "岗位", dataIndex: "title", width: 180 },
    {
      title: "企业",
      dataIndex: "company_id",
      width: 160,
      render: (v: number) => companyName(v),
    },
    { title: "类型", dataIndex: "type", width: 100 },
    { title: "城市", dataIndex: "city", width: 90 },
    {
      title: "年限",
      key: "years",
      width: 90,
      render: (_, r) => {
        if (r.min_years == null && r.max_years == null) return "-";
        return `${r.min_years ?? 0}-${r.max_years ?? "∞"} 年`;
      },
    },
    {
      title: "薪资",
      key: "salary",
      width: 120,
      render: (_, r) => (r.salary_min == null ? "-" : `${r.salary_min}~${r.salary_max ?? "∞"}k`),
    },
    {
      title: "技能",
      key: "skills",
      render: (_: any, r: Position) => {
        const req = r.required_skills ?? [];
        const nice = r.nice_to_have_skills ?? [];
        if (req.length === 0 && nice.length === 0)
          return <span style={{ color: "#bfbfbf" }}>-</span>;
        return (
          <Space size={[0, 4]} wrap>
            {req.slice(0, 3).map((s, i) => (
              <Tag key={`r${i}`} color="red">
                {s}
              </Tag>
            ))}
            {nice.slice(0, 2).map((s, i) => (
              <Tag key={`n${i}`} color="blue">
                {s}
              </Tag>
            ))}
            {req.length + nice.length > 5 && <Tag>+{req.length + nice.length - 5}</Tag>}
          </Space>
        );
      },
    },
    {
      title: "能力",
      dataIndex: "required_capabilities",
      render: (caps: Position["required_capabilities"]) =>
        !caps || caps.length === 0 ? (
          <Tooltip title="等待 AI 提炼">-</Tooltip>
        ) : (
          <Space size={[0, 4]} wrap>
            {caps.slice(0, 3).map((c, i) => (
              <Tag key={i} color={c.priority === "must" ? "red" : "blue"}>
                {c.capability}
              </Tag>
            ))}
            {caps.length > 3 && <Tag>+{caps.length - 3}</Tag>}
          </Space>
        ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (s: string) => {
        const c = STATUS_MAP[s] ?? { color: "default", text: s };
        return <Tag color={c.color}>{c.text}</Tag>;
      },
    },
    {
      title: "",
      key: "actions",
      width: 88,
      fixed: "right",
      align: "center",
      render: (_: any, row: Position) => (
        <Space size={2}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(row)}
            />
          </Tooltip>
          {row.status === "open" ? (
            <Popconfirm
              title="删除该岗位？"
              description="状态改为已关闭,可恢复"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleClose(row)}
            >
              <Tooltip title="删除">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Tooltip title="恢复">
              <Button
                type="text"
                size="small"
                icon={<UndoOutlined />}
                onClick={() => handleReopen(row)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const filterDefs: FilterDef[] = [
    { key: "status", label: "状态", kind: "single", options: statusOptions },
    {
      key: "company_id",
      label: "企业",
      kind: "single",
      options: companies.map((c) => ({ value: String(c.id), label: c.name })),
    },
    {
      key: "type",
      label: "类型",
      kind: "single",
      options: typeOptions.map((x) => ({ value: x, label: x })),
    },
    {
      key: "city",
      label: "城市",
      kind: "single",
      options: cityOptions.map((x) => ({ value: x, label: x })),
    },
  ];

  const filterValues: Record<string, FilterValue> = {
    status: filterStatus,
    company_id: filterCompany != null ? String(filterCompany) : undefined,
    type: filterType,
    city: filterCity,
  };

  const onFilterChange = (key: string, v: FilterValue) => {
    setPage(1);
    if (key === "status") setFilterStatus(v as string | undefined);
    else if (key === "company_id") setFilterCompany(v ? Number(v) : undefined);
    else if (key === "type") setFilterType(v as string | undefined);
    else if (key === "city") setFilterCity(v as string | undefined);
  };

  return (
    <div
      style={{
        padding: "28px 40px 48px",
        background: "#fafafb",
        minHeight: "calc(100vh - 64px)",
      }}
    >
      <div style={{ display: "flex", marginBottom: 16, gap: 12 }}>
        <Button type="primary" onClick={openCreate} disabled={companies.length === 0}>
          新增岗位
        </Button>
        {companies.length === 0 && (
          <span style={{ color: "#888", lineHeight: "32px" }}>请先在"企业"模块创建企业</span>
        )}
      </div>

      <FilterChips
        defs={filterDefs}
        values={filterValues}
        onChange={onFilterChange}
        onReset={resetFilters}
        searchPlaceholder="搜索岗位名 / 职责 / 要求"
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
              const next = v as "kanban" | "table";
              setView(next);
              localStorage.setItem("positions.view", next);
            }}
            options={[
              { value: "kanban", icon: <ProjectOutlined />, title: "看板" } as any,
              { value: "table", icon: <UnorderedListOutlined />, title: "列表" } as any,
            ]}
          />
        }
      />

      {view === "kanban" ? (
        <PositionsKanban
          positions={data}
          companies={companies}
          onOpenDetail={setDetailId}
          onChanged={fetchData}
        />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1400 }}
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
      )}

      <PositionDetailDrawer
        positionId={detailId}
        open={detailId != null}
        onClose={() => setDetailId(null)}
        onSaved={fetchData}
      />

      <Modal
        title={editing ? `编辑岗位 #${editing.id}` : "新增岗位"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="company_id" label="企业" rules={[{ required: true }]}>
                <Select
                  disabled={!!editing}
                  showSearch
                  optionFilterProp="label"
                  popupMatchSelectWidth={false}
                  dropdownStyle={{ minWidth: 260 }}
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="title" label="岗位名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="type" label="岗位类型">
                <Select
                  allowClear
                  popupMatchSelectWidth={false}
                  dropdownStyle={{ minWidth: 160 }}
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
          </Row>

          <Form.Item name="responsibilities" label="岗位职责">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="requirements" label="任职要求">
            <Input.TextArea rows={4} />
          </Form.Item>

          <Form.Item
            name="required_skills"
            label="必须技能（逗号分隔）"
            extra="例：PyTorch, Transformer, RLHF"
          >
            <Input />
          </Form.Item>
          <Form.Item name="nice_to_have_skills" label="加分技能（逗号分隔）">
            <Input />
          </Form.Item>

          <Row gutter={16}>
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
                  popupMatchSelectWidth={false}
                  dropdownStyle={{ minWidth: 120 }}
                  options={[
                    { value: "专科", label: "专科" },
                    { value: "本科", label: "本科" },
                    { value: "硕士", label: "硕士" },
                    { value: "博士", label: "博士" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={7}>
              <Form.Item name="salary_min" label="薪资下限 (k/月)">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item name="salary_max" label="薪资上限 (k/月)">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="city" label="城市">
                <Input />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="remote_ok" label="可远程" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="headcount" label="招聘人数">
                <InputNumber min={1} max={50} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="onboard_deadline" label="到岗截止日">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="benefits" label="福利">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
