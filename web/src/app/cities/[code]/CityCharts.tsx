"use client";
import { useCallback } from "react";
import type { EChartsOption } from "echarts";
import { EChart, axisStyle, base, type Tokens } from "@/components/EChart";
import { fmtInt, fmtShekel, fmtShekelAxis, fmtShekelShort } from "@/lib/format";
import { useLang } from "@/components/LangProvider";

type Yearly = { y: number; n: number; n_all: number; price: number | null; ppsqm: number | null };
type Rooms = { r: string; n: number; price: number; ppsqm: number };
type Hist = { b: number; n: number };

export function CityCharts({ yearly, rooms, hist, name }: { yearly: Yearly[]; rooms: Rooms[]; hist: Hist[]; name: string }) {
  const lastYear = yearly.at(-1)?.y;
  const { lang, t: tr } = useLang();

  const priceChart = useCallback((t: Tokens): EChartsOption => ({
    ...base(t),
    tooltip: { ...(base(t).tooltip as object), valueFormatter: (v) => fmtShekel(v as number, lang) },
    xAxis: { type: "category", data: yearly.map((d) => String(d.y)), ...axisStyle(t), splitLine: { show: false }, boundaryGap: false },
    yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => fmtShekelAxis(v, lang) } },
    series: [{
      type: "line", name: tr("Median price", "מחיר חציוני"), data: yearly.map((d) => (d.n >= 5 ? d.price : null)), showSymbol: false, symbolSize: 8,
      lineStyle: { width: 2, color: t.series[0] }, itemStyle: { color: t.series[0] },
      areaStyle: { color: t.series[0], opacity: 0.08 },
    }],
  }), [yearly, lang, tr]);

  const ppsqmChart = useCallback((t: Tokens): EChartsOption => ({
    ...base(t),
    tooltip: { ...(base(t).tooltip as object), valueFormatter: (v) => fmtShekel(v as number, lang) },
    xAxis: { type: "category", data: yearly.map((d) => String(d.y)), ...axisStyle(t), splitLine: { show: false }, boundaryGap: false },
    yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => fmtShekelAxis(v, lang) } },
    series: [{
      type: "line", name: tr("Median ₪/m²", "מחיר חציוני למ״ר"), data: yearly.map((d) => (d.n >= 5 ? d.ppsqm : null)), showSymbol: false, symbolSize: 8,
      lineStyle: { width: 2, color: t.series[0] }, itemStyle: { color: t.series[0] },
    }],
  }), [yearly, lang, tr]);

  const countChart = useCallback((t: Tokens): EChartsOption => ({
    ...base(t),
    tooltip: { ...(base(t).tooltip as object), valueFormatter: (v) => fmtInt(v as number) },
    xAxis: { type: "category", data: yearly.map((d) => String(d.y)), ...axisStyle(t), splitLine: { show: false } },
    yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => fmtInt(v) } },
    series: [{
      type: "bar", name: tr("Deals", "עסקאות"), data: yearly.map((d) => ({ value: d.n_all, itemStyle: d.y === lastYear ? { color: t.series[0], opacity: 0.45 } : undefined })),
      barMaxWidth: 16, itemStyle: { color: t.series[0], borderRadius: [3, 3, 0, 0] },
    }],
  }), [yearly, lastYear, tr]);

  const roomsChart = useCallback((t: Tokens): EChartsOption => ({
    ...base(t),
    tooltip: {
      ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.5 } },
      formatter: (ps) => {
        const p = (ps as { dataIndex: number }[])[0];
        const r = rooms[p.dataIndex];
        return tr(
          `<b>${r.r} rooms</b><br/>Median price ${fmtShekel(r.price)}<br/>${fmtShekel(r.ppsqm)}/m²<br/>${fmtInt(r.n)} sales`,
          `<b>\u2066${r.r}\u2069 חדרים</b><br/>מחיר חציוני ${fmtShekel(r.price, "he")}<br/>${fmtShekel(r.ppsqm, "he")} למ״ר<br/>${fmtInt(r.n)} מכירות`,
        );
      },
    },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: rooms.map((r) => tr(`${r.r} rooms`, `\u2066${r.r}\u2069 חד׳`)), ...axisStyle(t), splitLine: { show: false } },
    yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => fmtShekelAxis(v, lang) } },
    series: [{
      type: "bar", data: rooms.map((r) => r.price), barMaxWidth: 36, itemStyle: { color: t.series[0], borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: "top", color: t.ink2, fontSize: 12, formatter: (p) => fmtShekelAxis(p.value as number, lang) },
    }],
  }), [rooms, lang, tr]);

  const histChart = useCallback((t: Tokens): EChartsOption => {
    const w = hist.length > 1 ? hist[1].b - hist[0].b : 100000;
    return {
      ...base(t),
      tooltip: {
        ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.5 } },
        formatter: (ps) => {
          const h = hist[(ps as { dataIndex: number }[])[0].dataIndex];
          return `${fmtShekelShort(h.b, lang)} – ${fmtShekelShort(h.b + w, lang)}<br/><b>${fmtInt(h.n)}</b> ${tr("sales", "מכירות")}`;
        },
      },
      xAxis: { type: "category", data: hist.map((h) => fmtShekelAxis(h.b, lang)), ...axisStyle(t), splitLine: { show: false } },
      yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 12 } },
      series: [{ type: "bar", data: hist.map((h) => h.n), barCategoryGap: "8%", itemStyle: { color: t.series[0], borderRadius: [2, 2, 0, 0] } }],
    };
  }, [hist, lang, tr]);

  return (
    <>
      <div className="grid-2 section">
        <section className="panel">
          <h3>{tr("Median home price by year", "מחיר דירה חציוני לפי שנה")}</h3>
          <EChart className="chart" build={priceChart} label={tr(`Median home price in ${name} by year`, `מחיר דירה חציוני ב${name} לפי שנה`)} />
        </section>
        <section className="panel">
          <h3>{tr("Median price per m² by year", "מחיר חציוני למ״ר לפי שנה")}</h3>
          <EChart className="chart" build={ppsqmChart} label={tr(`Median price per square metre in ${name} by year`, `מחיר חציוני למ״ר ב${name} לפי שנה`)} />
        </section>
      </div>
      <div className="grid-3" style={{ marginTop: 20 }}>
        <section className="panel">
          <h3>{tr("Deals per year", "עסקאות בשנה")}</h3>
          <p className="chart-note" style={{ marginTop: 0 }}>{tr(`All deal types. ${lastYear} is partial.`, `כל סוגי העסקאות. ${lastYear} חלקית.`)}</p>
          <EChart className="chart short" build={countChart} label={tr(`Deals per year in ${name}`, `עסקאות בשנה ב${name}`)} />
        </section>
        <section className="panel">
          <h3>{tr("Price by rooms", "מחיר לפי מספר חדרים")}</h3>
          <p className="chart-note" style={{ marginTop: 0 }}>{tr("Median, last 24 months.", "חציון, 24 החודשים האחרונים.")}</p>
          {rooms.length ? <EChart className="chart short" build={roomsChart} label={tr("Median price by number of rooms", "מחיר חציוני לפי מספר חדרים")} /> : <div className="empty">{tr("Not enough sales.", "אין מספיק מכירות.")}</div>}
        </section>
        <section className="panel">
          <h3>{tr("Price distribution", "התפלגות מחירים")}</h3>
          <p className="chart-note" style={{ marginTop: 0 }}>{tr("Home sales, last 24 months.", "מכירות דירות, 24 החודשים האחרונים.")}</p>
          {hist.length ? <EChart className="chart short" build={histChart} label={tr("Distribution of home prices", "התפלגות מחירי הדירות")} /> : <div className="empty">{tr("Not enough sales.", "אין מספיק מכירות.")}</div>}
        </section>
      </div>
    </>
  );
}
