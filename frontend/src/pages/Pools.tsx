import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Drawer,
  Input,
  List,
  Modal,
  Popconfirm,
  Space,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import {
  PlusOutlined,
  ThunderboltOutlined,
  FireOutlined,
  MergeCellsOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import BubblePool, { type BubbleItem } from "@/components/BubblePool";
import { poolsApi, type PoolItem, type PoolCandidate, type PoolKind } from "@/api/pools";

const { Title, Paragraph, Text } = Typography;

export default function PoolsPage() {
  const [kind, setKind] = useState<PoolKind>("skills");
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          🍲 技能锅 · 能力锅
        </Title>
        <Paragraph type="secondary" style={{ margin: "6px 0 0" }}>
          把候选人的技能和能力当成锅里翻滚的食材。拖到锅外丢掉,点击看具体候选人, 右上角 +
          可以加入新的。每颗气泡里显示有多少候选人具备。
        </Paragraph>
      </div>
      <Tabs
        activeKey={kind}
        destroyInactiveTabPane
        onChange={(k: string) => setKind(k as PoolKind)}
        items={[
          {
            key: "skills",
            label: (
              <span>
                <ThunderboltOutlined /> 技能池
              </span>
            ),
            children: <PoolTab kind="skills" />,
          },
          {
            key: "capabilities",
            label: (
              <span>
                <FireOutlined /> 能力池
              </span>
            ),
            children: <PoolTab kind="capabilities" />,
          },
        ]}
      />
    </div>
  );
}

function PoolTab({ kind }: { kind: PoolKind }) {
  const [items, setItems] = useState<PoolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [drawer, setDrawer] = useState<{ item: PoolItem; cands: PoolCandidate[] } | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [regrouping, setRegrouping] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await poolsApi.list(kind);
      setItems(res);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await poolsApi.add(kind, name);
      message.success(kind === "skills" ? "新技能已下锅" : "新能力已下锅");
      setNewName("");
      setAdding(false);
      fetchItems();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "加入失败");
    }
  };

  const handleRegroup = async () => {
    Modal.confirm({
      title: "重新聚类能力池?",
      content: "会基于语义相似度合并近义能力,保留你手动添加的。",
      okText: "开始聚类",
      cancelText: "取消",
      onOk: async () => {
        setRegrouping(true);
        try {
          const r = await poolsApi.regroupCapabilities();
          message.success(`聚类完成,共 ${r.clusters} 个簇(阈值 ${r.threshold_used.toFixed(2)})`);
          fetchItems();
        } catch (e: any) {
          message.error(e?.response?.data?.detail ?? "聚类失败");
        } finally {
          setRegrouping(false);
        }
      },
    });
  };

  const handleRemove = async (id: number) => {
    try {
      await poolsApi.remove(kind, id);
      message.success("已丢出锅");
      fetchItems();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "删除失败");
    }
  };

  const handleBubbleClick = async (it: BubbleItem) => {
    const item = items.find((x) => x.id === it.id);
    if (!item) return;
    setDrawerLoading(true);
    try {
      const cands = await poolsApi.candidates(kind, it.id);
      setDrawer({ item, cands });
    } catch (e: any) {
      message.error("加载候选人失败");
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleDragOut = (it: BubbleItem) => {
    Modal.confirm({
      title: `确定把「${it.name}」丢出锅吗?`,
      content: "这只会从池子移除,不会删除候选人本身的数据。",
      okText: "丢掉",
      okButtonProps: { danger: true },
      cancelText: "留下",
      onOk: () => handleRemove(it.id),
    });
  };

  const bubbles: BubbleItem[] = items.map((it) => ({
    id: it.id,
    name: it.name,
    value: it.candidate_count,
    isCustom: it.is_custom,
  }));

  const label = kind === "skills" ? "技能" : "能力";

  return (
    <Card
      size="small"
      loading={loading}
      title={
        <Space>
          <Text strong>
            锅里共 {items.length} 道{label}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            (蓝色 = 系统提取 / 橙色 = 自定义)
          </Text>
        </Space>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchItems} loading={loading}>
            刷新
          </Button>
          {kind === "capabilities" && (
            <Button icon={<MergeCellsOutlined />} loading={regrouping} onClick={handleRegroup}>
              重新聚类
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
            加新{label}
          </Button>
        </Space>
      }
    >
      {!loading && items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#8c8c8c" }}>
          锅里还是空的。点右上角"加新{label}"手动添加,或者先去"候选人"页上传简历让系统自动抽取。
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
        <BubblePool
          items={bubbles}
          width={780}
          height={480}
          onBubbleClick={handleBubbleClick}
          onDragOut={handleDragOut}
          onRightClick={(it) => handleDragOut(it)}
        />
      </div>

      <Modal
        open={adding}
        title={`加入新${label}`}
        onCancel={() => {
          setAdding(false);
          setNewName("");
        }}
        onOk={handleAdd}
        okText="下锅"
        cancelText="取消"
      >
        <Input
          placeholder={`新${label}的名字`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleAdd}
          autoFocus
        />
      </Modal>

      <Drawer
        open={!!drawer}
        title={
          drawer ? (
            <Space wrap>
              <Text strong>{drawer.item.name}</Text>
              <Tag color={drawer.item.is_custom ? "orange" : "blue"}>
                {drawer.item.is_custom ? "自定义" : "系统"}
              </Tag>
              <Tag>{drawer.cands.length} 位候选人</Tag>
            </Space>
          ) : (
            ""
          )
        }
        onClose={() => setDrawer(null)}
        width={520}
      >
        {drawer && (
          <>
            {kind === "capabilities" && drawer.item.aliases && drawer.item.aliases.length > 1 && (
              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  background: "#fafafa",
                  borderRadius: 6,
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  已合并 {drawer.item.aliases.length} 条同义表达:
                </Text>
                <div style={{ marginTop: 6 }}>
                  {drawer.item.aliases.map((a: string, i: number) => (
                    <Tag
                      key={i}
                      color={a === drawer.item.name ? "purple" : "default"}
                      style={{ marginBottom: 4 }}
                    >
                      {a === drawer.item.name ? "★ " : ""}
                      {a}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            <Popconfirm
              title={`把「${drawer.item.name}」丢出锅?`}
              description="仅从池子移除,不影响候选人数据。"
              okText="丢掉"
              cancelText="留下"
              okButtonProps={{ danger: true }}
              onConfirm={() => {
                handleRemove(drawer.item.id);
                setDrawer(null);
              }}
            >
              <Button danger style={{ marginBottom: 12 }}>
                把这道菜丢出锅
              </Button>
            </Popconfirm>
            <List
              dataSource={drawer.cands}
              loading={drawerLoading}
              locale={{ emptyText: "没有候选人达标" }}
              renderItem={(c) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>{c.name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          #{c.candidate_id}
                        </Text>
                      </Space>
                    }
                    description={
                      <Space size={[4, 4]} wrap>
                        {c.city && <Tag>{c.city}</Tag>}
                        {c.industry && <Tag>{c.industry}</Tag>}
                        {c.years_of_experience != null && <Tag>{c.years_of_experience} 年</Tag>}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </>
        )}
      </Drawer>
    </Card>
  );
}
