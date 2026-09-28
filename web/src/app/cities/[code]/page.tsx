import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { qc, q1c } from "@/lib/db";
import { getLang } from "@/lib/lang.server";
import type { Lang, T } from "@/lib/i18n";
import { cityName, fmtDate, fmtInt, fmtPct, fmtShekel } from "@/lib/format";
import { districtLabel, natureLabel } from "@/lib/natures";
import { CityCharts } from "./CityCharts";

type Loc = {
  code: number; name_he: string; name_en: string | null; district: string | null; n_all: number; n_clean: number; n_12m: number;
  med_price_12m: number | null; med_ppsqm_12m: number | null; med_ppsqm_5y_ago: number | null; lat: number; lon: number; first_date: string;
};

async function getLoc(code: number) {
  return q1c<Loc>(
    `SELECT code, name_he, name_en, district, n_all::INT AS n_all, n_clean::INT AS n_clean, n_12m::INT AS n_12m, med_price_12m,
            med_ppsqm_12m, med_ppsqm_5y_ago, lat, lon, first_date::VARCHAR AS first_date
     FROM localities WHERE code = $code`,
    { code },
  );
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const [loc, { lang, t }] = await Promise.all([getLoc(Number((await params).code)), getLang()]);
  return { title: loc ? cityName(loc, lang) : t("City", "יישוב") };
}

export default async function CityPage({ params }: { params: Promise<{ code: string }> }) {
  const code = Number((await params).code);
  if (!Number.isFinite(code)) notFound();
  const [loc, { lang, t }] = await Promise.all([getLoc(code), getLang()]);
  if (!loc) notFound();

  const recent = `date >= (SELECT max(date) FROM tx) - INTERVAL 24 MONTH`;
  const [yearly, rooms, hist, streets, latest, mix] = await Promise.all([
    qc<{ y: number; n: number; n_all: number; price: number | null; ppsqm: number | null }>(
      `SELECT year(date)::INT AS y, count(*) FILTER (clean)::INT AS n, count(*)::INT AS n_all,
              median(price) FILTER (clean)::INT AS price, median(ppsqm)::INT AS ppsqm
       FROM tx WHERE loc = $code GROUP BY 1 ORDER BY 1`, { code }),
    qc<{ r: string; n: number; price: number; ppsqm: number }>(
      `SELECT CASE WHEN rooms < 3 THEN '1–2' WHEN rooms < 4 THEN '3' WHEN rooms < 5 THEN '4' WHEN rooms < 6 THEN '5' ELSE '6+' END AS r,
              count(*)::INT AS n, median(price)::INT AS price, median(ppsqm)::INT AS ppsqm
       FROM tx WHERE loc = $code AND clean AND rooms IS NOT NULL AND ${recent} GROUP BY 1 ORDER BY 1`, { code }),
    qc<{ b: number; n: number }>(
      `WITH s AS (SELECT price FROM tx WHERE loc = $code AND clean AND ${recent}),
            w AS (SELECT greatest(100000, round(quantile_cont(price, 0.98) / 24 / 50000) * 50000) AS w,
                         quantile_cont(price, 0.98) AS hi FROM s)
       SELECT (floor(price / w) * w)::INT AS b, count(*)::INT AS n FROM s, w WHERE price <= hi GROUP BY 1 ORDER BY 1`, { code }),
    qc<{ street: string; n: number; ppsqm: number; price: number; rooms: number }>(
      `SELECT street, count(*)::INT AS n, median(ppsqm)::INT AS ppsqm, median(price)::INT AS price, median(rooms) AS rooms
       FROM tx WHERE loc = $code AND clean AND street IS NOT NULL AND date >= (SELECT max(date) FROM tx) - INTERVAL 60 MONTH
       GROUP BY 1 HAVING count(*) >= 8 ORDER BY n DESC LIMIT 20`, { code }),
    qc<{ id: string; date: string; street: string | null; house: string | null; rooms: number | null; area: number | null; price: number; ppsqm: number | null; nature: string; lat: number; lon: number }>(
      `SELECT id, date::VARCHAR AS date, street, house, rooms, area, price, ppsqm, nature, lat, lon
       FROM tx WHERE loc = $code AND clean ORDER BY date DESC LIMIT 12`, { code }),
    qc<{ nature: string; n: number }>(
      `SELECT nature, count(*)::INT AS n FROM tx WHERE loc = $code AND clean AND ${recent} GROUP BY 1 ORDER BY n DESC`, { code }),
  ]);

  const name = cityName(loc, lang);
  const S = (v: number | null) => <bdi>{fmtShekel(v, lang)}</bdi>;
  const change5 = loc.med_ppsqm_12m && loc.med_ppsqm_5y_ago ? loc.med_ppsqm_12m / loc.med_ppsqm_5y_ago - 1 : null;
  const mixTotal = mix.reduce((a, m) => a + m.n, 0);

  return (
    <main className="page">
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, marginBottom: 14 }}>
        <Link href="/cities" className="ink2">{t("Cities", "ערים")}</Link>
      </nav>
      <div className="page-head" style={{ maxWidth: "none", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            {name}
            {lang === "en" && loc.name_en && <span className="he" lang="he" dir="rtl" style={{ color: "var(--muted)", fontWeight: 500 }}>{loc.name_he}</span>}
            {lang === "he" && loc.name_en && <span lang="en" dir="ltr" style={{ color: "var(--muted)", fontWeight: 500 }}>{loc.name_en}</span>}
          </h1>
          <p>
            {loc.district ? t(`${districtLabel(loc.district, lang)} district. `, `נפת ${districtLabel(loc.district, lang)}. `) : ""}
            {t(
              `${fmtInt(loc.n_all)} recorded deals since ${new Date(loc.first_date).getUTCFullYear()}, of which ${fmtInt(loc.n_clean)} are clean home sales.`,
              `${fmtInt(loc.n_all)} עסקאות מאז ${new Date(loc.first_date).getUTCFullYear()}, מהן ${fmtInt(loc.n_clean)} מכירות דירה תקינות.`,
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn" href={`/map?lat=${loc.lat}&lon=${loc.lon}&z=13&from=2021`}>{t("Open map", "פתיחה במפה")}</Link>
          <Link className="btn" href={`/deals?loc=${code}`}>{t("All deals", "כל העסקאות")}</Link>
          <Link className="btn" href={`/trends?loc=${code}`}>{t("Compare trends", "השוואת מגמות")}</Link>
          <Link className="btn primary" href={`/price-check?loc=${code}`}>{t("Check a price", "בדיקת מחיר")}</Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="label">{t("Home sales, last 12 months", "מכירות דירות, 12 החודשים האחרונים")}</div>
          <div className="value num">{fmtInt(loc.n_12m)}</div>
        </div>
        <div className="stat">
          <div className="label">{t("Median price", "מחיר חציוני")}</div>
          <div className="value num">{loc.n_12m >= 5 ? S(loc.med_price_12m) : "–"}</div>
        </div>
        <div className="stat">
          <div className="label">{t("Median price per m²", "מחיר חציוני למ״ר")}</div>
          <div className="value num">{loc.n_12m >= 5 ? S(loc.med_ppsqm_12m) : "–"}</div>
        </div>
        <div className="stat">
          <div className="label">{t("Price per m², 5-year change", "שינוי במחיר למ״ר, 5 שנים")}</div>
          <div className="value num"><bdi>{change5 != null && loc.n_12m >= 5 ? fmtPct(change5) : "–"}</bdi></div>
          {loc.med_ppsqm_5y_ago && <div className="sub">{t("from", "לעומת")} {S(loc.med_ppsqm_5y_ago)}</div>}
        </div>
      </div>

      <CityCharts yearly={yearly} rooms={rooms} hist={hist} name={name} />

      <div className="grid-2 section">
        <section>
          <div className="section-head">
            <div>
              <h2>{t("Busiest streets", "הרחובות הפעילים ביותר")}</h2>
              <p>{t("Home sales in the last five years, streets with at least 8 sales.", "מכירות דירות בחמש השנים האחרונות, ברחובות עם 8 מכירות לפחות.")}</p>
            </div>
          </div>
          <div className="panel flush">
            {streets.length ? (
              <table className="data">
                <thead><tr><th>{t("Street", "רחוב")}</th><th className="r">{t("Sales", "מכירות")}</th><th className="r">{t("Median price", "מחיר חציוני")}</th><th className="r">{t("₪ / m²", "₪ למ״ר")}</th></tr></thead>
                <tbody>
                  {streets.map((s) => (
                    <tr key={s.street}>
                      <td className="he" lang="he" dir="auto">{s.street}</td>
                      <td className="r">{fmtInt(s.n)}</td>
                      <td className="r">{S(s.price)}</td>
                      <td className="r">{S(s.ppsqm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">{t("Not enough sales with a street address.", "אין מספיק מכירות עם כתובת.")}</div>}
          </div>
        </section>
        <section>
          <div className="section-head">
            <div>
              <h2>{t("Latest home sales", "מכירות אחרונות")}</h2>
              <p>{t("The 12 most recent clean sales.", "12 מכירות הדירה התקינות האחרונות.")}</p>
            </div>
            <Link className="btn ghost" href={`/deals?loc=${code}&kind=homes`}>{t("See all", "לכל המכירות")}</Link>
          </div>
          <div className="panel flush">
            <table className="data">
              <thead><tr><th>{t("Date", "תאריך")}</th><th>{t("Address", "כתובת")}</th><th className="r">{t("Rooms", "חדרים")}</th><th className="r">{t("m²", "מ״ר")}</th><th className="r">{t("Price", "מחיר")}</th></tr></thead>
              <tbody>
                {latest.map((d) => (
                  <tr key={d.id}>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>{fmtDate(d.date, lang)}</td>
                    <td>
                      {d.street ? <span className="he" lang="he" dir="auto">{d.street}{d.house ? ` ${d.house}` : ""}</span> : <span className="muted">{t("No address", "אין כתובת")}</span>}
                      <span className="sub">{natureLabel(d.nature, lang)}</span>
                    </td>
                    <td className="r">{d.rooms ?? "–"}</td>
                    <td className="r">{d.area ?? "–"}</td>
                    <td className="r">{S(d.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mixTotal > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3>{t("What sells here", "מה נמכר כאן")}</h3>
              <p className="chart-note" style={{ marginTop: 0 }}>{t("Home sales by property type, last 24 months.", "מכירות דירות לפי סוג נכס, 24 החודשים האחרונים.")}</p>
              <MixBar mix={mix} total={mixTotal} lang={lang} t={t} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function MixBar({ mix, total, lang, t }: { mix: { nature: string; n: number }[]; total: number; lang: Lang; t: T }) {
  const top = mix.slice(0, 4);
  const other = total - top.reduce((a, m) => a + m.n, 0);
  const parts = [...top.map((m) => ({ label: natureLabel(m.nature, lang), n: m.n })), ...(other > 0 ? [{ label: t("Other", "אחר"), n: other }] : [])];
  const colors = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--muted)"];
  return (
    <>
      <div style={{ display: "flex", gap: 2, height: 12, borderRadius: 4, overflow: "hidden", margin: "8px 0 10px" }}>
        {parts.map((p, i) => <div key={p.label} title={`${p.label}: ${fmtInt(p.n)}`} style={{ flex: p.n, background: colors[i] }} />)}
      </div>
      <div className="legend">
        {parts.map((p, i) => (
          <span key={p.label}><i style={{ background: colors[i], height: 10, width: 10, borderRadius: 2 }} />{p.label} <span className="num muted">{Math.round((p.n / total) * 100)}%</span></span>
        ))}
      </div>
    </>
  );
}
