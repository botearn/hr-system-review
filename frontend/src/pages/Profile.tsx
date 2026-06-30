import { useState } from "react";
import { Avatar, Button, Card, Form, Input, Space, Typography, Upload, message } from "antd";
import { UserOutlined, CameraOutlined } from "@ant-design/icons";
import type { RcFile } from "antd/es/upload";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/auth";

const { Title, Text } = Typography;

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [savingName, setSavingName] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pwdForm] = Form.useForm();

  if (!user) return null;

  const handleSaveName = async (vals: { display_name: string }) => {
    setSavingName(true);
    try {
      const updated = await authApi.updateMe(vals.display_name?.trim() || null);
      updateUser(updated);
      message.success("已保存");
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "保存失败");
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (vals: {
    old_password: string;
    new_password: string;
    confirm: string;
  }) => {
    if (vals.new_password !== vals.confirm) {
      message.error("两次输入的新密码不一致");
      return;
    }
    setSavingPwd(true);
    try {
      await authApi.changePassword(vals.old_password, vals.new_password);
      message.success("密码已更新");
      pwdForm.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "修改失败");
    } finally {
      setSavingPwd(false);
    }
  };

  const beforeAvatarUpload = async (file: RcFile) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type);
    if (!ok) {
      message.error("仅支持 JPG / PNG / WebP / GIF");
      return Upload.LIST_IGNORE;
    }
    if (file.size > 4 * 1024 * 1024) {
      message.error("头像最大 4 MB");
      return Upload.LIST_IGNORE;
    }
    setUploading(true);
    try {
      const updated = await authApi.uploadAvatar(file);
      updateUser(updated);
      message.success("头像已更新");
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "上传失败");
    } finally {
      setUploading(false);
    }
    return Upload.LIST_IGNORE; // we handle the upload ourselves
  };

  // Avatar URL is a backend route — bust the cache after upload by appending updated_at-ish.
  const avatarSrc = user.avatar_url ? `${user.avatar_url}?t=${Date.now()}` : undefined;

  return (
    <div style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        个人设置
      </Title>

      <Card size="small" title="头像" style={{ marginBottom: 16 }}>
        <Space size={16} align="center">
          <Avatar size={72} src={avatarSrc} icon={<UserOutlined />} />
          <Upload accept="image/*" beforeUpload={beforeAvatarUpload} showUploadList={false}>
            <Button icon={<CameraOutlined />} loading={uploading}>
              更换头像
            </Button>
          </Upload>
          <Text type="secondary" style={{ fontSize: 12 }}>
            支持 JPG / PNG / WebP / GIF，最大 4 MB
          </Text>
        </Space>
      </Card>

      <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
        <Form
          layout="vertical"
          initialValues={{ display_name: user.display_name ?? "" }}
          onFinish={handleSaveName}
        >
          <Form.Item label="邮箱">
            <Input value={user.email} disabled />
          </Form.Item>
          <Form.Item label="用户名">
            <Input value={user.username} disabled />
          </Form.Item>
          <Form.Item name="display_name" label="姓名" rules={[{ max: 64 }]}>
            <Input placeholder="同事看到的名字" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={savingName}>
            保存
          </Button>
        </Form>
      </Card>

      <Card size="small" title="修改密码">
        <Form form={pwdForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="old_password" label="原密码" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[{ required: true, min: 6, message: "至少 6 位" }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={["new_password"]}
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={savingPwd}>
            修改密码
          </Button>
        </Form>
      </Card>
    </div>
  );
}
