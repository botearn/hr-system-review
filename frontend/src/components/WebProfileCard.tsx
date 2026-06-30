import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  List,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import {
  GithubOutlined,
  GlobalOutlined,
  ReloadOutlined,
  StarOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { candidatesApi, type WebProfile, type WebProfileSource } from "@/api/candidates";

const { Text, Paragraph } = Typography;

interface Props {
  candidateId: number;
  webProfile: WebProfile | null;
  updatedAt: string | null;
  onRefreshed: () => void;
}

export default function WebProfileCard({ candidateId, webProfile, updatedAt, onRefreshed }: Props) {
  const [enriching, setEnriching] = useState(false);

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      await candidatesApi.enrichCandidate(candidateId);
      message.success("已启动网络调研，稍后刷新查看结果");
      // Wait a bit then refetch to show updated data
      setTimeout(() => {
        onRefreshed();
        setEnriching(false);
      }, 3000);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "调研启动失败");
      setEnriching(false);
    }
  };

  // No profile yet
  if (!webProfile) {
    return (
      <Card size="small">
        <Empty description="尚未执行网络调研" imageStyle={{ height: 48 }}>
          <Button type="primary" icon={<GlobalOutlined />} loading={enriching} onClick={handleEnrich}>
            开始调研
          </Button>
        </Empty>
      </Card>
    );
  }

  // Error state
  if (webProfile.error) {
    return (
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Alert
          type="warning"
          showIcon
          message="网络调研失败"
          description={webProfile.error}
          action={
            <Button size="small" icon={<ReloadOutlined />} loading={enriching} onClick={handleEnrich}>
              重试
            </Button>
          }
        />
      </Space>
    );
  }

  const github = webProfile.sources?.find((s) => s.type === "github") as WebProfileSource | undefined;
  const searchSources = webProfile.sources?.filter((s) => s.type !== "github") ?? [];

  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      {/* Header with refresh */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {updatedAt ? `更新于 ${updatedAt.slice(0, 16).replace("T", " ")}` : ""}
        </Text>
        <Button size="small" icon={<ReloadOutlined />} loading={enriching} onClick={handleEnrich}>
          重新调研
        </Button>
      </div>

      {/* Summary */}
      <Card size="small" title="概述" styles={{ body: { padding: 12 } }}>
        <Paragraph style={{ marginBottom: 0 }}>{webProfile.summary}</Paragraph>
      </Card>

      {/* Highlights */}
      {webProfile.highlights.length > 0 && (
        <Card size="small" title="亮点" styles={{ body: { padding: 12 } }}>
          <List
            size="small"
            dataSource={webProfile.highlights}
            renderItem={(item) => (
              <List.Item style={{ padding: "4px 0", border: "none" }}>
                <Tag color="blue" style={{ marginRight: 8 }}>★</Tag>
                {item}
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Risk Flags */}
      {webProfile.risk_flags.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="风险提示"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {webProfile.risk_flags.map((flag, i) => (
                <li key={i}>{flag}</li>
              ))}
            </ul>
          }
        />
      )}

      {/* GitHub */}
      {github && (
        <Card
          size="small"
          title={
            <Space>
              <GithubOutlined />
              <span>GitHub</span>
              {github.username && (
                <a
                  href={github.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontWeight: 400, fontSize: 13 }}
                >
                  @{github.username}
                </a>
              )}
            </Space>
          }
          styles={{ body: { padding: 12 } }}
        >
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Space size={16} wrap>
              <Text>Repos: <Text strong>{github.public_repos ?? 0}</Text></Text>
              <Text>Followers: <Text strong>{github.followers ?? 0}</Text></Text>
              {github.contribution_level && (
                <Tag color={
                  github.contribution_level === "very_active" ? "green" :
                  github.contribution_level === "active" ? "blue" :
                  github.contribution_level === "moderate" ? "orange" : "default"
                }>
                  {github.contribution_level}
                </Tag>
              )}
            </Space>

            {github.bio && <Paragraph type="secondary" style={{ marginBottom: 0 }}>{github.bio}</Paragraph>}

            {github.top_languages && Object.keys(github.top_languages).length > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>语言: </Text>
                <Space size={[0, 4]} wrap>
                  {Object.entries(github.top_languages).map(([lang, count]) => (
                    <Tag key={lang}>{lang} ({count})</Tag>
                  ))}
                </Space>
              </div>
            )}

            {github.notable_repos && github.notable_repos.length > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                  热门仓库:
                </Text>
                {github.notable_repos.map((repo) => (
                  <div key={repo.name} style={{ marginBottom: 4 }}>
                    <Space size={4}>
                      <Text strong style={{ fontSize: 13 }}>{repo.name}</Text>
                      {repo.stars > 0 && (
                        <Tag color="gold" style={{ marginRight: 0 }}>
                          <StarOutlined /> {repo.stars}
                        </Tag>
                      )}
                      {repo.language && <Tag>{repo.language}</Tag>}
                    </Space>
                    {repo.description && (
                      <div style={{ fontSize: 12, color: "#8c8c8c" }}>{repo.description}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Space>
        </Card>
      )}

      {/* Search Sources */}
      {searchSources.length > 0 && (
        <Card size="small" title="搜索发现" styles={{ body: { padding: 12 } }}>
          <List
            size="small"
            dataSource={searchSources}
            renderItem={(item) => (
              <List.Item style={{ padding: "6px 0" }}>
                <List.Item.Meta
                  title={
                    <Space size={4}>
                      {item.platform && <Tag>{item.platform}</Tag>}
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          {item.title || item.url}
                        </a>
                      ) : (
                        <Text>{item.title}</Text>
                      )}
                    </Space>
                  }
                  description={item.snippet ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>{item.snippet}</Text>
                  ) : undefined}
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </Space>
  );
}
