import { useState } from "react";
import { Button, Popover, Space, Tooltip, message } from "antd";
import {
  CopyOutlined,
  MailOutlined,
  MessageOutlined,
  PhoneOutlined,
  WechatOutlined,
  EditOutlined,
} from "@ant-design/icons";
import NewFollowUpModal from "@/components/NewFollowUpModal";

interface Props {
  candidateId: number;
  candidateName?: string;
  phone: string | null;
  email: string | null;
  wechat: string | null;
  /** Notify parent when a follow-up is logged so it can refresh last-contact info */
  onLogged?: () => void;
}

const copy = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    message.success(`已复制${label}`);
  } catch {
    message.error("复制失败，请手动复制");
  }
};

function ChannelRow({
  icon,
  label,
  value,
  href,
  copyLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  copyLabel: string;
}) {
  const inner = (
    <span style={{ color: "#1a1a3e", fontSize: 13 }}>{value}</span>
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 4px",
        borderRadius: 6,
      }}
    >
      <span style={{ width: 16, color: "#722ed1", fontSize: 14, display: "inline-flex" }}>
        {icon}
      </span>
      <span style={{ width: 36, color: "#8c8c9a", fontSize: 12 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {href ? (
          <a href={href} style={{ color: "#1a1a3e" }}>
            {inner}
          </a>
        ) : (
          inner
        )}
      </span>
      <Tooltip title={`复制${copyLabel}`}>
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            copy(value, copyLabel);
          }}
        />
      </Tooltip>
    </div>
  );
}

export default function ContactPopover({
  candidateId,
  candidateName,
  phone,
  email,
  wechat,
  onLogged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const hasAny = !!(phone || email || wechat);

  const popoverContent = (
    <div style={{ width: 280 }} onClick={(e) => e.stopPropagation()}>
      {!hasAny ? (
        <div style={{ padding: "8px 4px", fontSize: 12, color: "#8c8c9a" }}>
          该候选人暂未填写联系方式
        </div>
      ) : (
        <Space direction="vertical" size={2} style={{ width: "100%" }}>
          {email && (
            <ChannelRow
              icon={<MailOutlined />}
              label="邮件"
              value={email}
              href={`mailto:${email}`}
              copyLabel="邮箱"
            />
          )}
          {phone && (
            <ChannelRow
              icon={<PhoneOutlined />}
              label="电话"
              value={phone}
              href={`tel:${phone}`}
              copyLabel="电话"
            />
          )}
          {wechat && (
            <ChannelRow
              icon={<WechatOutlined />}
              label="微信"
              value={wechat}
              copyLabel="微信号"
            />
          )}
        </Space>
      )}

      <div
        style={{
          marginTop: 6,
          paddingTop: 8,
          borderTop: "1px solid #f0f0f4",
        }}
      >
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          style={{ color: "#722ed1", fontSize: 12, padding: 0 }}
          onClick={() => {
            setOpen(false);
            setLogOpen(true);
          }}
        >
          记一笔沟通
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Popover
        content={popoverContent}
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement="bottomLeft"
        styles={{ body: { padding: 12 } }}
      >
        <Button
          type="primary"
          size="small"
          icon={<MessageOutlined />}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#722ed1",
            borderColor: "#722ed1",
            fontWeight: 500,
          }}
        >
          沟通
        </Button>
      </Popover>

      <NewFollowUpModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        candidateId={candidateId}
        candidateName={candidateName}
        onCreated={onLogged}
      />
    </>
  );
}