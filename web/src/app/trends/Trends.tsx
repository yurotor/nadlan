"use client";
import { useCallback, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { useUrlState } from "@/lib/useUrlState";
import { useJson } from "@/lib/useJson";
import { useLocalities } from "@/lib/useLocalities";
import { ROOM_PRESETS, YEARS, toApiParams } from "@/lib/rooms";
import { CityTags } from "@/components/CityTags";
import { EChart, axisStyle, base, timeLabel, type Tokens } from "@/components/EChart";
import { useLang } from "@/components/LangProvider";
import type { Lang } from "@/lib/i18n";
import { cityName, fmtInt, fmtMonth, fmtShekel, fmtShekelAxis, fmtPct } from "@/lib/format";

type Point = { t: string; n: number; price: number | null; ppsqm: number | null; new_share: number | null };
type Resp = { grain: string; series: { loc: number | null; points: Point[] }[]; lastDate: string };

const DEFAULTS = { loc: "", measure: "price", scale: "values", grain: "quarter", type: "", rooms: "", from: "2005", to: "2026", kind: "homes" };
const MEASURES: [string, string, string][] = [["price", "Median price", "מחיר חציוני"], ["ppsqm", "Price per m²", "מחיר למ״ר"], ["n", "Number of deals", "מספר עסקאות"]];
const SERIES_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5"];

export function Trends() {
  const [s, set] = useUrlState(DEFAULTS);
  const locs = useLocalities();
  const byCode = useMemo(() => new Map(locs.map((l) => [l.code, l])), [locs]);
  const [showTable, setShowTable] = useState(false);
  const { lang, t: tr } = useLang();

  const isCount = s.measure === "n";
  const api = useMemo(() => {
    const p = toApiParams({ loc: s.loc, grain: s.grain, type: s.type, rooms: s.rooms, from: s.from, to: s.to, kind: isCount ? s.kind : "homes" });
    return `/api/trends?${p}`;
  }, [s, isCount]);
  const { data, loading } = useJson<Resp>(api);

  const name = useCallback(
    (loc: number | null) => (loc == null ? tr("All of Israel", "כל הארץ") : cityName(byCode.get(loc), lang) || String(loc)),
    [byCode, lang, tr],
  );
  const indexed = s.scale === "index" && !isCount;
  const measureKey = s.measure as "price" | "ppsqm" | "n";

  // Periods after this date are still being filled in by late reports.
  const partialFrom = useMemo(() => {
    if (!data) return null;
    const d = new Date(data.lastDate);
    d.setUTCMonth(d.getUTCMonth() - 4);
    return d.toISOString().slice(0, 10);
  }, [data]);

  const valueOf = useCallback((p: Point) => (p[measureKey] as number | null), [measureKey]);
  const fmtVal = useCallback((v: number | null) => {
    if (v == null) return "–";
    if (indexed) return v.toFixed(0);
    return isCount ? fmtInt(v) : fmtShekel(v, lang);
  }, [indexed, isCount, lang]);

  const seriesData = useMemo(() => {
    if (!data) return [];
    return data.series.map((ser) => {
      const firstVal = ser.points.map(valueOf).find((v) => v != null) ?? null;
      return {
        loc: ser.loc,
        name: name(ser.loc),
        pts: ser.points.map((p) => {
          const v = valueOf(p);
          return [p.t, v == null ? null : indexed && firstVal ? (v / firstVal) * 100 : v] as [string, number | null];
        }),
        raw: ser.points,
      };
    });
  }, [data, valueOf, indexed, name]);

  const buildMain = useCallback((t: Tokens): EChartsOption => {
    const color = (i: number) => (seriesData.length === 1 ? t.series[0] : t.series[i % t.series.length]);
    return {
      ...base(t),
      grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
      tooltip: {
        ...(base(t).tooltip as object),
        formatter: (ps) => {
          const arr = ps as unknown as { seriesName: string; value: [string, number | null]; color: string }[];
          if (!arr.length) return "";
          const rows = arr.map((p) => `<div style="display:flex;justify-content:space-between;gap:16px"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-inline-end:6px"></span>${p.seriesName}</span><b>${fmtVal(p.value[1])}</b></div>`).join("");
          return `<div style="margin-bottom:4px;color:${t.muted}">${periodLabel(arr[0].value[0], s.grain, lang)}</div>${rows}`;
        },
      },
      xAxis: { type: "time", ...axisStyle(t), splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 12, formatter: timeLabel(lang) } },
      yAxis: {
        type: "value", ...axisStyle(t), scale: indexed,
        axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => (indexed ? String(v) : isCount ? fmtInt(v) : fmtShekelAxis(v, lang)) },
      },
      series: seriesData.map((ser, i) => ({
        type: "line",
        name: ser.name,
        data: ser.pts,
        showSymbol: false,
        symbolSize: 8,
        connectNulls: false,
        lineStyle: { width: 2, color: color(i) },
        itemStyle: { color: color(i) },
        emphasis: { focus: "series" },
        markArea: i === 0 && partialFrom ? {
          silent: true,
          itemStyle: { color: t.grid, opacity: 0.6 },
          label: { show: true, position: "insideTop", color: t.muted, fontSize: 11, formatter: tr("Still\nreporting", "עדיין\nמדווח") },
          data: [[{ xAxis: partialFrom }, { xAxis: data!.lastDate }]],
        } : undefined,
      })),
    };
  }, [seriesData, indexed, isCount, fmtVal, partialFrom, data, s.grain, lang, tr]);

  const buildCount = useCallback((t: Tokens): EChartsOption => ({
    ...base(t),
    tooltip: { ...(base(t).tooltip as object), valueFormatter: (v) => fmtInt(v as number) },
    xAxis: { type: "time", ...axisStyle(t), splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 12, formatter: timeLabel(lang) } },
    yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => fmtInt(v) } },
    series: seriesData.map((ser, i) => seriesData.length === 1 ? {
      type: "bar", name: ser.name, data: ser.raw.map((p) => [p.t, p.n]), barMaxWidth: 14,
      itemStyle: { color: t.series[0], borderRadius: [3, 3, 0, 0] },
    } : {
      type: "line", name: ser.name, data: ser.raw.map((p) => [p.t, p.n]), showSymbol: false,
      lineStyle: { width: 2, color: t.series[i] }, itemStyle: { color: t.series[i] },
    }),
  }), [seriesData, lang]);

  const buildNew = useCallback((t: Tokens): EChartsOption => ({
    ...base(t),
    tooltip: { ...(base(t).tooltip as object), valueFormatter: (v) => (v == null ? "–" : `${Math.round((v as number) * 100)}%`) },
    xAxis: { type: "time", ...axisStyle(t), splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 12, formatter: timeLabel(lang) } },
    yAxis: { type: "value", ...axisStyle(t), min: 0, axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => `${Math.round(v * 100)}%` } },
    series: seriesData.map((ser, i) => ({
      type: "line", name: ser.name, data: ser.raw.map((p) => [p.t, p.new_share]), showSymbol: false,
      lineStyle: { width: 2, color: t.series[seriesData.length === 1 ? 0 : i] }, itemStyle: { color: t.series[seriesData.length === 1 ? 0 : i] },
    })),
  }), [seriesData, lang]);

  // Headline change: first vs last complete period of the first series.
  const headline = useMemo(() => {
    const ser = seriesData[0];
    if (!ser || !partialFrom) return null;
    const complete = ser.raw.filter((p) => p.t < partialFrom && valueOf(p) != null);
    if (complete.length < 2) return null;
    const a = complete[0], b = complete[complete.length - 1];
    return { a, b, change: (valueOf(b)! - valueOf(a)!) / valueOf(a)! };
  }, [seriesData, partialFrom, valueOf]);

  const fmtRaw = (v: number | null) => (isCount ? fmtInt(v) : fmtShekel(v, lang));
  const colorVars = SERIES_VARS.map((v) => `var(${v})`);
  const measure = MEASURES.find(([m]) => m === s.measure);
  const measureLabel = measure ? tr(measure[1], measure[2]) : "";

  return (
    <>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="controls">
          <div className="field" style={{ flexBasis: "100%" }}>
            <span className="flabel">{tr("Compare cities (leave empty for all of Israel)", "השוואת ערים (ריק = כל הארץ)")}</span>
            <CityTags value={s.loc} onChange={(v) => set({ loc: v })} max={5} colors={colorVars} placeholder={tr("Add a city to compare…", "הוספת עיר להשוואה…")} />
          </div>
          <div className="field">
            <span className="flabel">{tr("Measure", "מדד")}</span>
            <div className="seg" role="group" aria-label={tr("Measure", "מדד")}>
              {MEASURES.map(([v, en, he]) => <button key={v} aria-pressed={s.measure === v} onClick={() => set({ measure: v })}>{tr(en, he)}</button>)}
            </div>
          </div>
          {!isCount ? (
            <div className="field">
              <span className="flabel">{tr("Show as", "הצגה")}</span>
              <div className="seg" role="group" aria-label={tr("Show as", "הצגה")}>
                {[["values", tr("Shekels", "שקלים")], ["index", tr("Index, start = 100", "מדד, התחלה = 100")]].map(([v, l]) => <button key={v} aria-pressed={s.scale === v} onClick={() => set({ scale: v })}>{l}</button>)}
              </div>
            </div>
          ) : (
            <div className="field">
              <span className="flabel">{tr("Deals counted", "עסקאות שנספרות")}</span>
              <div className="seg" role="group" aria-label={tr("Deals counted", "עסקאות שנספרות")}>
                {[["homes", tr("Home sales", "מכירות דירות")], ["residential", tr("All residential", "כל המגורים")], ["all", tr("Everything", "הכל")]].map(([v, l]) => <button key={v} aria-pressed={s.kind === v} onClick={() => set({ kind: v })}>{l}</button>)}
              </div>
            </div>
          )}
          <div className="field">
            <span className="flabel">{tr("Interval", "תדירות")}</span>
            <div className="seg" role="group" aria-label={tr("Interval", "תדירות")}>
              {[["month", tr("Month", "חודש")], ["quarter", tr("Quarter", "רבעון")], ["year", tr("Year", "שנה")]].map(([v, l]) => <button key={v} aria-pressed={s.grain === v} onClick={() => set({ grain: v })}>{l}</button>)}
            </div>
          </div>
          <div className="field">
            <span className="flabel">{tr("Property", "סוג נכס")}</span>
            <div className="seg" role="group" aria-label={tr("Property", "סוג נכס")}>
              {[["", tr("Any", "הכל")], ["apartment", tr("Apartments", "דירות")], ["house", tr("Houses", "בתים")]].map(([v, l]) => <button key={v} aria-pressed={s.type === v} onClick={() => set({ type: v })}>{l}</button>)}
            </div>
          </div>
          <div className="field">
            <span className="flabel">{tr("Rooms", "חדרים")}</span>
            <div className="seg" role="group" aria-label={tr("Rooms", "חדרים")}>
              {ROOM_PRESETS.map((r) => <button key={r.value} aria-pressed={s.rooms === r.value} onClick={() => set({ rooms: r.value })}>{tr(r.label, r.labelHe ?? r.label)}</button>)}
            </div>
          </div>
          <div className="field">
            <span className="flabel">{tr("Years", "שנים")}</span>
            <div className="range">
              <select className="select" aria-label={tr("From year", "משנה")} value={s.from} onChange={(e) => set({ from: e.target.value })}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>
              {tr("to", "עד")}
              <select className="select" aria-label={tr("To year", "עד שנה")} value={s.to} onChange={(e) => set({ to: e.target.value })}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>
            </div>
          </div>
        </div>
      </div>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>{indexed ? tr(`${measureLabel}, indexed`, `${measureLabel}, כמדד`) : measureLabel}</h2>
            {headline && (
              <p>
                {seriesData[0].name}: <bdi>{fmtRaw(valueOf(headline.a))}</bdi> {tr("in", "ב-")}{periodLabel(headline.a.t, s.grain, lang)},{" "}
                <bdi>{fmtRaw(valueOf(headline.b))}</bdi> {tr("in", "ב-")}{periodLabel(headline.b.t, s.grain, lang)}{" "}
                (<bdi><strong className="num">{fmtPct(headline.change)}</strong></bdi>).
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {seriesData.length > 1 && (
              <div className="legend">
                {seriesData.map((ser, i) => <span key={String(ser.loc)}><i style={{ background: colorVars[i] }} />{ser.name}</span>)}
              </div>
            )}
            <button className="btn ghost" onClick={() => setShowTable((x) => !x)} aria-pressed={showTable}>{showTable ? tr("Show chart", "הצגת גרף") : tr("Show table", "הצגת טבלה")}</button>
          </div>
        </div>
        {loading && <div className="loading-bar" />}
        {showTable ? (
          <TrendTable series={seriesData} fmt={fmtVal} grain={s.grain} lang={lang} />
        ) : (
          <EChart className="chart tall" build={buildMain} label={tr(`${measureLabel} over time`, `${measureLabel} לאורך זמן`)} />
        )}
        <p className="chart-note">
          {isCount ? "" : tr("Medians over clean single-home sales (sold in full, with a plausible price per m²). ", "חציונים של מכירות דירה בודדת תקינות (נמכרה במלואה, במחיר סביר למ״ר). ")}
          {tr("The shaded band marks recent months that are still being reported; late reports keep arriving for several months.", "הרצועה המוצללת מסמנת חודשים אחרונים שעדיין מדווחים; דיווחים מאוחרים ממשיכים להגיע במשך כמה חודשים.")}
          {indexed && tr(" Each line starts at 100 in its first period, so cities with different price levels can be compared by growth.", " כל קו מתחיל ב-100 בתקופה הראשונה, כך שאפשר להשוות צמיחה בין ערים ברמות מחיר שונות.")}
        </p>
      </section>

      <div className="grid-2 section" style={{ marginTop: 20 }}>
        {!isCount && (
          <section className="panel">
            <h3>{tr("Number of deals", "מספר עסקאות")}</h3>
            <p className="chart-note" style={{ marginTop: 0 }}>{tr(`Home sales per ${s.grain}.`, `מכירות דירות ל${{ month: "חודש", quarter: "רבעון", year: "שנה" }[s.grain] ?? "רבעון"}.`)}</p>
            <EChart className="chart short" build={buildCount} label={tr("Number of deals over time", "מספר עסקאות לאורך זמן")} />
          </section>
        )}
        <section className="panel">
          <h3>{tr("New-build share", "שיעור הדירות החדשות")}</h3>
          <p className="chart-note" style={{ marginTop: 0 }}>{tr("Share of sales where the building was finished in the sale year or the year before, or is still under construction.", "שיעור המכירות שבהן הבניין הושלם בשנת המכירה או בשנה שלפניה, או שהוא עדיין בבנייה.")}</p>
          <EChart className="chart short" build={buildNew} label={tr("Share of new-build sales over time", "שיעור מכירות הדירות החדשות לאורך זמן")} />
        </section>
      </div>
    </>
  );
}

function periodLabel(t: string, grain: string, lang: Lang) {
  const d = new Date(t);
  if (grain === "year") return String(d.getUTCFullYear());
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  if (grain === "quarter") return lang === "he" ? `רבעון ${q} ${d.getUTCFullYear()}` : `Q${q} ${d.getUTCFullYear()}`;
  return fmtMonth(t, lang);
}

function TrendTable({ series, fmt, grain, lang }: { series: { name: string; pts: [string, number | null][]; raw: Point[] }[]; fmt: (v: number | null) => string; grain: string; lang: Lang }) {
  const periods = [...new Set(series.flatMap((s) => s.pts.map((p) => p[0])))].sort().reverse();
  const maps = series.map((s) => new Map(s.pts));
  const counts = series.map((s) => new Map(s.raw.map((p) => [p.t, p.n])));
  return (
    <div className="table-wrap" style={{ maxHeight: 400 }}>
      <table className="data">
        <thead>
          <tr>
            <th>{lang === "he" ? "תקופה" : "Period"}</th>
            {series.map((s) => <th key={s.name} className="r">{s.name}</th>)}
            {series.map((s) => <th key={s.name + "n"} className="r">{lang === "he" ? `עסקאות, ${s.name}` : `Deals, ${s.name}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p}>
              <td className="num">{periodLabel(p, grain, lang)}</td>
              {maps.map((m, i) => <td key={i} className="r">{fmt(m.get(p) ?? null)}</td>)}
              {counts.map((m, i) => <td key={i} className="r">{fmtInt(m.get(p) ?? null)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
