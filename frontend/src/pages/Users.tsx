import { useEffect, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  message,
} from "antd";
import { PlusOutlined, UserOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { usersApi, type UserItem } from "@/api/users";

const { Title } = Typography;

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      setUsers(await usersApi.list());
    } catch {
      message.error("获取用户列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (vals: {
    username: string;
    email: string;
    password: string;
    display_name?: string;
    role_name: string;
  }) => {
    setCreating(true);
    try {
      await usersApi.create(vals);
      message.success("账号创建成功");
      setCreateOpen(false);
      form.resetFields();
      fetchUsers();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (record: UserItem) => {
    try {
      await usersApi.update(record.id, { is_active: !record.is_active });
      message.success(record.is_active ? "已禁用" : "已启用");
      fetchUsers();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "操作失败");
    }
  };

  const handleChangeRole = async (record: UserItem, role_name: string) => {
    try {
      await usersApi.update(record.id, { role_name });
      message.success("角色已更新");
      fetchUsers();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "操作失败");
    }
  };

  const columns: ColumnsType<UserItem> = [
    {
      title: "用户",
      key: "user",
      render: (_, r) => (
        <Space>
          <Avatar size={32} src={r.avatar_url ?? undefined} icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 500 }}>{r.display_name || r.username}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{r.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: "用户名",
      dataIndex: "username",
      width: 140,
    },
    {
      title: "角色",
      dataIndex: "role_name",
      width: 140,
      render: (role, record) => (
        <Select
          size="small"
          value={role}
          style={{ width: 120 }}
          onChange={(v) => handleChangeRole(record, v)}
          options={[
            { label: "管理员", value: "admin" },
            { label: "顾问", value: "consultant" },
            { label: "面试官", value: "interviewer" },
          ]}
        />
      ),
    },
    {
      title: "状态",
      dataIndex: "is_active",
      width: 100,
      render: (active) =>
        active ? (
          <Badge status="success" text="正常" />
        ) : (
          <Badge status="default" text="已禁用" />
        ),
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_, record) => (
        <Button size="small" danger={record.is_active} onClick={() => handleToggleActive(record)}>
          {record.is_active ? "禁用" : "启用"}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          账号管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建账号
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={loading}
        pagination={false}
        size="middle"
      />

      <Modal
        title="新建账号"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ role_name: "consultant" }}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, min: 2, message: "至少 2 个字符" }]}
          >
            <Input placeholder="用于登录" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: "请输入邮箱" },
              { type: "email", message: "邮箱格式不正确" },
            ]}
          >
            <Input placeholder="example@company.com" />
          </Form.Item>
          <Form.Item
            name="display_name"
            label="姓名"
            rules={[{ max: 64 }]}
          >
            <Input placeholder="可选，同事看到的名字" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[{ required: true, min: 6, message: "至少 6 位" }]}
          >
            <Input.Password placeholder="设置初始密码" />
          </Form.Item>
          <Form.Item name="role_name" label="角色" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "顾问", value: "consultant" },
                { label: "面试官", value: "interviewer" },
                { label: "管理员", value: "admin" },
              ]}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={creating}>
                创建
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
