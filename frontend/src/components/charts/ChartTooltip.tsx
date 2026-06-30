/**
 * Shared chart tooltip — renders a small floating card matching the
 * dashboard's editorial palette. Each series shows up as a row with a
 * colored dot, the label, and the value (right-aligned, tabular-nums).
 *
 * Usage with Recharts:  <Tooltip content={<ChartTooltip />} cursor={...} />
 *
 * Optional `valueFmt` lets the parent format numbers (e.g. percentages,
 * currency). Defaults to .toLocaleString() on the raw value.
 *
 * Recharts 3.x passes `active` / `payload` / `label` at runtime; the
 * exported TooltipProps type was tightened, so we accept a loose shape
 * here and read what we need.
 */
interface PayloadItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  fill?: string;
}

interface Props {
  active?: boolean;
  payload?: PayloadItem[];
  label?: string | number;
  valueFmt?: (v: number) => string;
}

export function ChartTooltip({ active, payload, label, valueFmt }: Props) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid rgba(20, 20, 50, 0.08)",
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 8px 24px rgba(20, 20, 50, 0.08), 0 1px 2px rgba(20, 20, 50, 0.04)",
        fontSize: 12,
        color: "#1a1a4e",
        minWidth: 140,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {label != null && (
        <div
          style={{
            fontSize: 11,
            color: "#9ea0b0",
            letterSpacing: "0.04em",
            marginBottom: 6,
          }}
        >
          {label}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {payload.map((p: PayloadItem, i: number) => {
          const v = typeof p.value === "number" ? p.value : Number(p.value ?? 0);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: p.color ?? p.fill ?? "#1a1a4e",
                  }}
                />
                <span style={{ color: "#52527a" }}>{p.name}</span>
              </span>
              <span style={{ fontWeight: 500 }}>
                {valueFmt ? valueFmt(v) : v.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
