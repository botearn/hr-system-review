import { useEffect, useState } from "react";
import { DatePicker, Form, Input, Modal, Select, Space, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { followUpsApi, CHANNEL_LABEL, type FollowUpChannel } from "@/api/follow-ups";

interface FormValues {
  occurred_at: Dayjs;
  channel: FollowUpChannel;
  content: string;
  next_plan?: string;
  next_plan_due?: Dayjs;
}

interface Props {
  open: boolean;
  onClose: () => void;
  candidateId: number;
  candidateName?: string;
  positionId?: number;
  onCreated?: () => void;
}

export default function NewFollowUpModal({
  open,
  onClose,
  candidateId,
  candidateName,
  positionId,
  onCreated,
}: Props) {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ occurred_at: dayjs(), channel: "phone" });
    }
  }, [open, form]);

  const handleOk = async () => {
    const v = await form.validateFields();
    setSubmitting(true);
    try {
      await followUpsApi.create({
        candidate_id: candidateId,
        position_id: positionId,
        occurred_at: v.occurred_at.toISOString(),
        channel: v.channel,
        content: v.content,
        next_plan: v.next_plan || null,
        next_plan_due: v.next_plan_due ? v.next_plan_due.format("YYYY-MM-DD") : null,
      });
      message.success("已新增跟进");
      onCreated?.();
      onClose();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={candidateName ? `新增跟进 · ${candidateName}` : "新增跟进"}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={submitting}
      destroyOnClose
      width={520}
    >
      <Form form={form} layout="vertical">
        <Space style={{ display: "flex", width: "100%" }}>
          <Form.Item
            name="occurred_at"
            label="沟通时间"
            rules={[{ required: true }]}
            style={{ flex: 1 }}
          >
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="channel"
            label="沟通方式"
            rules={[{ required: true }]}
            style={{ flex: 1 }}
          >
            <Select
              popupMatchSelectWidth={false}
              options={(Object.keys(CHANNEL_LABEL) as FollowUpChannel[]).map((c) => ({
                value: c,
                label: CHANNEL_LABEL[c],
              }))}
            />
          </Form.Item>
        </Space>
        <Form.Item name="content" label="沟通内容" rules={[{ required: true, message: "必填" }]}>
          <Input.TextArea rows={4} placeholder="例：电话沟通薪资和到岗时间..." />
        </Form.Item>
        <Form.Item name="next_plan" label="下一步（HR TODO）">
          <Input placeholder="例：周三 14:00 安排一面" />
        </Form.Item>
        <Form.Item name="next_plan_due" label="下一步截止日">
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
