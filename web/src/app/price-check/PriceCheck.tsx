"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { useUrlState } from "@/lib/useUrlState";
import { useJson } from "@/lib/useJson";
import { useLocalities } from "@/lib/useLocalities";
import { CityPicker } from "@/components/CityPicker";
import { EChart, axisStyle, base, type Tokens } from "@/components/EChart";
import { cityName, fmtDate, fmtInt, fmtQuarter, fmtShekel, fmtShekelAxis, fmtShekelShort } from "@/lib/format";
import { useLang } from "@/components/LangProvider";

type Resp = {
  summary: { n: number; ppsqm_q: number[] | null; price_q: number[] | null };
  comps: { id: string; date: string; street: string | null; house: string | null; rooms: number | null; area: number; price: number; ppsqm: number; adj: number; year_built: number | null; lat: number; lon: number }[];
  hist: { b: number; n: number }[];
  street: { n: number; ppsqm: number | null } | null;
  /** Local price level: current quarter, where the trend comes from, and its change over the period. */
  index: { current_q: string; source: "locality" | "district" | "country"; change: number | null } | null;
  /** CBS average rent for this rooms group, big cities only. */
  rent: { rooms: string; rent: number; rent_q: string } | null;
  months: number;
};

const DEFAULTS = { loc: "", street: "", rooms: "4", area: "", months: "24", ask: "" };
const QS = [0.1, 0.25, 0.5, 0.75, 0.9];

/** Approximate percentile of v given quantiles at QS (linear between, clamped to 5–95). */
function percentile(v: number, q: number[]) {
  if (v <= q[0]) return 5;
  if (v >= q[4]) return 95;
  for (let i = 0; i < 4; i++) if (v <= q[i + 1]) return Math.round((QS[i] + ((v - q[i]) / (q[i + 1] - q[i])) * (QS[i + 1] - QS[i])) * 100);
  return 50;
}

export function PriceCheck() {
  const [s, set] = useUrlState(DEFAULTS);
  const { lang, t: tr } = useLang();
  const locs = useLocalities();
  const city = locs.find((l) => String(l.code) === s.loc);
  const [streets, setStreets] = useState<{ street: string; n: number }[]>([]);
  // Text fields are edited locally and committed to the URL on submit; re-sync when the URL changes.
  const committed = { area: s.area, ask: s.ask, street: s.street };
  const [draftState, setDraftState] = useState({ base: committed, value: committed });
  const draft = draftState.base.area === s.area && draftState.base.ask === s.ask && draftState.base.street === s.street ? draftState.value : committed;
  const setDraft = (value: typeof committed) => setDraftState({ base: committed, value });

  useEffect(() => {
    if (!s.loc) return;
    fetch(`/api/streets?loc=${s.loc}`).then((r) => r.json()).then(setStreets);
  }, [s.loc]);

  const ready = s.loc && Number(s.area) > 0;
  const url = ready ? `/api/estimate?loc=${s.loc}&rooms=${s.rooms}&area=${s.area}&months=${s.months}&street=${encodeURIComponent(s.street)}` : null;
  const { data, loading, error } = useJson<Resp>(url);
  const area = Number(s.area);
  const ask = Number(s.ask) || null;
  const q = data?.summary.ppsqm_q;
  const askPpsqm = ask && area ? ask / area : null;

  const submit = (e: React.FormEvent) => { e.preventDefault(); set({ area: draft.area, ask: draft.ask, street: draft.street }); };

  const histBuild = useCallback((t: Tokens): EChartsOption => {
    const hist = data?.hist ?? [];
    const marks: object[] = [];
    if (q) marks.push({ xAxis: fmtShekelAxis(Math.floor(q[2] / 2000) * 2000, lang), name: "Median", lineStyle: { color: t.ink2, width: 1.5, type: "solid" }, label: { show: false } });
    if (askPpsqm) marks.push({ xAxis: fmtShekelAxis(Math.floor(askPpsqm / 2000) * 2000, lang), name: "Asking", lineStyle: { color: t.series[1], width: 2, type: "solid" }, label: { show: false } });
    return {
      ...base(t),
      grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
      tooltip: {
        ...(base(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.5 } },
        formatter: (ps) => {
          const h = hist[(ps as { dataIndex: number }[])[0].dataIndex];
          return tr(
            `${fmtShekel(h.b)} – ${fmtShekel(h.b + 2000)} per m²<br/><b>${h.n}</b> sales`,
            `${fmtShekel(h.b, "he")} – ${fmtShekel(h.b + 2000, "he")} למ״ר<br/><b>${h.n}</b> מכירות`,
          );
        },
      },
      xAxis: { type: "category", data: hist.map((h) => fmtShekelAxis(h.b, lang)), ...axisStyle(t), splitLine: { show: false } },
      yAxis: { type: "value", ...axisStyle(t), minInterval: 1 },
      series: [{
        type: "bar", data: hist.map((h) => h.n), barCategoryGap: "8%", itemStyle: { color: t.series[0], borderRadius: [2, 2, 0, 0] },
        markLine: { symbol: "none", silent: true, data: marks as never },
      }],
    };
  }, [data, q, askPpsqm, lang, tr]);

  const verdict = useMemo(() => {
    if (!askPpsqm || !q) return null;
    const pct = percentile(askPpsqm, q);
    const tone = pct >= 75 ? tr("on the high side", "גבוה יחסית") : pct <= 25 ? tr("on the low side", "נמוך יחסית") : tr("within the typical range", "נמצא בטווח המקובל");
    const diff = askPpsqm / q[2] - 1;
    return { pct, tone, diff };
  }, [askPpsqm, q, tr]);
  const S = (v: number | null) => <bdi>{fmtShekel(v, lang)}</bdi>;
  const Y = (v: number) => <bdi className="num">{(v * 100).toFixed(1)}%</bdi>;
  const P = (v: number) => <bdi className="num">{Math.abs(Math.round(v * 100))}%</bdi>;
  const idx = data?.index;
  const quarter = idx ? tr(`Q${Math.floor(Number(idx.current_q.slice(5, 7)) / 3) + 1} ${idx.current_q.slice(0, 4)}`, `רבעון ${Math.floor(Number(idx.current_q.slice(5, 7)) / 3) + 1} ${idx.current_q.slice(0, 4)}`) : "";
  const trendOf = idx?.source === "locality" ? cityName(city, lang) : idx?.source === "district" ? tr("the sub-district", "הנפה") : tr("the whole country", "כל הארץ");
  const roomsLabel = s.rooms === "6" ? "\u20666+\u2069" : s.rooms;
  const range = (a: number, b: number) =>
    lang === "he" && a >= 1e6 && b >= 1e6
      ? <><span dir="ltr" className="ltr">{(a / 1e6).toFixed(2)}–{(b / 1e6).toFixed(2)}</span><span className="muted"> מיליון ₪</span></>
      : <>{fmtShekelShort(a, lang)}<span className="muted">{tr(" to ", " עד ")}</span>{fmtShekelShort(b, lang)}</>;

  return (
    <div className="grid-pc">
      <form className="panel" onSubmit={submit} style={{ alignSelf: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <span className="flabel">{tr("City", "יישוב")}</span>
            {city ? (
              <div className="tag" style={{ height: 36, borderRadius: 6, justifyContent: "space-between" }}>
                {cityName(city, lang)}
                <button type="button" aria-label={tr("Change city", "החלפת יישוב")} onClick={() => set({ loc: "", street: "" })}>×</button>
              </div>
            ) : (
              <CityPicker onPick={(l) => set({ loc: String(l.code), street: "" })} />
            )}
          </div>
          <div className="field">
            <label htmlFor="street">{tr("Street (optional)", "רחוב (לא חובה)")}</label>
            <input id="street" className="input he" list="streets" dir="auto" placeholder={s.loc ? tr("Start typing a street", "התחילו להקליד רחוב") : tr("Choose a city first", "קודם בוחרים יישוב")} disabled={!s.loc}
              value={draft.street} onChange={(e) => setDraft({ ...draft, street: e.target.value })} />
            <datalist id="streets">{streets.map((x) => <option key={x.street} value={x.street} />)}</datalist>
          </div>
          <div className="field">
            <span className="flabel">{tr("Rooms", "חדרים")}</span>
            <div className="seg" role="group" aria-label={tr("Rooms", "חדרים")}>
              {["2", "3", "4", "5", "6"].map((r) => <button type="button" key={r} aria-pressed={s.rooms === r} onClick={() => set({ rooms: r })}>{r === "6" ? "\u20666+\u2069" : r}</button>)}
            </div>
          </div>
          <div className="field">
            <label htmlFor="area">{tr("Size in m²", "שטח במ״ר")}</label>
            <input id="area" className="input" type="number" min={15} max={600} placeholder={tr("e.g. 95", "לדוגמה 95")} required value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ask">{tr("Asking price in ₪ (optional)", "מחיר מבוקש ב-₪ (לא חובה)")}</label>
            <input id="ask" className="input" type="number" min={0} step={1000} placeholder={tr("e.g. 2450000", "לדוגמה 2450000")} value={draft.ask} onChange={(e) => setDraft({ ...draft, ask: e.target.value })} />
          </div>
          <div className="field">
            <span className="flabel">{tr("Sales from the last", "מכירות מהתקופה האחרונה")}</span>
            <div className="seg" role="group" aria-label={tr("Period", "תקופה")}>
              {[["12", tr("12 mo", "שנה")], ["24", tr("2 yrs", "שנתיים")], ["36", tr("3 yrs", "3 שנים")]].map(([v, l]) => <button type="button" key={v} aria-pressed={s.months === v} onClick={() => set({ months: v })}>{l}</button>)}
            </div>
          </div>
          <button className="btn primary" type="submit" disabled={!s.loc}>{tr("Find comparable sales", "חיפוש עסקאות דומות")}</button>
        </div>
      </form>

      <div>
        {!ready && (
          <div className="panel empty">
            <p style={{ margin: 0 }}>{tr("Choose a city and enter the size to see comparable sales.", "בוחרים יישוב ומזינים שטח כדי לראות עסקאות דומות.")}</p>
          </div>
        )}
        {loading && <div className="loading-bar" />}
        {error && <div className="panel empty">{error}</div>}
        {ready && data && data.summary.n < 5 && (
          <div className="panel empty">
            {tr(
              `Only ${data.summary.n} comparable sales found. Try a longer period or a different room count.`,
              `נמצאו רק ${data.summary.n} עסקאות דומות. אפשר לנסות תקופה ארוכה יותר או מספר חדרים אחר.`,
            )}
          </div>
        )}
        {ready && data && q && data.summary.n >= 5 && (
          <>
            <section className="panel">
              <p className="ink2" style={{ margin: "0 0 6px" }}>
                {tr(
                  `A ${roomsLabel}-room home of ${area} m² in ${cityName(city, lang)} typically sells for`,
                  `דירת ${roomsLabel} חדרים בשטח ${area} מ״ר ב${cityName(city, lang)} נמכרת בדרך כלל ב-`,
                )}
              </p>
              <div className="pc-range num">
                {range(q[1] * area, q[3] * area)}
              </div>
              <p className="ink2" style={{ margin: "6px 0 0" }}>
                {tr(
                  <>Median <strong className="num">{S(q[2] * area)}</strong>, at {S(q[2])} per m². Based on {fmtInt(data.summary.n)} comparable sales in the last {data.months} months; the range is the middle half of them.</>,
                  <>חציון <strong className="num">{S(q[2] * area)}</strong>, לפי {S(q[2])} למ״ר. על סמך {fmtInt(data.summary.n)} עסקאות דומות ב-{data.months} החודשים האחרונים; הטווח הוא המחצית האמצעית שלהן.</>,
                )}
              </p>
              {idx && (
                <p className="chart-note">
                  {tr(
                    <>Older sales are adjusted to {quarter} prices using the price trend of {trendOf}{idx.change != null && (Math.abs(idx.change) < 0.005 ? <>, which was flat over the period</> : <>, where prices {idx.change > 0 ? "rose" : "fell"} {P(idx.change)} over the period</>)}.</>,
                    <>עסקאות ישנות מותאמות למחירי {quarter} לפי מגמת המחירים של {trendOf}{idx.change != null && (Math.abs(idx.change) < 0.005 ? <>, שהייתה יציבה בתקופה</> : <>, שבה המחירים {idx.change > 0 ? "עלו" : "ירדו"} ב-{P(idx.change)} בתקופה</>)}.</>,
                  )}
                </p>
              )}
              {verdict && ask && (
                <p className="pc-verdict">
                  {tr(
                    <>The asking price of <strong className="num">{S(ask)}</strong> ({S(askPpsqm)} per m²) is {verdict.tone}: {Math.abs(verdict.diff) < 0.03 ? <>about the median</> : <><strong>{P(verdict.diff)}</strong> {verdict.diff > 0 ? "above" : "below"} the median</>} of comparable sales at today&rsquo;s prices, and higher per m² than about <strong>{verdict.pct}%</strong> of them.</>,
                    <>המחיר המבוקש, <strong className="num">{S(ask)}</strong> ({S(askPpsqm)} למ״ר), {verdict.tone}: {Math.abs(verdict.diff) < 0.03 ? <>בערך כמו החציון</> : <><strong>{P(verdict.diff)}</strong> {verdict.diff > 0 ? "מעל החציון" : "מתחת לחציון"}</>} של העסקאות הדומות במחירי היום, וגבוה למ״ר מכ-<strong>{verdict.pct}%</strong> מהן.</>,
                  )}
                </p>
              )}
              {data.rent && (
                <p className="chart-note">
                  {tr(
                    <>For rent: {data.rent.rooms.replace("-", "–")}-room homes in {cityName(city, lang)} rented for {S(data.rent.rent)} a month on average in {fmtQuarter(data.rent.rent_q, lang)} (Central Bureau of Statistics). A year of that is a gross yield of <strong>{Y(12 * data.rent.rent / (ask ?? q[2] * area))}</strong> {ask ? "at the asking price" : "at the median price"}{ask && <>, {Y(12 * data.rent.rent / (q[2] * area))} at the median</>}.</>,
                    <>להשכרה: דירות של <bdi>{data.rent.rooms.replace("-", "–")}</bdi> חדרים ב{cityName(city, lang)} הושכרו ב{fmtQuarter(data.rent.rent_q, lang)} בממוצע ב-{S(data.rent.rent)} לחודש (הלשכה המרכזית לסטטיסטיקה). שנה של שכירות כזו היא תשואה ברוטו של <strong>{Y(12 * data.rent.rent / (ask ?? q[2] * area))}</strong> {ask ? "לפי המחיר המבוקש" : "לפי המחיר החציוני"}{ask && <>, ו-{Y(12 * data.rent.rent / (q[2] * area))} לפי החציון</>}.</>,
                  )}
                </p>
              )}
              {data.street && s.street && (
                <p className="chart-note">
                  {data.street.n > 0
                    ? tr(
                        <>On <bdi className="he">{s.street}</bdi>: {data.street.n} comparable {data.street.n === 1 ? "sale" : "sales"}, median {S(data.street.ppsqm)} per m².</>,
                        <>ברחוב {s.street}: {data.street.n} עסקאות דומות, חציון {S(data.street.ppsqm)} למ״ר.</>,
                      )
                    : tr(
                        <>No comparable sales on <bdi className="he">{s.street}</bdi> in this period; showing the whole city.</>,
                        <>אין עסקאות דומות ברחוב {s.street} בתקופה הזו; מוצגות עסקאות מכל היישוב.</>,
                      )}
                </p>
              )}
            </section>
            <section className="panel" style={{ marginTop: 20 }}>
              <div className="section-head" style={{ marginBottom: 4 }}>
                <h3>{tr("Price per m² of comparable sales, at today’s prices", "מחיר למ״ר בעסקאות הדומות, במחירי היום")}</h3>
                <div className="legend">
                  <span><i style={{ background: "var(--ink-2)", width: 2, height: 14 }} />{tr("Median", "חציון")}</span>
                  {askPpsqm && <span><i style={{ background: "var(--s2)", width: 2, height: 14 }} />{tr("Asking price", "מחיר מבוקש")}</span>}
                </div>
              </div>
              <EChart className="chart short" build={histBuild} label={tr("Distribution of price per square metre among comparable sales", "התפלגות המחיר למ״ר בעסקאות הדומות")} />
            </section>
            <section style={{ marginTop: 20 }}>
              <div className="section-head">
                <h2>{tr("Closest matches", "העסקאות הדומות ביותר")}</h2>
                <p>{s.street ? tr("Same street first, then closeness in size and rooms.", "קודם באותו רחוב, ואחר כך לפי קרבה בשטח ובמספר החדרים.") : tr("Ordered by closeness in size and rooms.", "לפי קרבה בשטח ובמספר החדרים.")}</p>
              </div>
              <div className="panel flush">
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr>
                      <th>{tr("Date", "תאריך")}</th><th>{tr("Address", "כתובת")}</th><th className="r">{tr("Rooms", "חדרים")}</th><th className="r">{tr("m²", "מ״ר")}</th>
                      <th className="r">{tr("Built", "שנת בנייה")}</th><th className="r">{tr("Price", "מחיר")}</th><th className="r">{tr("₪ / m²", "₪ למ״ר")}</th>
                      <th className="r" title={tr("Price per m² adjusted to today’s market level", "מחיר למ״ר מותאם לרמת המחירים היום")}>{tr("Today, ₪ / m²", "היום, ₪ למ״ר")}</th>
                      <th><span className="visually-hidden">{tr("Map", "מפה")}</span></th>
                    </tr></thead>
                    <tbody>
                      {data.comps.map((c) => (
                        <tr key={c.id}>
                          <td className="num" style={{ whiteSpace: "nowrap" }}>{fmtDate(c.date, lang)}</td>
                          <td>{c.street ? <span className="he" lang="he" dir="auto">{c.street}{c.house ? ` ${c.house}` : ""}</span> : <span className="muted">{tr("No address", "אין כתובת")}</span>}</td>
                          <td className="r">{c.rooms ?? "–"}</td>
                          <td className="r">{c.area}</td>
                          <td className="r">{c.year_built ?? "–"}</td>
                          <td className="r">{S(c.price)}</td>
                          <td className="r">{S(c.ppsqm)}</td>
                          <td className="r">{S(Math.round(c.adj))}</td>
                          <td><Link className="btn ghost" style={{ height: 28, padding: "0 8px" }} href={`/map?lat=${c.lat}&lon=${c.lon}&z=17&from=1998`} aria-label={tr("Show on map", "הצגה במפה")}>{tr("Map", "מפה")}</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
