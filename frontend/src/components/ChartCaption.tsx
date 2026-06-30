import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional accent color for the bullet dot. */
  accent?: string;
}

/** A one-line factual summary rendered under a chart.
 *
 * Goal: tell the reader the *fact* the chart shows, not what we hope
 * they'll notice. Stay short, specific, numerical. Pull values out of
 * the same data the chart used so it can never go out of sync.
 */
export default function ChartCaption({ children, accent = "#722ed1" }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        marginTop: 12,
        padding: "8px 12px",
        background: "#fafafe",
        borderLeft: `2px solid ${accent}`,
        borderRadius: "0 6px 6px 0",
        fontSize: 12,
        lineHeight: 1.55,
        color: "#52527a",
      }}
    >
      <span>{children}</span>
    </div>
  );
}
