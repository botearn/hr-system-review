import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import App from "./App";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

// CGL 风格主题:深紫蓝主色 + 天蓝点缀 + 大圆角 + 留白
const cglTheme = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: "#1a1a4e",
    colorLink: "#5b7cff",
    colorLinkHover: "#7d97ff",
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 6,
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: 14,
    colorBgLayout: "#fafafb",
    colorBorder: "#ececf2",
    colorBorderSecondary: "#f5f5f8",
  },
  components: {
    Button: {
      borderRadius: 10,
      controlHeight: 36,
      fontWeight: 500,
    },
    Card: { borderRadiusLG: 14 },
    Tag: { borderRadiusSM: 999 },
    Table: {
      headerBg: "#fafafb",
      headerColor: "#52527a",
      headerSplitColor: "transparent",
      borderColor: "#f0f0f5",
      rowHoverBg: "#f8f9ff",
      cellPaddingBlock: 10,
      cellPaddingInline: 14,
      fontSize: 13,
    },
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={cglTheme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
