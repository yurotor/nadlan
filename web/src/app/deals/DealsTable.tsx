"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useUrlState } from "@/lib/useUrlState";
import { useJson } from "@/lib/useJson";
import { CityTags } from "@/components/CityTags";
import { NaturePicker } from "@/components/NaturePicker";
import { cityName, fmtDate, fmtInt, fmtShekel } from "@/lib/format";
import { classLabel, natureLabel } from "@/lib/natures";
import { useLang } from "@/components/LangProvider";

type Row = {
  id: string; date: string; loc: number; name_he: string | null; name_en: string | null; nature: string; cls: string; clean: boolean;
  price: number | null; declared: number | null; portion: number | null; area: number | null; rooms: number | null;
  year_built: number | null; ppsqm: number | null; street: string | null; house: string | null; address_source: string;
  exact_loc: boolean; lat: number | null; lon: number | null; gush: number; helka: number; sub_parcels: string;
};
type Resp = { rows: Row[]; total: number; med_price: number | null; med_ppsqm: number | null; page: number; size: number };

const DEFAULTS = {
  loc: "", nature: "", kind: "all", from: "", to: "", rmin: "", rmax: "", amin: "", amax: "",
  sort: "date", dir: "desc", page: "0",
};

const COLUMNS: { key: string; label: string; he: string; sort?: string; right?: boolean }[] = [
  { key: "date", label: "Date", he: "תאריך", sort: "date" },
  { key: "city", label: "City", he: "יישוב", sort: "city" },
  { key: "addr", label: "Address", he: "כתובת" },
  { key: "nature", label: "Property", he: "סוג נכס" },
  { key: "rooms", label: "Rooms", he: "חדרים", sort: "rooms", right: true },
  { key: "area", label: "Area m²", he: "שטח מ״ר", sort: "area", right: true },
  { key: "year_built", label: "Built", he: "שנת בנייה", sort: "year_built", right: true },
  { key: "price", label: "Price", he: "מחיר", sort: "price", right: true },
  { key: "ppsqm", label: "₪ / m²", he: "₪ למ״ר", sort: "ppsqm", right: true },
];

export function DealsTable() {
  const [s, set, apiQuery] = useUrlState(DEFAULTS);
  const { lang, t } = useLang();
  const { data, loading, error } = useJson<Resp>(`/api/deals?${apiQuery}`);
  const page = Number(s.page);
  const pages = data ? Math.ceil(data.total / data.size) : 0;
  const csvHref = useMemo(() => `/api/deals?${apiQuery}&format=csv`, [apiQuery]);
  const f = (patch: Partial<typeof DEFAULTS>) => set({ ...patch, page: "0" });
  const anyFilter = Object.entries(s).some(([k, v]) => !["sort", "dir", "page"].includes(k) && v !== DEFAULTS[k as keyof typeof DEFAULTS]);

  const sortBy = (col: string) => {
    if (s.sort === col) set({ dir: s.dir === "desc" ? "asc" : "desc", page: "0" });
    else set({ sort: col, dir: col === "city" ? "asc" : "desc", page: "0" });
  };

  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="controls">
          <div className="field">
            <span className="flabel">{t("Cities", "יישובים")}</span>
            <CityTags value={s.loc} onChange={(v) => f({ loc: v })} />
          </div>
          <div className="field">
            <span className="flabel">{t("Deal type", "סוג עסקה")}</span>
            <NaturePicker value={s.nature} onChange={(v) => f({ nature: v })} />
          </div>
          <div className="field">
            <label htmlFor="from">{t("Date range", "טווח תאריכים")}</label>
            <div className="range">
              <input id="from" className="input date" type="date" min="1998-01-01" value={s.from} onChange={(e) => f({ from: e.target.value })} />
              {t("to", "עד")}
              <input aria-label={t("To date", "עד תאריך")} className="input date" type="date" min="1998-01-01" value={s.to} onChange={(e) => f({ to: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="rmin">{t("Rooms", "חדרים")}</label>
            <div className="range">
              <input id="rmin" className="input sm" type="number" min={1} max={12} step={0.5} placeholder={t("Min", "מ-")} value={s.rmin} onChange={(e) => f({ rmin: e.target.value })} />
              –
              <input aria-label={t("Maximum rooms", "מספר חדרים מרבי")} className="input sm" type="number" min={1} max={12} step={0.5} placeholder={t("Max", "עד")} value={s.rmax} onChange={(e) => f({ rmax: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="amin">{t("Area m²", "שטח מ״ר")}</label>
            <div className="range">
              <input id="amin" className="input sm" type="number" min={0} placeholder={t("Min", "מ-")} value={s.amin} onChange={(e) => f({ amin: e.target.value })} />
              –
              <input aria-label={t("Maximum area", "שטח מרבי")} className="input sm" type="number" min={0} placeholder={t("Max", "עד")} value={s.amax} onChange={(e) => f({ amax: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <span className="flabel">{t("Price quality", "איכות המחיר")}</span>
            <div className="seg" role="group" aria-label={t("Price quality", "איכות המחיר")}>
              {[["all", t("All deals", "כל העסקאות")], ["homes", t("Clean home sales", "מכירות דירה תקינות")]].map(([v, l]) => (
                <button key={v} aria-pressed={s.kind === v} onClick={() => f({ kind: v })}>{l}</button>
              ))}
            </div>
          </div>
          {anyFilter && (
            <button className="btn ghost" onClick={() => set({ ...DEFAULTS })}>{t("Clear filters", "ניקוי מסננים")}</button>
          )}
        </div>
      </div>

      <div className="panel flush">
        <div className="pager" style={{ borderTop: 0, borderBottom: "1px solid var(--rule)" }}>
          <div>
            {data ? (
              <>
                <strong className="num" style={{ color: "var(--ink)" }}>{fmtInt(data.total)}</strong> {t("deals", "עסקאות")}
                {data.med_price != null && <>{t(" with a median price of ", ", מחיר חציוני ")}<strong className="num" style={{ color: "var(--ink)" }}><bdi>{fmtShekel(data.med_price, lang)}</bdi></strong></>}
                {data.med_ppsqm != null && <>{t(" and ", " ו-")}<bdi className="num">{fmtShekel(data.med_ppsqm, lang)}</bdi>{t("/m² for clean home sales", " למ״ר במכירות דירה תקינות")}</>}
              </>
            ) : t("Loading deals…", "טוען עסקאות…")}
          </div>
          <a className="btn" href={csvHref} download>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16" /></svg>
            {t("Download CSV", "הורדת CSV")}
          </a>
        </div>
        {loading && <div className="loading-bar" />}
        {error && <div className="empty">{error}</div>}
        <div className="table-wrap" style={{ opacity: loading ? 0.55 : 1, transition: "opacity .15s" }}>
          <table className="data">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={c.right ? "r" : undefined} aria-sort={c.sort && s.sort === c.sort ? (s.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sort ? (
                      <button onClick={() => sortBy(c.sort!)}>
                        {t(c.label, c.he)}
                        <SortIcon active={s.sort === c.sort} dir={s.dir} />
                      </button>
                    ) : t(c.label, c.he)}
                  </th>
                ))}
                <th><span className="visually-hidden">{t("Map", "מפה")}</span></th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.id}>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.date, lang)}</td>
                  <td>
                    {cityName(r, lang) || "–"}
                    {lang === "en" && r.name_en && <span className="sub he" lang="he" dir="auto">{r.name_he}</span>}
                  </td>
                  <td className="addr">
                    {r.street ? <span className="he" lang="he" dir="auto">{r.street}{r.house ? ` ${r.house}` : ""}</span> : <span className="muted">{t("No street address", "אין כתובת")}</span>}
                    <span className="sub">{t("Gush", "גוש")} {r.gush} / {r.helka}{r.sub_parcels && r.sub_parcels !== "0" ? ` / ${r.sub_parcels}` : ""}</span>
                  </td>
                  <td>
                    {natureLabel(r.nature, lang)}
                    {r.cls !== "single_unit" && <span className="sub">{classLabel(r.cls, lang)}{r.portion != null && r.portion < 1 ? `, ${Math.round(r.portion * 100)}%` : ""}</span>}
                  </td>
                  <td className="r">{r.rooms ?? "–"}</td>
                  <td className="r">{r.area ?? "–"}</td>
                  <td className="r">{r.year_built ?? "–"}</td>
                  <td className="r" style={{ fontWeight: 500 }}><bdi>{fmtShekel(r.price ?? r.declared, lang)}</bdi></td>
                  <td className="r"><bdi>{fmtShekel(r.ppsqm, lang)}</bdi></td>
                  <td>
                    {r.lat != null && (
                      <Link className="btn ghost" style={{ height: 28, padding: "0 8px" }} href={`/map?lat=${r.lat}&lon=${r.lon}&z=17&from=1998`} aria-label={t("Show on map", "הצגה במפה")} title={r.exact_loc ? t("Show on map", "הצגה במפה") : t("Show on map (approximate location)", "הצגה במפה (מיקום מקורב)")}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 1 1 13 0c0 5.3-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.rows.length === 0 && <div className="empty">{t("No deals match these filters. Try widening the date range or removing a filter.", "אין עסקאות שמתאימות למסננים. אפשר להרחיב את טווח התאריכים או להסיר מסנן.")}</div>}
        </div>
        {data && data.total > 0 && (
          <div className="pager">
            <span className="num">
              {fmtInt(page * data.size + 1)}–{fmtInt(Math.min((page + 1) * data.size, data.total))} {t("of", "מתוך")} {fmtInt(data.total)}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" disabled={page === 0} onClick={() => set({ page: String(page - 1) })}>{t("Previous", "הקודם")}</button>
              <button className="btn" disabled={page + 1 >= pages} onClick={() => set({ page: String(page + 1) })}>{t("Next", "הבא")}</button>
            </div>
          </div>
        )}
      </div>
      <p className="chart-note">
        {t(
          "Price is what the buyer paid. For a partial share the price is scaled up to the whole unit when the share is at least 10%. ₪/m² is shown only for clean single-home sales. CSV downloads include up to 100,000 rows.",
          "המחיר הוא הסכום ששילם הקונה. במכירת חלק מנכס המחיר מחושב לנכס השלם כשהחלק הוא 10% לפחות. מחיר למ״ר מוצג רק במכירות דירה בודדת תקינות. קובץ ה-CSV כולל עד 100,000 שורות.",
        )}
      </p>
    </>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ opacity: active ? 1 : 0.35 }}>
      {(!active || dir === "asc") && <path d="M2 4 5 1l3 3" fill="none" stroke="currentColor" strokeWidth="1.4" />}
      {(!active || dir === "desc") && <path d="M2 6l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" />}
    </svg>
  );
}
