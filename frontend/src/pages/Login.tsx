import { useState } from "react";
import { Button, Form, Input, message } from "antd";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/auth";
import { bindChatStoreToUser } from "@/store/chat";
import "./Login.css";

type RoleTab = "hr" | "interviewee";
type SubTab = "login" | "register";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [roleTab, setRoleTab] = useState<RoleTab>("hr");
  const [subTab, setSubTab] = useState<SubTab>("login");
  const [loading, setLoading] = useState(false);

  async function onHrLogin(values: { username: string; password: string }) {
    setLoading(true);
    try {
      const res = await authApi.login(values.username, values.password);
      if (res.user.role_name === "interviewee") {
        message.error("该账号为面试者账号，请切换到「面试者」入口");
        return;
      }
      setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token, user: res.user });
      bindChatStoreToUser(res.user.id);
      navigate("/agent");
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function onIntervieweeLogin(values: { username: string; password: string }) {
    setLoading(true);
    try {
      const res = await authApi.login(values.username, values.password);
      if (res.user.role_name !== "interviewee") {
        message.error("该账号不是面试者账号，请切换到「HR / 面试官」入口");
        return;
      }
      setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token, user: res.user });
      bindChatStoreToUser(res.user.id);
      navigate("/interview");
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function onIntervieweeRegister(values: {
    username: string;
    email: string;
    password: string;
  }) {
    setLoading(true);
    try {
      await authApi.registerInterviewee(values);
      message.success("注册成功，请登录");
      setSubTab("login");
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-mesh" aria-hidden>
        <span className="login-blob login-blob--a" />
        <span className="login-blob login-blob--b" />
        <span className="login-blob login-blob--c" />
      </div>

      <div className="login-stack">
        <div className="login-hero">
          <div className="login-brand">TalentOS</div>
          <div className="login-slogan">不止匹配，更懂人选</div>
        </div>

        <div className="login-card">
          {/* 角色切换 */}
          <div className="login-role-tabs">
            <button
              className={`login-role-tab${roleTab === "hr" ? " active" : ""}`}
              onClick={() => setRoleTab("hr")}
            >
              HR / 面试官
            </button>
            <button
              className={`login-role-tab${roleTab === "interviewee" ? " active" : ""}`}
              onClick={() => setRoleTab("interviewee")}
            >
              面试者
            </button>
          </div>

          {roleTab === "hr" ? (
            <Form layout="vertical" onFinish={onHrLogin} size="large">
              <Form.Item
                name="username"
                label="邮箱或用户名"
                rules={[{ required: true, message: "请输入邮箱或用户名" }]}
              >
                <Input autoFocus placeholder="example@company.com" />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[{ required: true, message: "请输入密码" }]}
              >
                <Input.Password placeholder="••••••••" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                  登录
                </Button>
              </Form.Item>
            </Form>
          ) : (
            <>
              {/* 登录 / 注册子 tab */}
              <div className="login-sub-tabs">
                <button
                  className={`login-sub-tab${subTab === "login" ? " active" : ""}`}
                  onClick={() => setSubTab("login")}
                >
                  已有账号，去登录
                </button>
                <button
                  className={`login-sub-tab${subTab === "register" ? " active" : ""}`}
                  onClick={() => setSubTab("register")}
                >
                  新用户注册
                </button>
              </div>

              {subTab === "login" ? (
                <Form layout="vertical" onFinish={onIntervieweeLogin} size="large">
                  <Form.Item
                    name="username"
                    label="用户名或邮箱"
                    rules={[{ required: true, message: "请输入用户名或邮箱" }]}
                  >
                    <Input autoFocus placeholder="your_name" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[{ required: true, message: "请输入密码" }]}
                  >
                    <Input.Password placeholder="••••••••" />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                    <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                      进入面试
                    </Button>
                  </Form.Item>
                </Form>
              ) : (
                <Form layout="vertical" onFinish={onIntervieweeRegister} size="large">
                  <Form.Item
                    name="username"
                    label="用户名"
                    rules={[{ required: true, message: "请输入用户名" }]}
                  >
                    <Input autoFocus placeholder="your_name" />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    label="邮箱"
                    rules={[
                      { required: true, message: "请输入邮箱" },
                      { type: "email", message: "邮箱格式不正确" },
                    ]}
                  >
                    <Input placeholder="you@example.com" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[
                      { required: true, message: "请输入密码" },
                      { min: 6, message: "密码至少 6 位" },
                    ]}
                  >
                    <Input.Password placeholder="至少 6 位" />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                    <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                      注册并开始面试
                    </Button>
                  </Form.Item>
                </Form>
              )}
            </>
          )}
        </div>

        <div className="login-foot">
          {roleTab === "hr"
            ? "没有账号？请联系管理员"
            : "注册即代表你已准备好迎接挑战"}
        </div>
      </div>
    </div>
  );
}
