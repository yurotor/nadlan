import Link from "next/link";
import { qc, q1c } from "@/lib/db";
import { getLang } from "@/lib/lang.server";
import { fmtDayMonth, fmtInt, fmtPct, fmtShekel, fmtShekelShort } from "@/lib/format";
import { HeroChart, RankBars } from "./HomeCharts";

type Ranked = { code: number; name_he: string; name_en: string | null; v: number };

export default async function Home() {
  const { lang, t } = await getLang();
  const last12 = `date > (SELECT max(date) FROM tx) - INTERVAL 12 MONTH`;
  const prev12 = `date <= (SELECT max(date) FROM tx) - INTERVAL 12 MONTH AND date > (SELECT max(date) FROM tx) - INTERVAL 24 MONTH`;
  const [yearly, totals, expensive, rising, busiest] = await Promise.all([
    qc<{ y: number; price: number; ppsqm: number; n: number }>(
      `SELECT year(date)::INT AS y, median(price)::INT AS price, median(ppsqm)::INT AS ppsqm, count(*)::INT AS n
       FROM tx WHERE clean GROUP BY 1 ORDER BY 1`),
    q1c<{ all: number; n12: number; p12: number; pp12: number; n_prev: number; p_prev: number; last: string; cities: number }>(
      `SELECT count(*)::INT AS all,
              count(*) FILTER (clean AND ${last12})::INT AS n12,
              median(price) FILTER (clean AND ${last12}) AS p12,
              median(ppsqm) FILTER (clean AND ${last12}) AS pp12,
              count(*) FILTER (clean AND ${prev12})::INT AS n_prev,
              median(price) FILTER (clean AND ${prev12}) AS p_prev,
              max(date)::VARCHAR AS last,
              count(DISTINCT loc)::INT AS cities
       FROM tx`),
    qc<Ranked>(
      `SELECT code, name_he, name_en, med_ppsqm_12m AS v FROM localities
       WHERE n_12m >= 150 ORDER BY v DESC LIMIT 10`),
    qc<Ranked>(
      `SELECT code, name_he, name_en, med_ppsqm_12m / med_ppsqm_5y_ago - 1 AS v FROM localities
       WHERE n_12m >= 150 AND med_ppsqm_5y_ago IS NOT NULL ORDER BY v DESC LIMIT 10`),
    qc<Ranked>(
      `SELECT code, name_he, name_en, n_12m::INT AS v FROM localities ORDER BY n_12m DESC LIMIT 10`),
  ]);
  const tt = totals!;
  const complete = yearly.filter((y) => y.y < new Date(tt.last).getUTCFullYear());
  const first = complete[0];
  const lastFull = complete.at(-1)!;
  const multiple = lastFull.price / first.price;
  const S = (v: number) => <bdi>{fmtShekelShort(v, lang)}</bdi>;

  return (
    <main>
      <section className="hero">
        <div className="hero-text">
          <h1>
            {t(
              <>In {first.y}, a typical Israeli home sold for {S(first.price)}. In {lastFull.y}, it sold for {S(lastFull.price)}.</>,
              <>ב-{first.y} דירה טיפוסית בישראל נמכרה ב-{S(first.price)}. ב-{lastFull.y} היא נמכרה ב-{S(lastFull.price)}.</>,
            )}
          </h1>
          <p>
            {t(
              <>That is {multiple.toFixed(1)} times as much, across {fmtInt(tt.all)} property sales reported to the Israel Tax Authority. Explore every one of them by place, by date, and by price.</>,
              <>פי {multiple.toFixed(1)}, על פני {fmtInt(tt.all)} עסקאות נדל״ן שדווחו לרשות המסים. אפשר לחקור כל אחת מהן לפי מקום, תאריך ומחיר.</>,
            )}
          </p>
        </div>
        <HeroChart data={complete} />
        <p className="hero-note">
          {t(
            "Median price of clean single-home sales per year, in nominal shekels (not adjusted for inflation).",
            "מחיר חציוני של מכירות דירה בודדת תקינות, לפי שנה, בשקלים נומינליים (לא מתואם לאינפלציה).",
          )}
        </p>
      </section>

      <div className="page" style={{ paddingTop: 8 }}>
        <div className="stats">
          <div className="stat">
            <div className="label">{t(`Home sales in ${lastFull.y}`, `מכירות דירות ב-${lastFull.y}`)}</div>
            <div className="value num">{fmtInt(lastFull.n)}</div>
            <div className="sub"><bdi>{fmtPct(lastFull.n / complete.at(-2)!.n - 1)}</bdi> {t(`on ${lastFull.y - 1}`, `לעומת ${lastFull.y - 1}`)}</div>
          </div>
          <div className="stat">
            <div className="label">{t("Median home price", "מחיר דירה חציוני")}</div>
            <div className="value num"><bdi>{fmtShekel(tt.p12, lang)}</bdi></div>
            <div className="sub">
              {t("last 12 months, ", "ב-12 החודשים האחרונים, ")}
              <bdi>{fmtPct(tt.p12 / tt.p_prev - 1, 1)}</bdi>
              {t(" on the 12 before", " לעומת 12 החודשים שקדמו")}
            </div>
          </div>
          <div className="stat">
            <div className="label">{t("Median price per m²", "מחיר חציוני למ״ר")}</div>
            <div className="value num"><bdi>{fmtShekel(tt.pp12, lang)}</bdi></div>
            <div className="sub">{t("last 12 months", "ב-12 החודשים האחרונים")}</div>
          </div>
          <div className="stat">
            <div className="label">{t("Latest recorded sale", "העסקה האחרונה שדווחה")}</div>
            <div className="value num">{fmtDayMonth(tt.last, lang)}</div>
            <div className="sub">{t(`${fmtInt(tt.cities)} localities covered`, `${fmtInt(tt.cities)} יישובים`)}</div>
          </div>
        </div>

        <div className="grid-3 section">
          <section>
            <h2>{t("Most expensive per m²", "היקרים ביותר למ״ר")}</h2>
            <p className="chart-note" style={{ marginTop: 0 }}>{t("Median, last 12 months. Localities with 150+ sales.", "חציון, 12 החודשים האחרונים. יישובים עם 150 מכירות ומעלה.")}</p>
            <RankBars rows={expensive} kind="shekel" />
          </section>
          <section>
            <h2>{t("Fastest rising", "העליות החדות ביותר")}</h2>
            <p className="chart-note" style={{ marginTop: 0 }}>{t("Change in median ₪/m² over five years.", "השינוי במחיר החציוני למ״ר בחמש שנים.")}</p>
            <RankBars rows={rising} kind="pct" />
          </section>
          <section>
            <h2>{t("Busiest markets", "השווקים הפעילים ביותר")}</h2>
            <p className="chart-note" style={{ marginTop: 0 }}>{t("Home sales in the last 12 months.", "מכירות דירות ב-12 החודשים האחרונים.")}</p>
            <RankBars rows={busiest} kind="count" />
          </section>
        </div>

        <section className="section explore">
          <h2>{t("Explore the data", "לחקור את הנתונים")}</h2>
          <ul>
            <li><Link href="/map"><strong>{t("Map", "מפה")}</strong><span>{t("Every sale on a map, from national price patterns down to single buildings.", "כל העסקאות על המפה, מדפוסי מחירים ארציים ועד בניין בודד.")}</span></Link></li>
            <li><Link href="/deals"><strong>{t("Deals", "עסקאות")}</strong><span>{t("Search and sort individual transactions, then download them as CSV.", "חיפוש ומיון של עסקאות בודדות, והורדה כקובץ CSV.")}</span></Link></li>
            <li><Link href="/trends"><strong>{t("Trends", "מגמות")}</strong><span>{t("Prices and volumes over time, with city-to-city comparisons.", "מחירים והיקפי עסקאות לאורך זמן, עם השוואה בין ערים.")}</span></Link></li>
            <li><Link href="/cities"><strong>{t("Cities", "ערים")}</strong><span>{t("Rankings and a profile for every city and town.", "דירוג ופרופיל לכל עיר ויישוב.")}</span></Link></li>
            <li><Link href="/price-check"><strong>{t("Price check", "בדיקת מחיר")}</strong><span>{t("Compare an asking price with what similar homes sold for.", "השוואה של מחיר מבוקש למחירים שבהם נמכרו דירות דומות.")}</span></Link></li>
          </ul>
        </section>
      </div>
      <footer className="footer">
        <span>{t("Data: Israel Tax Authority real-estate deals, via over.org.il. Parcels: Survey of Israel.", "נתונים: עסקאות נדל״ן של רשות המסים, דרך over.org.il. חלקות: המרכז למיפוי ישראל.")}</span>
        <Link href="/about">{t("How the data was prepared", "איך הוכנו הנתונים")}</Link>
      </footer>
    </main>
  );
}
