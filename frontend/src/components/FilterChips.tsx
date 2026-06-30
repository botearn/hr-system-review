import { useState } from "react";
import { Button, Dropdown, Input, Select, Tag } from "antd";
import { CloseOutlined, FilterOutlined, PlusOutlined } from "@ant-design/icons";

export interface FilterDef {
  key: string;
  label: string;
  /** "single" 单选下拉, "multi" 多选下拉, "text" 文本 */
  kind: "single" | "multi" | "text";
  options?: { value: string; label: string }[];
}

export type FilterValue = string | string[] | undefined;

interface Props {
  defs: FilterDef[];
  values: Record<string, FilterValue>;
  onChange: (key: string, value: FilterValue) => void;
  onReset?: () => void;
  /** 顶部搜索框 placeholder, 不填则不显示 */
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onSearch?: () => void;
  /** 右侧额外控件 (视图切换器等) */
  extra?: React.ReactNode;
}

export default function FilterChips({
  defs,
  values,
  onChange,
  onReset,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  onSearch,
  extra,
}: Props) {
  const [activeEdit, setActiveEdit] = useState<string | null>(null);

  const isFilterActive = (def: FilterDef): boolean => {
    const v = values[def.key];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && v !== "";
  };

  const activeDefs = defs.filter(isFilterActive);
  const inactiveDefs = defs.filter((d) => !isFilterActive(d));

  const renderChipValue = (def: FilterDef): string => {
    const v = values[def.key];
    if (Array.isArray(v)) {
      if (v.length === 0) return "";
      const labels = v.map((x) => def.options?.find((o) => o.value === x)?.label ?? x);
      if (labels.length <= 2) return labels.join(", ");
      return `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
    }
    return def.options?.find((o) => o.value === v)?.label ?? String(v ?? "");
  };

  const renderEditor = (def: FilterDef): React.ReactNode => {
    if (def.kind === "single") {
      return (
        <Select
          autoFocus
          open
          allowClear
          style={{ minWidth: 200 }}
          value={values[def.key] as string | undefined}
          onChange={(v) => {
            onChange(def.key, v);
            setActiveEdit(null);
          }}
          options={def.options ?? []}
          placeholder={`选择 ${def.label}`}
        />
      );
    }
    if (def.kind === "multi") {
      return (
        <Select
          autoFocus
          open
          mode="multiple"
          allowClear
          style={{ minWidth: 240 }}
          value={(values[def.key] as string[]) ?? []}
          onChange={(v) => onChange(def.key, v)}
          options={def.options ?? []}
          placeholder={`选择 ${def.label}`}
          maxTagCount="responsive"
          onBlur={() => setActiveEdit(null)}
        />
      );
    }
    return (
      <Input
        autoFocus
        placeholder={def.label}
        value={(values[def.key] as string) ?? ""}
        onChange={(e) => onChange(def.key, e.target.value)}
        onPressEnter={() => setActiveEdit(null)}
        onBlur={() => setActiveEdit(null)}
        style={{ width: 200 }}
      />
    );
  };

  const totalActive = activeDefs.length + (searchValue ? 1 : 0);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        background: "#fff",
        border: "1px solid #ececf2",
        borderRadius: 10,
        marginBottom: 16,
      }}
    >
      <FilterOutlined style={{ color: "#9ea0b0", fontSize: 14 }} />

      {searchPlaceholder && (
        <Input.Search
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onSearch={() => onSearch?.()}
          allowClear
          style={{ width: 240 }}
          variant="borderless"
        />
      )}

      {activeDefs.map((def) => (
        <ActiveChip
          key={def.key}
          label={def.label}
          value={renderChipValue(def)}
          editing={activeEdit === def.key}
          onEdit={() => setActiveEdit(def.key)}
          onClear={() => onChange(def.key, def.kind === "multi" ? [] : undefined)}
          editor={activeEdit === def.key ? renderEditor(def) : null}
        />
      ))}

      {inactiveDefs.length > 0 && (
        <Dropdown
          menu={{
            items: inactiveDefs.map((def) => ({
              key: def.key,
              label: def.label,
              onClick: () => setActiveEdit(def.key),
            })),
          }}
          trigger={["click"]}
        >
          <Button
            size="small"
            icon={<PlusOutlined />}
            style={{
              borderStyle: "dashed",
              color: "#52527a",
              borderColor: "#d8d8e3",
              fontWeight: 500,
            }}
          >
            添加筛选
          </Button>
        </Dropdown>
      )}

      {/* 没活跃筛选时,inactive 弹起的编辑器要显示 */}
      {activeEdit && !activeDefs.find((d) => d.key === activeEdit) && (
        <div style={{ display: "inline-flex" }}>
          {renderEditor(defs.find((d) => d.key === activeEdit)!)}
        </div>
      )}

      {totalActive > 0 && onReset && (
        <Button type="link" size="small" onClick={onReset} style={{ padding: 0 }}>
          重置
        </Button>
      )}

      {extra && <div style={{ marginLeft: "auto" }}>{extra}</div>}
    </div>
  );
}

function ActiveChip({
  label,
  value,
  editing,
  editor,
  onEdit,
  onClear,
}: {
  label: string;
  value: string;
  editing: boolean;
  editor: React.ReactNode;
  onEdit: () => void;
  onClear: () => void;
}) {
  if (editing && editor) {
    return <span>{editor}</span>;
  }
  return (
    <Tag
      style={{
        background: "#eef2ff",
        color: "#1a1a4e",
        border: "1px solid #cdd5ff",
        borderRadius: 6,
        margin: 0,
        padding: "2px 8px",
        fontSize: 12,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      onClick={onEdit}
    >
      <span style={{ color: "#52527a" }}>{label}:</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
      <CloseOutlined
        style={{ fontSize: 10, color: "#9ea0b0", cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
      />
    </Tag>
  );
}
