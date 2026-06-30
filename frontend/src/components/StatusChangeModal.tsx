import { useEffect, useState } from "react";
import { Input, Modal, Space, Tag, Typography, message } from "antd";
import { followUpsApi, STATUS_COLOR, STATUS_LABEL, type FollowUpStatus } from "@/api/follow-ups";

const { Text, Paragraph } = Typography;

interface PhaseGroup {
  key: string;
  label: string;
  hint: string;
  statuses: FollowUpStatus[];
}

const PHASES: PhaseGroup[] = [
  {
    key: "contact",
    label: "接触",
    hint: "刚建立联系",
    statuses: ["initial_contact"],
  },
  {
    key: "push",
    label: "推送",
    hint: "已把简历推给客户",
    statuses: ["resume_pushed"],
  },
  {
    key: "interview",
    label: "面试中",
    hint: "客户安排面试 / 推进轮次",
    statuses: ["interview_scheduled", "interview_1_passed", "interview_2_passed"],
  },
  {
    key: "decision",
    label: "进行中决策",
    hint: "Offer 已发，等结果",
    statuses: ["offer_sent"],
  },
  {
    key: "won",
    label: "已成",
    hint: "成功入职",
    statuses: ["onboarded"],
  },
  {
    key: "lost",
    label: "未成",
    hint: "淘汰 / 拒 offer / 流失",
    statuses: ["rejected_1", "rejected_2", "declined_offer", "dropped"],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  candidateId: number;
  currentStatus: FollowUpStatus | null;
  /** When provided, the phase picker is hidden and this status is preselected. */
  presetStatus?: FollowUpStatus | null;
  onChanged?: () => void;
}

export default function StatusChangeModal({
  open,
  onClose,
  candidateId,
  currentStatus,
  presetStatus,
  onChanged,
}: Props) {
  const [pending, setPending] = useState<FollowUpStatus | null>(null);
  const [reason, setReason] = useState("");
  const [outcomeCompany, setOutcomeCompany] = useState("");
  const [outcomeRole, setOutcomeRole] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Preselect when used with a fixed target status (e.g. drag-to-已成).
  useEffect(() => {
    if (open && presetStatus) {
      setPending(presetStatus);
    }
  }, [open, presetStatus]);

  const reset = () => {
    setPending(null);
    setReason("");
    setOutcomeCompany("");
    setOutcomeRole("");
  };

  const showsOutcome =
    pending === "onboarded" || pending === "dropped" || pending === "declined_offer";
  const outcomeRequired = pending === "onboarded";
  const outcomeMissing =
    outcomeRequired && (!outcomeCompany.trim() || !outcomeRole.trim());

  const handleOk = async () => {
    if (!pending) return;
    if (outcomeMissing) {
      message.warning("入职去向：公司和岗位都需要填写");
      return;
    }
    setSubmitting(true);
    try {
      await followUpsApi.changeStatus({
        candidate_id: candidateId,
        to_status: pending,
        reason: reason || null,
        outcome_company: showsOutcome ? outcomeCompany.trim() || null : null,
        outcome_role: showsOutcome ? outcomeRole.trim() || null : null,
      });
      message.success("状态已更新");
      reset();
      onChanged?.();
      onClose();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={presetStatus ? `标记为「${STATUS_LABEL[presetStatus]}」` : "变更跟进状态"}
      open={open}
      onCancel={() => {
        reset();
        onClose();
      }}
      onOk={handleOk}
      okButtonProps={{ disabled: !pending, loading: submitting }}
      destroyOnClose
      width={520}
    >
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        当前：
        {currentStatus ? (
          <Tag color={STATUS_COLOR[currentStatus]}>{STATUS_LABEL[currentStatus]}</Tag>
        ) : (
          <Tag>未跟进</Tag>
        )}
      </Paragraph>

      <div style={{ marginBottom: 12, display: presetStatus ? "none" : undefined }}>
        <Text strong>变更为：</Text>
        <Space direction="vertical" size={10} style={{ width: "100%", marginTop: 8 }}>
          {PHASES.map((g) => (
            <div key={g.key}>
              <Space size={8} style={{ marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {g.label}
                </Text>
                <Text type="secondary" style={{ fontSize: 11, color: "#bfbfbf" }}>
                  {g.hint}
                </Text>
              </Space>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {g.statuses.map((s) => {
                  const checked = pending === s;
                  const color = STATUS_COLOR[s];
                  return (
                    <Tag.CheckableTag
                      key={s}
                      checked={checked}
                      onChange={(c) => setPending(c ? s : null)}
                      style={{
                        border: `1px solid ${checked ? "transparent" : "#d9d9d9"}`,
                        padding: "3px 10px",
                        fontSize: 13,
                        ...(checked ? phaseColorStyle(color) : {}),
                      }}
                    >
                      {STATUS_LABEL[s]}
                    </Tag.CheckableTag>
                  );
                })}
              </div>
            </div>
          ))}
        </Space>
      </div>

      {showsOutcome && (
        <div style={{ marginBottom: 12 }}>
          <Text strong>
            {outcomeRequired ? "入职去向" : "已知去向"}
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 6 }}>
              {outcomeRequired ? "（必填）" : "（选填，留空表示去向不明）"}
            </Text>
          </Text>
          <Space.Compact style={{ display: "flex", marginTop: 6 }}>
            <Input
              value={outcomeCompany}
              onChange={(e) => setOutcomeCompany(e.target.value)}
              placeholder="公司，例：商汤科技"
              status={outcomeRequired && !outcomeCompany.trim() ? "warning" : undefined}
            />
            <Input
              value={outcomeRole}
              onChange={(e) => setOutcomeRole(e.target.value)}
              placeholder="岗位，例：LLM 算法工程师"
              status={outcomeRequired && !outcomeRole.trim() ? "warning" : undefined}
            />
          </Space.Compact>
        </div>
      )}

      <div>
        <Text strong>原因 / 备注（可选）：</Text>
        <Input.TextArea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例：薪资不匹配 / 已通过技术面"
          style={{ marginTop: 6 }}
        />
      </div>
    </Modal>
  );
}

function phaseColorStyle(color: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    default: { bg: "#fafafa", fg: "#595959" },
    blue: { bg: "#e6f4ff", fg: "#0958d9" },
    cyan: { bg: "#e6fffb", fg: "#08979c" },
    geekblue: { bg: "#f0f5ff", fg: "#1d39c4" },
    purple: { bg: "#f9f0ff", fg: "#531dab" },
    gold: { bg: "#fffbe6", fg: "#d48806" },
    green: { bg: "#f6ffed", fg: "#389e0d" },
    orange: { bg: "#fff7e6", fg: "#d46b08" },
    red: { bg: "#fff1f0", fg: "#cf1322" },
    volcano: { bg: "#fff2e8", fg: "#d4380d" },
  };
  const c = map[color] ?? map.default;
  return { background: c.bg, color: c.fg, fontWeight: 500 };
}
