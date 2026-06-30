import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Row,
  Slider,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  AppstoreOutlined,
  BulbOutlined,
  ControlOutlined,
  DownloadOutlined,
  LoadingOutlined,
  ReloadOutlined,
  RocketOutlined,
  SendOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Segmented } from "antd";
import dayjs from "dayjs";
import { matchesApi, type MatchItem, type PositionOverviewItem } from "@/api/matches";
import { saveBlobResponse } from "@/api/download";
import RadarChart from "@/components/RadarChart";
import CandidateDetailDrawer from "@/components/CandidateDetailDrawer";
import ContactPopover from "@/components/ContactPopover";
import MatchCard from "@/components/MatchCard";
import AnimatedNumber from "@/components/AnimatedNumber";
import { useLayoutStore } from "@/store/layout";
import { usePageContextStore } from "@/store/pageContext";
import "@/styles/match-norm-slider.css";

const CHANNEL_LABEL: Record<string, string> = {
  phone: "电话",
  wechat: "微信",
  email: "邮件",
  in_person: "面谈",
  other: "其他",
};

const { Text, Title } = Typography;

const DIM_ORDER = ["capability", "skill", "salary", "industry", "education", "city"] as const;

const DIM_LABELS: Record<string, string> = {
  capability: "能力",
  skill: "技能",
  salary: "薪资",
  industry: "行业",
  education: "学历",
  city: "城市",
};

const DEFAULT_WEIGHTS: Record<string, number> = {
  capability: 0.4,
  skill: 0.2,
  salary: 0.15,
  industry: 0.1,
  education: 0.1,
  city: 0.05,
};

interface Preset {
  key: string;
  label: string;
  hint: string;
  weights: Record<string, number>;
}

const PRESETS: Preset[] = [
  { key: "balanced", label: "均衡", hint: "默认六维平衡推荐", weights: DEFAULT_WEIGHTS },
  {
    key: "capability",
    label: "能力优先",
    hint: "重视核心能力与背景深度",
    weights: { capability: 0.55, skill: 0.2, salary: 0.05, industry: 0.1, education: 0.05, city: 0.05 },
  },
  {
    key: "skill",
    label: "技能优先",
    hint: "重视硬性技能命中率",
    weights: { capability: 0.2, skill: 0.5, salary: 0.1, industry: 0.1, education: 0.05, city: 0.05 },
  },
  {
    key: "industry",
    label: "行业相关",
    hint: "重视行业经验匹配度",
    weights: { capability: 0.25, skill: 0.15, salary: 0.1, industry: 0.4, education: 0.05, city: 0.05 },
  },
  {
    key: "salary",
    label: "薪资敏感",
    hint: "重视薪资期望对齐",
    weights: { capability: 0.2, skill: 0.15, salary: 0.45, industry: 0.1, education: 0.05, city: 0.05 },
  },
];

// ─── Position Chip ────────────────────────────────────────────────────────────

function PositionChip({
  item,
  selected,
  onClick,
}: {
  item: PositionOverviewItem;
  selected: boolean;
  onClick: () => void;
}) {
  const empty = item.strong === 0 && item.good === 0;
  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        flexShrink: 0,
        padding: "8px 14px",
        borderRadius: 999,
        border: `1.5px solid ${selected ? "#722ed1" : "#e8e8f0"}`,
        background: selected ? "#722ed1" : "#fff",
        color: selected ? "#fff" : "#1a1a3e",
        transition: "all 0.18s",
        fontSize: 13,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span>{item.position_title}</span>
      {item.position_city && (
        <span style={{ fontSize: 11, opacity: 0.7 }}>· {item.position_city}</span>
      )}
      {item.strong > 0 && (
        <span
          style={{
            fontSize: 11,
            padding: "1px 8px",
            borderRadius: 999,
            background: selected ? "rgba(255,255,255,0.25)" : "#f6ffed",
            color: selected ? "#fff" : "#389e0d",
            border: selected ? "none" : "1px solid #b7eb8f",
          }}
          title="强匹配"
        >
          强 {item.strong}
        </span>
      )}
      {empty && (
        <Tooltip title="暂无匹配候选人">
          <ThunderboltOutlined style={{ color: selected ? "#fff" : "#faad14", fontSize: 12 }} />
        </Tooltip>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MatchesPage() {
  const [overview, setOverview] = useState<PositionOverviewItem[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewProgress, setOverviewProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [overviewCached, setOverviewCached] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<MatchItem[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS);
  const [activePreset, setActivePreset] = useState<string>("balanced");
  const [exporting, setExporting] = useState(false);
  const [detailItem, setDetailItem] = useState<MatchItem | null>(null);
  const [pickedItem, setPickedItem] = useState<MatchItem | null>(null);
  const [nlpInput, setNlpInput] = useState("");
  const [nlpParsing, setNlpParsing] = useState(false);
  const [nlpExplanation, setNlpExplanation] = useState<string | null>(null);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [view, setView] = useState<"card" | "list">(() => {
    return (localStorage.getItem("matches.view") as "card" | "list") ?? "card";
  });
  const aiPanelWidth = useLayoutStore((s) => s.aiPanelWidth);

  const loadOverview = async (refresh = false) => {
    setOverviewLoading(true);
    setOverviewError(null);
    setOverview([]);
    setOverviewProgress(null);
    setOverviewCached(false);
    const collected: PositionOverviewItem[] = [];
    try {
      await matchesApi.streamOverview(
        {
          onMeta: ({ total, cached }) => {
            setOverviewCached(cached);
            setOverviewProgress({ done: 0, total });
          },
          onItem: (item) => {
            collected.push(item);
            // sort by strong/good desc each time so the list stays correct as it grows
            const sorted = [...collected].sort(
              (a, b) => b.strong - a.strong || b.good - a.good,
            );
            setOverview(sorted);
            setOverviewProgress((p) => (p ? { ...p, done: collected.length } : p));
            // auto-select the first arrival once
            setSelected((cur) => (cur == null ? item.position_id : cur));
          },
        },
        { refresh },
      );
    } catch (e: any) {
      setOverviewError(e?.message ?? "加载失败");
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    const onFocus = () => loadOverview();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRun = async (posId?: number, weightsOverride?: Record<string, number>) => {
    const id = posId ?? selected;
    if (!id) return;
    setRunning(true);
    try {
      const ws = weightsOverride ?? weights;
      const payloadWeights = { ...ws, resume_quality: 0 };
      const r = await matchesApi.run({
        position_id: id,
        weights: payloadWeights,
        top_k: 50,
        limit: 20,
      });
      setResults(r.results);
      if (r.results.length === 0) {
        message.warning("没有匹配到候选人。若候选人还没向量化，请先点击重建索引。");
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "匹配失败");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!selected) return;
    handleRun(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Publish what the user is currently seeing into the shared page-context
  // store, so the AI panel can attach it to /agent/chat. Without this the
  // agent has no idea which position is selected when the user says "this
  // one" and falls back to a useless DB keyword search.
  useEffect(() => {
    const setCtx = usePageContextStore.getState().setContext;
    const selectedItem = overview.find((o) => o.position_id === selected);
    if (!selectedItem) {
      setCtx({ route: "/matches", description: "智能匹配 — 尚未选中岗位" });
      return;
    }
    setCtx({
      route: "/matches",
      description: `智能匹配 — 已选中岗位「${selectedItem.position_title}」，候选人按六维加权评分排序`,
      selectedPosition: {
        id: selectedItem.position_id,
        title: selectedItem.position_title,
      },
      visibleCandidates: results.slice(0, 10).map((r) => ({
        id: r.candidate_id,
        name: r.candidate_name,
        score: Math.round(r.score * 10) / 10,
        verdict: r.score >= 80 ? "强匹配" : r.score >= 60 ? "良好" : "一般",
      })),
    });
  }, [selected, overview, results]);

  useEffect(() => {
    return () => {
      usePageContextStore.getState().setContext(null);
    };
  }, []);

  const handlePreset = (preset: Preset) => {
    setActivePreset(preset.key);
    setWeights(preset.weights);
    setNlpExplanation(null);
    if (selected) handleRun(selected, preset.weights);
  };

  const handleNlpParse = async () => {
    if (!nlpInput.trim() || nlpParsing) return;
    setNlpParsing(true);
    setNlpExplanation(null);
    try {
      const res = await matchesApi.parseWeights(nlpInput.trim());
      setWeights(res.weights);
      setNlpExplanation(res.explanation);
      setActivePreset("custom");
      if (selected) handleRun(selected, res.weights);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "AI 解析失败，请重试");
    } finally {
      setNlpParsing(false);
    }
  };

  const handleResetDefault = () => {
    setWeights(DEFAULT_WEIGHTS);
    setActivePreset("balanced");
    setNlpExplanation(null);
    setNlpInput("");
    if (selected) handleRun(selected, DEFAULT_WEIGHTS);
  };

  const handleExport = async () => {
    if (!selected) return;
    setExporting(true);
    try {
      const payloadWeights = { ...weights, resume_quality: 0 };
      const res = await matchesApi.exportXlsx({
        position_id: selected,
        weights: payloadWeights,
        top_k: 50,
        limit: 20,
      });
      saveBlobResponse(res, `match_${selected}.xlsx`);
      message.success("已开始下载");
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const weightsRawTotal = Object.values(weights).reduce((a: number, b: number) => a + b, 0);
  const sharePct = (k: string) =>
    weightsRawTotal > 0 ? Math.round((weights[k] / weightsRawTotal) * 100) : 0;

  const radarValuesOf = (item: MatchItem) => DIM_ORDER.map((d) => Number(item.sub_scores[d] ?? 0));
  const radarLabels = DIM_ORDER.map((d) => DIM_LABELS[d]);

  const selectedOverview = overview.find((o) => o.position_id === selected);
  const isCustom = activePreset === "custom";
  const showNarration = !!nlpExplanation || isCustom;

  return (
    <div
      style={{
        padding: "24px 24px 96px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* ── Position chips ── */}
      <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: overview.length > 0 || overviewError ? 10 : 0,
          }}
        >
          <Space>
            <RocketOutlined style={{ color: "#722ed1" }} />
            <Text strong style={{ fontSize: 13 }}>
              选择岗位
            </Text>
            {overviewLoading && <Spin indicator={<LoadingOutlined spin />} size="small" />}
            {overviewLoading && overviewProgress && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {overviewProgress.done}/{overviewProgress.total}
              </Text>
            )}
            {!overviewLoading && overview.length > 0 && overviewCached && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                · 缓存结果
              </Text>
            )}
          </Space>
        </div>
        {overviewError ? (
          <Alert
            type="error"
            showIcon
            message="岗位总览加载失败"
            description={overviewError}
            action={
              <Button size="small" onClick={() => loadOverview()}>
                重试
              </Button>
            }
          />
        ) : overview.length === 0 && !overviewLoading ? (
          <Empty description="暂无开放岗位" />
        ) : (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {overview.map((item) => (
              <PositionChip
                key={item.position_id}
                item={item}
                selected={selected === item.position_id}
                onClick={() => setSelected(item.position_id)}
              />
            ))}
          </div>
        )}
      </Card>

      {selected && (
        <>
          {/* ── Hero NL input + preset chips ── */}
          <Card
            size="small"
            styles={{
              body: {
                padding: 20,
                background: "linear-gradient(135deg, #f9f5ff 0%, #ffffff 80%)",
                borderRadius: 8,
              },
            }}
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <div>
                <Text strong style={{ fontSize: 15 }}>
                  <BulbOutlined style={{ color: "#722ed1", marginRight: 8 }} />
                  告诉 AI 你的偏好
                </Text>
                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                  自由描述，AI 会自动调整六维权重并重新匹配
                </Text>
              </div>
              <Input.TextArea
                value={nlpInput}
                onChange={(e) => setNlpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleNlpParse();
                  }
                }}
                placeholder="例如：最看重能力和行业背景，薪资可灵活；学历不重要"
                autoSize={{ minRows: 2, maxRows: 4 }}
                style={{ fontSize: 14 }}
                disabled={nlpParsing}
              />
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <Button
                  type="primary"
                  icon={nlpParsing ? <LoadingOutlined /> : <SendOutlined />}
                  loading={nlpParsing}
                  disabled={!nlpInput.trim()}
                  onClick={handleNlpParse}
                  style={{ background: "#722ed1", borderColor: "#722ed1" }}
                >
                  AI 解析偏好
                </Button>
                <Text type="secondary" style={{ fontSize: 12, marginLeft: 4, marginRight: 4 }}>
                  或选择预设：
                </Text>
                {PRESETS.map((p) => (
                  <Tooltip key={p.key} title={p.hint}>
                    <span
                      onClick={() => handlePreset(p)}
                      style={{
                        cursor: "pointer",
                        padding: "5px 12px",
                        borderRadius: 999,
                        background: activePreset === p.key ? "#722ed1" : "#fff",
                        color: activePreset === p.key ? "#fff" : "#531dab",
                        border: `1px solid ${activePreset === p.key ? "#722ed1" : "#d3adf7"}`,
                        fontSize: 12,
                        fontWeight: 500,
                        userSelect: "none",
                        transition: "all 0.15s",
                      }}
                    >
                      {p.label}
                    </span>
                  </Tooltip>
                ))}
              </div>
            </Space>
          </Card>

          {/* ── AI narration banner ── */}
          {showNarration && (
            <Alert
              type="info"
              showIcon
              icon={<BulbOutlined style={{ color: "#722ed1" }} />}
              style={{ background: "#faf5ff", border: "1px solid #d3adf7" }}
              message={
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <Text strong style={{ color: "#531dab", fontSize: 13 }}>
                    {nlpExplanation ? "AI 已根据你的描述调整权重：" : "已使用自定义权重："}
                  </Text>
                  {DIM_ORDER.map((k) => (
                    <span
                      key={k}
                      style={{
                        background: "#fff",
                        border: "1px solid #d3adf7",
                        borderRadius: 999,
                        padding: "1px 8px",
                        fontSize: 11,
                        color: "#531dab",
                      }}
                    >
                      {DIM_LABELS[k]} {sharePct(k)}%
                    </span>
                  ))}
                </div>
              }
              description={
                nlpExplanation && (
                  <Text style={{ fontSize: 12, color: "#531dab" }}>{nlpExplanation}</Text>
                )
              }
              action={
                <Space>
                  <Button size="small" type="link" onClick={() => setTuneOpen(true)}>
                    查看 / 微调
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    icon={<ReloadOutlined />}
                    onClick={handleResetDefault}
                  >
                    恢复默认
                  </Button>
                </Space>
              }
            />
          )}

          {/* ── Results ── */}
          <Card
            size="small"
            title={
              running ? (
                <Space>
                  <Spin indicator={<LoadingOutlined spin />} size="small" />
                  <span>匹配中…</span>
                </Space>
              ) : (
                <Space>
                  <span>匹配结果</span>
                  {selectedOverview && (
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                      · {selectedOverview.position_title}
                    </Text>
                  )}
                  {results.length > 0 && (
                    <>
                      <Tooltip title="≥ 80 分: 强匹配">
                        <Badge
                          count={results.filter((r) => r.score >= 80).length}
                          color="#52c41a"
                        />
                      </Tooltip>
                      <Tooltip title="60-79 分: 良好匹配">
                        <Badge
                          count={results.filter((r) => r.score >= 60 && r.score < 80).length}
                          color="#1677ff"
                        />
                      </Tooltip>
                    </>
                  )}
                </Space>
              )
            }
            extra={
              <Space size={8}>
                <Segmented
                  size="small"
                  value={view}
                  onChange={(v) => {
                    const next = v as "card" | "list";
                    setView(next);
                    localStorage.setItem("matches.view", next);
                  }}
                  options={[
                    { value: "card", icon: <AppstoreOutlined />, title: "卡片" } as any,
                    { value: "list", icon: <UnorderedListOutlined />, title: "列表" } as any,
                  ]}
                />
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  loading={exporting}
                  disabled={results.length === 0}
                  onClick={handleExport}
                >
                  导出 Excel
                </Button>
              </Space>
            }
          >
            {results.length === 0 && !running ? (
              <Empty description="暂无匹配结果" />
            ) : view === "card" ? (
              <Row gutter={[16, 16]}>
                {results.map((item) => (
                  <Col key={item.candidate_id} xs={24} md={12} xl={8}>
                    <MatchCard
                      item={item}
                      radarLabels={radarLabels}
                      radarValues={radarValuesOf(item)}
                      onOpenDetail={() => setPickedItem(item)}
                      onOpenRadar={() => setDetailItem(item)}
                      onLogged={() => selected && handleRun(selected)}
                    />
                  </Col>
                ))}
              </Row>
            ) : (
              <List
                dataSource={results}
                renderItem={(item: MatchItem) => {
                  const tier =
                    item.score >= 80
                      ? {
                          label: "强匹配",
                          color: "#389e0d",
                          bg: "#f6ffed",
                          border: "#b7eb8f",
                          score: "#52c41a",
                        }
                      : item.score >= 60
                        ? {
                            label: "良好",
                            color: "#0958d9",
                            bg: "#e6f4ff",
                            border: "#91caff",
                            score: "#1677ff",
                          }
                        : {
                            label: "一般",
                            color: "#d46b08",
                            bg: "#fffbe6",
                            border: "#ffe58f",
                            score: "#faad14",
                          };
                  const meta = [
                    item.city,
                    item.industry,
                    item.years_of_experience != null
                      ? `${item.years_of_experience} 年经验`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <List.Item style={{ padding: 0, border: "none", marginBottom: 12 }}>
                      <Card
                        size="small"
                        style={{ width: "100%" }}
                        styles={{ body: { padding: 16 } }}
                      >
                        <Row gutter={20} align="middle" wrap={false}>
                          <Col flex="auto" style={{ minWidth: 0 }}>
                            {/* identity */}
                            <div
                              onClick={() => setPickedItem(item)}
                              style={{
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "baseline",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                              title="点击查看候选人详情"
                            >
                              <Title
                                level={4}
                                style={{
                                  margin: 0,
                                  color: "#1677ff",
                                  fontSize: 18,
                                  lineHeight: 1.2,
                                }}
                              >
                                {item.candidate_name}
                              </Title>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                #{item.candidate_id}
                              </Text>
                            </div>
                            {meta && (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 13,
                                  color: "#52527a",
                                }}
                              >
                                {meta}
                              </div>
                            )}

                            {/* AI rank reason — always inline when present */}
                            {item.rank_reason && (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: "8px 12px",
                                  background: tier.bg,
                                  border: `1px solid ${tier.border}`,
                                  borderRadius: 6,
                                  fontSize: 13,
                                  color: tier.color,
                                  lineHeight: 1.55,
                                }}
                              >
                                <BulbOutlined style={{ marginRight: 6 }} />
                                {item.rank_reason}
                              </div>
                            )}

                            {/* actions row */}
                            <div
                              style={{
                                marginTop: 12,
                                display: "flex",
                                alignItems: "center",
                                gap: 14,
                                flexWrap: "wrap",
                              }}
                            >
                              <ContactPopover
                                candidateId={item.candidate_id}
                                candidateName={item.candidate_name}
                                phone={item.phone}
                                email={item.email}
                                wechat={item.wechat}
                                onLogged={() => selected && handleRun(selected)}
                              />
                              {item.last_contact_at && (
                                <span style={{ fontSize: 12, color: "#8c8c9a" }}>
                                  上次联系: {dayjs(item.last_contact_at).fromNow()}
                                  {item.last_contact_channel && (
                                    <span>
                                      {" · "}
                                      {CHANNEL_LABEL[item.last_contact_channel] ??
                                        item.last_contact_channel}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </Col>

                          {/* score zone — pill + score + radar stacked */}
                          <Col flex="180px" style={{ textAlign: "center" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                justifyContent: "center",
                                gap: 8,
                                marginBottom: 4,
                              }}
                            >
                              <span
                                style={{
                                  padding: "2px 10px",
                                  background: tier.bg,
                                  border: `1px solid ${tier.border}`,
                                  color: tier.color,
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 500,
                                }}
                              >
                                {tier.label}
                              </span>
                              <span
                                style={{
                                  fontSize: 26,
                                  fontWeight: 700,
                                  color: tier.score,
                                  lineHeight: 1,
                                }}
                              >
                                {item.score.toFixed(1)}
                              </span>
                            </div>
                            <div
                              onClick={() => setDetailItem(item)}
                              style={{ cursor: "pointer", display: "inline-block" }}
                              title="点击查看六维详细分析"
                            >
                              <RadarChart
                                labels={radarLabels}
                                values={radarValuesOf(item)}
                                size={130}
                                showLabels={false}
                              />
                              <div style={{ marginTop: 2, fontSize: 11, color: "#8c8c9a" }}>
                                六维详情 →
                              </div>
                            </div>
                          </Col>
                        </Row>
                      </Card>
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </>
      )}

      {/* ── Floating "微调权重" trigger — pinned to the AiPanel's left edge ── */}
      {selected && (
        <Button
          type="primary"
          shape="round"
          icon={<ControlOutlined />}
          onClick={() => setTuneOpen(true)}
          style={{
            position: "fixed",
            bottom: 32,
            right: aiPanelWidth + 12,
            height: 44,
            paddingInline: 18,
            background: "#722ed1",
            borderColor: "#722ed1",
            boxShadow: "0 4px 16px rgba(114, 46, 209, 0.35)",
            transition: "right 0.18s",
            zIndex: 100,
          }}
        >
          微调权重
        </Button>
      )}

      {/* ── Tune drawer ── */}
      <Drawer
        title={
          <Space>
            <ControlOutlined />
            <span>精细调整匹配权重</span>
          </Space>
        }
        placement="right"
        width={420}
        open={tuneOpen}
        onClose={() => setTuneOpen(false)}
        extra={
          <Button size="small" onClick={handleResetDefault}>
            恢复默认
          </Button>
        }
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="按相对重要度拖动滑块即可，系统会自动归一化为百分比"
            style={{ fontSize: 12 }}
          />
          <Form layout="vertical">
            {DIM_ORDER.map((k) => {
              const total = weightsRawTotal;
              const norm = total > 0 ? weights[k] / total : 0;
              const pct = Math.round(norm * 100);
              const onSliderChange = (vNorm: number) => {
                // The slider position is the *normalized* share (0..1).
                // Convert that intent back into a raw weight so that pulling
                // one dimension up visibly shrinks the others' shares
                // (without mutating their raw values).
                const otherRaw = total - weights[k];
                let nextK: number;
                if (vNorm >= 0.999) {
                  // user wants this dim to take everything → zero the others
                  setWeights(
                    Object.fromEntries(
                      DIM_ORDER.map((d) => [d, d === k ? 1 : 0]),
                    ) as Record<string, number>,
                  );
                  setActivePreset("custom");
                  return;
                }
                if (otherRaw <= 0) {
                  // edge: all others are zero, give this dim the whole slider
                  nextK = vNorm;
                } else {
                  nextK = (vNorm * otherRaw) / (1 - vNorm);
                }
                setWeights({ ...weights, [k]: nextK });
                setActivePreset("custom");
              };
              return (
                <Form.Item
                  key={k}
                  label={
                    <div
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <Text style={{ fontSize: 13 }}>{DIM_LABELS[k]}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <AnimatedNumber value={pct} />%
                      </Text>
                    </div>
                  }
                  style={{ marginBottom: 12 }}
                  className="match-norm-slider"
                >
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={norm}
                    onChange={onSliderChange}
                    tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
                  />
                </Form.Item>
              );
            })}
            <Button
              type="primary"
              block
              loading={running}
              onClick={() => {
                handleRun();
                setTuneOpen(false);
              }}
              style={{ background: "#722ed1", borderColor: "#722ed1" }}
            >
              应用并重新匹配
            </Button>
          </Form>
        </Space>
      </Drawer>

      <CandidateDetailDrawer
        candidateId={pickedItem?.candidate_id ?? null}
        open={pickedItem != null}
        onClose={() => setPickedItem(null)}
        matchContext={
          pickedItem && selectedOverview
            ? {
                position_id: selectedOverview.position_id,
                position_title: selectedOverview.position_title,
                score: pickedItem.score,
                sub_scores: pickedItem.sub_scores,
                matched_points: pickedItem.matched_points,
                gap_points: pickedItem.gap_points,
                rank_reason: pickedItem.rank_reason,
                analysis: pickedItem.analysis,
                interview_advice: pickedItem.interview_advice,
              }
            : undefined
        }
      />

      {/* 详细分析 Modal */}
      <Modal
        open={!!detailItem}
        title={
          detailItem ? (
            <Space>
              <span>{detailItem.candidate_name} · 六维分析</span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                #{detailItem.candidate_id}
              </Text>
            </Space>
          ) : (
            ""
          )
        }
        onCancel={() => setDetailItem(null)}
        footer={<Button onClick={() => setDetailItem(null)}>关闭</Button>}
        width={960}
      >
        {detailItem && (
          <DetailContent
            item={detailItem}
            labels={radarLabels}
            values={radarValuesOf(detailItem)}
          />
        )}
      </Modal>
    </div>
  );
}

function DetailContent({
  item,
  labels,
  values,
}: {
  item: MatchItem;
  labels: string[];
  values: number[];
}) {
  const cap = item.capability_breakdown ?? {};
  const sk = item.skill_breakdown ?? {};
  const mustCaps = cap.must ?? [];
  const niceCaps = cap.nice ?? [];
  const reqSkills = sk.required ?? [];
  const niceSkills = sk.nice_to_have ?? [];
  const hasAny = mustCaps.length + niceCaps.length + reqSkills.length + niceSkills.length > 0;

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Row gutter={16} align="middle">
        <Col span={9} style={{ textAlign: "center" }}>
          <RadarChart labels={labels} values={values} size={240} showLabels />
          <div style={{ marginTop: 4 }}>
            <Text
              strong
              style={{
                fontSize: 28,
                color:
                  item.score >= 80 ? "#52c41a" : item.score >= 60 ? "#1677ff" : "#faad14",
              }}
            >
              {item.score.toFixed(1)}
            </Text>
            <Text type="secondary" style={{ marginLeft: 6 }}>
              综合分
            </Text>
          </div>
          {item.rank_reason && (
            <div
              style={{
                marginTop: 8,
                padding: "4px 10px",
                background: "#faf5ff",
                border: "1px solid #d3adf7",
                borderRadius: 8,
                fontSize: 12,
                color: "#531dab",
                display: "inline-block",
              }}
            >
              {item.rank_reason}
            </div>
          )}
        </Col>
        <Col span={15}>
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            <Alert
              type="info"
              showIcon
              message={<Text strong>匹配情况</Text>}
              description={<Text style={{ fontSize: 13 }}>{item.analysis || "暂无分析"}</Text>}
            />
            <Alert
              type="warning"
              showIcon
              message={<Text strong>面试建议</Text>}
              description={
                item.interview_advice && item.interview_advice.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {item.interview_advice.map((a, i) => (
                      <li key={i} style={{ fontSize: 13, marginBottom: 2 }}>
                        {a}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    无特别关注点，可直接推进流程
                  </Text>
                )
              }
            />
          </Space>
        </Col>
      </Row>

      {hasAny && (
        <Card size="small" title="能力与技能" styles={{ body: { padding: 12 } }}>
          {mustCaps.length > 0 && <TagGroup label="必备能力" items={mustCaps} priority />}
          {niceCaps.length > 0 && <TagGroup label="加分能力" items={niceCaps} />}
          {reqSkills.length > 0 && <TagGroup label="硬性技能" items={reqSkills} priority />}
          {niceSkills.length > 0 && <TagGroup label="加分技能" items={niceSkills} />}
        </Card>
      )}

      <Card size="small" title="其他维度" styles={{ body: { padding: 12 } }}>
        <Row gutter={[12, 8]}>
          {(["salary", "industry", "education", "city"] as const).map((d) => {
            const score = Number(item.sub_scores[d] ?? 0);
            const mp = item.matched_points.find((p) => p.dim === d)?.detail;
            const gp = item.gap_points.find((p) => p.dim === d)?.detail;
            return (
              <Col span={12} key={d}>
                <Space>
                  <Text strong>{DIM_LABELS[d]}</Text>
                  <Text type="secondary">{score.toFixed(0)}</Text>
                </Space>
                {mp && <div style={{ fontSize: 12, color: "#595959" }}>{mp}</div>}
                {gp && <div style={{ fontSize: 12, color: "#cf1322" }}>{gp}</div>}
              </Col>
            );
          })}
        </Row>
      </Card>
    </Space>
  );
}

function TagGroup({
  label,
  items,
  priority = false,
}: {
  label: string;
  items: { name: string; matched: boolean }[];
  priority?: boolean;
}) {
  const matchedCount = items.filter((it) => it.matched).length;
  return (
    <div style={{ marginBottom: 12 }}>
      <Space size={8} style={{ marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {label}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {matchedCount}/{items.length}
        </Text>
      </Space>
      <div>
        {items.map((it, i) => (
          <Tag
            key={`${it.name}-${i}`}
            style={{
              marginBottom: 4,
              borderRadius: 12,
              padding: "2px 10px",
              fontWeight: priority ? 500 : 400,
              ...(it.matched
                ? { background: "#f6ffed", borderColor: "#b7eb8f", color: "#389e0d" }
                : { background: "#fafafa", borderColor: "#d9d9d9", color: "#bfbfbf" }),
            }}
          >
            {it.name}
          </Tag>
        ))}
      </div>
    </div>
  );
}