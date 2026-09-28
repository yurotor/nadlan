"use client";
import Link from "next/link";
import { useCallback } from "react";
import type { EChartsOption } from "echarts";
import { EChart, axisStyle, base, type Tokens } from "@/components/EChart";
import { cityName, fmtInt, fmtPct, fmtShekel, fmtShekelAxis, fmtShekelShort } from "@/lib/format";
import { useLang } from "@/components/LangProvider";

export function HeroChart({ data }: { data: { y: number; price: number; n: number }[] }) {
  const { lang, t: tr } = useLang();
  const build = useCallback((t: Tokens): EChartsOption => {
    const last = data.length - 1;
    return {
      ...base(t),
      grid: { left: 44, right: 44, top: 36, bottom: 4, containLabel: true },
      tooltip: {
        ...(base(t).tooltip as object),
        formatter: (ps) => {
          const i = (ps as { dataIndex: number }[])[0].dataIndex;
          return `<b>${data[i].y}</b><br/>${tr("Median", "חציון")} ${fmtShekel(data[i].price, lang)}<br/><span style="color:${t.muted}">${fmtInt(data[i].n)} ${tr("home sales", "מכירות דירות")}</span>`;
        },
      },
      xAxis: {
        type: "category", data: data.map((d) => String(d.y)), boundaryGap: false, ...axisStyle(t), splitLine: { show: false },
        axisLabel: { color: t.muted, fontSize: 12, interval: (i: number) => i % 3 === 0 || i === last },
      },
      yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => fmtShekelAxis(v, lang) }, splitNumber: 4 },
      series: [{
        type: "line", data: data.map((d) => d.price), smooth: 0.2, showSymbol: false, symbolSize: 9,
        lineStyle: { width: 2.5, color: t.brand },
        itemStyle: { color: t.brand },
        areaStyle: {
          color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: t.brand + "38" }, { offset: 1, color: t.brand + "00" }] },
        },
        markPoint: {
          symbol: "circle", symbolSize: 9, itemStyle: { color: t.brand, borderColor: t.paper, borderWidth: 2 },
          label: { position: "top", distance: 8, color: t.ink, fontWeight: 600, fontSize: 13, formatter: (p) => fmtShekelShort(p.value as number, lang) },
          data: [{ name: "first", coord: [0, data[0].price], value: data[0].price }, { name: "last", coord: [last, data[last].price], value: data[last].price }],
        },
      }],
    };
  }, [data, lang, tr]);
  return <EChart className="hero-chart" build={build} label={tr("Median Israeli home price by year", "מחיר דירה חציוני בישראל לפי שנה")} />;
}

type Row = { code: number; name_he: string; name_en: string | null; v: number };

export function RankBars({ rows, kind }: { rows: Row[]; kind: "shekel" | "pct" | "count" }) {
  const { lang } = useLang();
  const max = Math.max(...rows.map((r) => r.v));
  const fmt = (v: number) => (kind === "shekel" ? fmtShekel(v, lang) : kind === "pct" ? fmtPct(v) : fmtInt(v));
  return (
    <ol className="rank">
      {rows.map((r) => (
        <li key={r.code}>
          <Link href={`/cities/${r.code}`}>
            <span className="rank-name">{cityName(r, lang)}</span>
            <bdi className="rank-val num">{fmt(r.v)}</bdi>
            <span className="rank-bar" style={{ width: `${(r.v / max) * 100}%` }} />
          </Link>
        </li>
      ))}
    </ol>
  );
}
