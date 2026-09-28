"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CityRow } from "@/lib/queries";
import { Sparkline } from "@/components/Sparkline";
import { cityName, fmtInt, fmtPct, fmtShekel } from "@/lib/format";
import { districtLabel } from "@/lib/natures";
import { useLang } from "@/components/LangProvider";

type SortKey = "name" | "n_12m" | "med_price_12m" | "med_ppsqm_12m" | "change" | "n_all";
const change = (r: CityRow) => (r.med_ppsqm_12m && r.med_ppsqm_5y_ago ? r.med_ppsqm_12m / r.med_ppsqm_5y_ago - 1 : null);

export function CityRankings({ rows }: { rows: CityRow[] }) {
  const [text, setText] = useState("");
  const [district, setDistrict] = useState("");
  const [minDeals, setMinDeals] = useState("30");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "n_12m", dir: -1 });
  const { lang, t } = useLang();

  const districts = useMemo(
    () => [...new Set(rows.map((r) => districtLabel(r.district, lang)).filter(Boolean))].sort((a, b) => a.localeCompare(b, lang)),
    [rows, lang],
  );

  const list = useMemo(() => {
    const t = text.trim().toLowerCase();
    const min = Number(minDeals) || 0;
    const val = (r: CityRow): number | string | null =>
      sort.key === "name" ? cityName(r, lang) : sort.key === "change" ? change(r) : r[sort.key];
    return rows
      .filter((r) => r.n_12m >= min)
      .filter((r) => !district || districtLabel(r.district, lang) === district)
      .filter((r) => !t || r.name_he.includes(t) || (r.name_en ?? "").toLowerCase().includes(t))
      .sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null) return 1;
        if (vb == null) return -1;
        const c = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, lang) : va < vb ? -1 : va > vb ? 1 : 0;
        return c * sort.dir;
      });
  }, [rows, text, district, minDeals, sort, lang]);

  const th = (key: SortKey, label: string, right = true) => (
    <th className={right ? "r" : undefined} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" ? 1 : -1 }))}>
        {label}
        <span aria-hidden="true" style={{ opacity: sort.key === key ? 1 : 0.3, fontSize: 10 }}>{sort.key === key && sort.dir === 1 ? "▲" : "▼"}</span>
      </button>
    </th>
  );

  return (
    <>
      <div className="controls" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="city-search">{t("Search", "חיפוש")}</label>
          <input id="city-search" className="input" style={{ width: 220 }} placeholder={t("City name, English or Hebrew", "שם יישוב, בעברית או באנגלית")} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="district">{t("District", "נפה")}</label>
          <select id="district" className="select" value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">{t("All districts", "כל הנפות")}</option>
            {districts.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="min-deals">{t("Minimum home sales in 12 months", "מינימום מכירות דירות ב-12 חודשים")}</label>
          <select id="min-deals" className="select" value={minDeals} onChange={(e) => setMinDeals(e.target.value)}>
            {["0", "10", "30", "100", "500"].map((v) => <option key={v} value={v}>{v === "0" ? t("No minimum", "ללא מינימום") : v}</option>)}
          </select>
        </div>
        <p className="muted" style={{ margin: 0, marginBlockEnd: 8, marginInlineStart: "auto", fontSize: 13 }}>{t(`${list.length} localities`, `${list.length} יישובים`)}</p>
      </div>
      <div className="panel flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="r" style={{ width: 40 }}>#</th>
                {th("name", t("City", "יישוב"), false)}
                <th>{t("District", "נפה")}</th>
                {th("n_12m", t("Home sales, 12 mo", "מכירות, 12 חודשים"))}
                {th("med_price_12m", t("Median price", "מחיר חציוני"))}
                {th("med_ppsqm_12m", t("₪ / m²", "₪ למ״ר"))}
                {th("change", t("₪/m² vs 5 yrs ago", "₪ למ״ר מול לפני 5 שנים"))}
                <th>{t("₪/m² 2011–2025", "₪ למ״ר 2011–2025")}</th>
                {th("n_all", t("Deals since 1998", "עסקאות מאז 1998"))}
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => {
                const c = change(r);
                return (
                  <tr key={r.code}>
                    <td className="r muted">{i + 1}</td>
                    <td>
                      <Link href={`/cities/${r.code}`} style={{ fontWeight: 500 }}>{cityName(r, lang)}</Link>
                      {lang === "en" && <span className="sub he" lang="he" dir="auto">{r.name_he}</span>}
                    </td>
                    <td className="ink2">{districtLabel(r.district, lang)}</td>
                    <td className="r">{fmtInt(r.n_12m)}</td>
                    <td className="r"><bdi>{r.n_12m >= 5 ? fmtShekel(r.med_price_12m, lang) : "–"}</bdi></td>
                    <td className="r"><bdi>{r.n_12m >= 5 ? fmtShekel(r.med_ppsqm_12m, lang) : "–"}</bdi></td>
                    <td className="r">{c == null || r.n_12m < 5 ? "–" : <Delta v={c} />}</td>
                    <td><Sparkline values={r.spark} label={t(`Price per m² trend for ${cityName(r, lang)}`, `מגמת המחיר למ״ר ב${cityName(r, lang)}`)} /></td>
                    <td className="r ink2">{fmtInt(r.n_all)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="chart-note">
        {t(
          "Figures cover clean single-home sales. The five-year comparison uses the 12 months that ended five years before the latest data. Localities with fewer than 5 sales in the last 12 months show no price.",
          "הנתונים מתייחסים למכירות דירה בודדת תקינות. ההשוואה לחמש שנים משתמשת ב-12 החודשים שהסתיימו חמש שנים לפני הנתונים האחרונים. ביישובים עם פחות מ-5 מכירות ב-12 החודשים האחרונים לא מוצג מחיר.",
        )}
      </p>
    </>
  );
}

function Delta({ v }: { v: number }) {
  return (
    <span className="num" dir="ltr" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <span aria-hidden="true" style={{ fontSize: 9, color: "var(--muted)" }}>{v >= 0 ? "▲" : "▼"}</span>
      {fmtPct(v)}
    </span>
  );
}
