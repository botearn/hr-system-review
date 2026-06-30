import { useEffect, useRef } from "react";
import { notification } from "antd";
import { useNavigate } from "react-router-dom";
import { submissionsApi, type SubmissionStats } from "@/api/submissions";
import { useAuthStore } from "@/store/auth";

const POLL_MS = 30_000;

const CHALLENGE_NAMES: Record<string, string> = {
  "01": "自动化简历筛选器",
  "02": "Webhook 事件转发",
  "03": "AI 产品每日报告",
  "04": "AI 竞品分析报告",
};

export function useSubmissionNotifier() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const prevStats = useRef<SubmissionStats | null>(null);
  const lastPollTs = useRef<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    // 只对 HR 用户轮询
    if (!user || user.role_name === "interviewee") return;

    const poll = async () => {
      try {
        // 拉统计
        const statsRes = await submissionsApi.stats();
        const stats = statsRes.data;

        if (!initialized.current) {
          // 第一次：只记录基准，不弹通知
          prevStats.current = stats;
          lastPollTs.current = new Date().toISOString();
          initialized.current = true;
          return;
        }

        const prev = prevStats.current!;

        // 新注册面试者
        if (stats.total_interviewees > prev.total_interviewees) {
          const delta = stats.total_interviewees - prev.total_interviewees;
          notification.info({
            message: "新面试者注册",
            description: `${delta} 位新面试者刚刚注册了账号`,
            placement: "topRight",
            duration: 6,
          });
        }

        // 新提交：用 since 拉增量列表获取名字 + 题目
        if (stats.total_submissions > prev.total_submissions && lastPollTs.current) {
          try {
            const newRes = await submissionsApi.list(undefined, lastPollTs.current);
            const newSubs = newRes.data;
            if (newSubs.length > 0) {
              const first = newSubs[0];
              const name = first.submitter_name || first.submitter_username;
              const challenge = CHALLENGE_NAMES[first.challenge_id] ?? `题目 ${first.challenge_id}`;
              const extra = newSubs.length > 1 ? `，以及另外 ${newSubs.length - 1} 份` : "";
              notification.success({
                message: "新作品提交",
                description: `${name} 提交了「${challenge}」${extra}`,
                placement: "topRight",
                duration: 8,
                onClick: () => navigate("/interview-submissions"),
                style: { cursor: "pointer" },
              });
            }
          } catch {
            // 增量拉取失败不影响主流程
          }
        }

        prevStats.current = stats;
        lastPollTs.current = new Date().toISOString();
      } catch {
        // 网络错误静默处理
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [user?.id]); // user 变更时重置
}
