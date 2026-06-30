import { useEffect, useState } from "react";
import {
  Button,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd";
import { DeleteOutlined, EditOutlined, LinkOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { companiesApi, type Company, type CompanyCreate } from "@/api/companies";
import FilterChips, { type FilterDef, type FilterValue } from "@/components/FilterChips";

const COOP_STATUS: Record<string, { color: string; text: string }> = {
  potential: { color: "default", text: "潜在" },
  active: { color: "green", text: "合作中" },
  paused: { color: "orange", text: "暂停" },
  terminated: { color: "red", text: "已终止" },
};

export default function CompaniesPage() {
  const [data, setData] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [form] = Form.useForm<CompanyCreate>();

  // 筛选
  const [filterCoopStatus, setFilterCoopStatus] = useState<string | undefined>();
  const [filterFundingStage, setFilterFundingStage] = useState<string | undefined>();
  const [filterIndustryTags, setFilterIndustryTags] = useState<string[]>([]);
  const [industryTagOptions, setIndustryTagOptions] = useState<string[]>([]);
  const [fundingStageOptions, setFundingStageOptions] = useState<string[]>([]);
  const [coopStatuses, setCoopStatuses] = useState<Array<{ value: string; label: string }>>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await companiesApi.list({
        keyword: keyword || undefined,
        cooperation_status: filterCoopStatus,
        funding_stage: filterFundingStage,
        industry_tags: filterIndustryTags.length > 0 ? filterIndustryTags : undefined,
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
  }, [page, pageSize, filterCoopStatus, filterFundingStage, filterIndustryTags]);

  useEffect(() => {
    companiesApi.facets().then((f) => {
      setIndustryTagOptions(f.industry_tags);
      setFundingStageOptions(f.funding_stages);
      setCoopStatuses(f.cooperation_statuses);
    });
  }, []);

  const resetFilters = () => {
    setFilterCoopStatus(undefined);
    setFilterFundingStage(undefined);
    setFilterIndustryTags([]);
    setKeyword("");
    setPage(1);
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ cooperation_status: "potential" });
    setModalOpen(true);
  };

  const handleFromUrl = async () => {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    try {
      const draft = await companiesApi.fromUrl(urlInput.trim());
      setEditing(null);
      form.resetFields();
      form.setFieldsValue({
        name: draft.name ?? undefined,
        industry_tags: (draft.industry_tags ?? []).join(", ") as any,
        scale: draft.scale ?? undefined,
        funding_stage: draft.funding_stage ?? undefined,
        address: draft.address ?? undefined,
        website: draft.website ?? undefined,
        contact_name: draft.contact_name ?? undefined,
        contact_phone: draft.contact_phone ?? undefined,
        contact_email: draft.contact_email ?? undefined,
        notes: draft.notes ?? undefined,
        cooperation_status: "potential",
      });
      setUrlInput("");
      setUrlModalOpen(false);
      setModalOpen(true);
      message.success("已从 URL 提取企业信息，请确认后保存");
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "URL 导入失败");
    } finally {
      setUrlLoading(false);
    }
  };

  const openEdit = (row: Company) => {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      scale: row.scale ?? undefined,
      funding_stage: row.funding_stage ?? undefined,
      address: row.address ?? undefined,
      website: row.website ?? undefined,
      contact_name: row.contact_name ?? undefined,
      contact_phone: row.contact_phone ?? undefined,
      contact_email: row.contact_email ?? undefined,
      notes: row.notes ?? undefined,
      industry_tags: (row.industry_tags ?? []).join(", ") as any,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const tags =
      typeof (values as any).industry_tags === "string"
        ? (values as any).industry_tags
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : values.industry_tags;
    const payload = Object.fromEntries(
      Object.entries({ ...values, industry_tags: tags }).map(([k, v]) => [k, v === null ? undefined : v]),
    ) as any;
    try {
      if (editing) {
        await companiesApi.update(editing.id, payload);
        message.success("已更新");
      } else {
        await companiesApi.create(payload);
        message.success("已创建");
      }
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "提交失败");
    }
  };

  const handleArchive = async (row: Company) => {
    try {
      await companiesApi.archive(row.id);
      message.success("已删除");
      fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "删除失败");
    }
  };

  const columns: ColumnsType<Company> = [
    { title: "企业名称", dataIndex: "name", width: 180 },
    {
      title: "领域",
      dataIndex: "industry_tags",
      render: (tags: string[]) => (
        <Space size={[0, 4]} wrap>
          {(tags ?? []).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </Space>
      ),
    },
    { title: "规模", dataIndex: "scale", width: 90 },
    { title: "融资阶段", dataIndex: "funding_stage", width: 90 },
    {
      title: "合作状态",
      dataIndex: "cooperation_status",
      width: 100,
      render: (s: string) => {
        const c = COOP_STATUS[s] ?? { color: "default", text: s };
        return <Tag color={c.color}>{c.text}</Tag>;
      },
    },
    { title: "联系人", dataIndex: "contact_name", width: 100 },
    { title: "电话", dataIndex: "contact_phone", width: 130 },
    {
      title: "",
      key: "actions",
      width: 88,
      fixed: "right",
      align: "center",
      render: (_: any, row: Company) => (
        <Space size={2}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(row)}
            />
          </Tooltip>
          <Popconfirm
            title="删除该企业？"
            description="软删除,可在后台恢复"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleArchive(row)}
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
    { key: "cooperation_status", label: "合作状态", kind: "single", options: coopStatuses },
    {
      key: "funding_stage",
      label: "融资阶段",
      kind: "single",
      options: fundingStageOptions.map((x) => ({ value: x, label: x })),
    },
    {
      key: "industry_tags",
      label: "行业",
      kind: "multi",
      options: industryTagOptions.map((x) => ({ value: x, label: x })),
    },
  ];
  const filterValues: Record<string, FilterValue> = {
    cooperation_status: filterCoopStatus,
    funding_stage: filterFundingStage,
    industry_tags: filterIndustryTags.length > 0 ? filterIndustryTags : undefined,
  };
  const onFilterChange = (key: string, v: FilterValue) => {
    setPage(1);
    if (key === "cooperation_status") setFilterCoopStatus(v as string | undefined);
    else if (key === "funding_stage") setFilterFundingStage(v as string | undefined);
    else if (key === "industry_tags") setFilterIndustryTags((v as string[]) ?? []);
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
        <Button type="primary" onClick={openCreate}>
          新增企业
        </Button>
        <Button icon={<LinkOutlined />} onClick={() => setUrlModalOpen(true)}>
          从 URL 导入
        </Button>
      </div>

      <FilterChips
        defs={filterDefs}
        values={filterValues}
        onChange={onFilterChange}
        onReset={resetFilters}
        searchPlaceholder="搜索企业名 / 备注"
        searchValue={keyword}
        onSearchChange={setKeyword}
        onSearch={() => {
          setPage(1);
          fetchData();
        }}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        scroll={{ x: 1200 }}
        size="middle"
        style={{ background: "#fff", borderRadius: 12, padding: 4 }}
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

      <Modal
        title={editing ? `编辑企业 #${editing.id}` : "新增企业"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="企业名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="industry_tags"
            label="所属领域（逗号分隔）"
            extra="例：通用AI, AI医疗, 自动驾驶"
          >
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="scale" label="企业规模">
                <Select
                  allowClear
                  popupMatchSelectWidth={false}
                  dropdownStyle={{ minWidth: 140 }}
                  options={[
                    { value: "<20", label: "<20 人" },
                    { value: "20-100", label: "20-100 人" },
                    { value: "100-500", label: "100-500 人" },
                    { value: "500+", label: "500+ 人" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="funding_stage" label="融资阶段">
                <Select
                  allowClear
                  popupMatchSelectWidth={false}
                  dropdownStyle={{ minWidth: 140 }}
                  options={[
                    { value: "seed", label: "种子/天使" },
                    { value: "A", label: "A 轮" },
                    { value: "B", label: "B 轮" },
                    { value: "C", label: "C 轮" },
                    { value: "D+", label: "D 轮及以上" },
                    { value: "IPO", label: "已上市" },
                    { value: "self", label: "未融资" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cooperation_status" label="合作状态">
                <Select
                  popupMatchSelectWidth={false}
                  dropdownStyle={{ minWidth: 120 }}
                  options={[
                    { value: "potential", label: "潜在" },
                    { value: "active", label: "合作中" },
                    { value: "paused", label: "暂停" },
                    { value: "terminated", label: "已终止" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="办公地址">
            <Input />
          </Form.Item>
          <Form.Item name="website" label="官网">
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="contact_name" label="联系人">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="contact_phone" label="电话">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="contact_email" label="邮箱">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="从 URL 导入企业"
        open={urlModalOpen}
        onCancel={() => setUrlModalOpen(false)}
        onOk={handleFromUrl}
        okText="抽取并预填"
        confirmLoading={urlLoading}
        width={560}
        destroyOnClose
      >
        <Spin spinning={urlLoading} tip="正在抓取页面并用 GLM 提取，请稍候（约 20-60 秒）...">
          <Form layout="vertical">
            <Form.Item label="企业官网 / 介绍 PDF URL" required>
              <Input
                prefix={<LinkOutlined />}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/about 或 https://example.com/brochure.pdf"
                onPressEnter={handleFromUrl}
              />
            </Form.Item>
            <p style={{ color: "#888", fontSize: 12, margin: 0 }}>
              抽取成功后会把企业名称、领域、规模、融资阶段、联系人等字段预填到新增表单，你可修改后再保存。
            </p>
          </Form>
        </Spin>
      </Modal>
    </div>
  );
}
