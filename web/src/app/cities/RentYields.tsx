import Link from "next/link";
import type { Lang, T } from "@/lib/i18n";
import type { RentRow } from "@/lib/rent";
import { cityName, fmtQuarter, fmtShekel } from "@/lib/format";
import { CBS_RENT_URL, fmtYield, roomsLabel } from "@/components/RentTable";

type Row = RentRow & { name_he: string; name_en: string | null };
const GROUPS = ["2.5-3", "3.5-4", "4.5+"] as const;

/** The big cities side by side: rent and gross yield per rooms group, highest 3.5–4-room yield first. */
export function RentYields({ rows, lang, t }: { rows: Row[]; lang: Lang; t: T }) {
  if (!rows.length) return null;
  const byCity = new Map<number, Map<string, Row>>();
  for (const r of rows) {
    if (!byCity.has(r.loc)) byCity.set(r.loc, new Map());
    byCity.get(r.loc)!.set(r.rooms, r);
  }
  const cities = [...byCity.values()].sort((a, b) => (b.get("3.5-4")?.gross_yield ?? 0) - (a.get("3.5-4")?.gross_yield ?? 0));
  const S = (v: number | null | undefined) => <bdi>{fmtShekel(v ?? null, lang)}</bdi>;
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>{t("Rent and gross yield in the big cities", "שכר דירה ותשואה ברוטו בערים הגדולות")}</h2>
          <p>
            {t(
              `Average monthly rent in ${fmtQuarter(rows[0].rent_q, lang)} and a year of it as a share of the median sale price of the same size. Highest yield for 3.5–4 rooms first.`,
              `שכר הדירה החודשי הממוצע ב${fmtQuarter(rows[0].rent_q, lang)}, ושנה שלו כאחוז ממחיר המכירה החציוני של דירות באותו גודל. מסודר מהתשואה הגבוהה ל-3.5–4 חדרים.`,
            )}
          </p>
        </div>
      </div>
      <div className="panel flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th rowSpan={2}>{t("City", "עיר")}</th>
                {GROUPS.map((g) => <th key={g} colSpan={2} className="r">{roomsLabel(g)} {t("rooms", "חדרים")}</th>)}
              </tr>
              <tr>
                {GROUPS.map((g) => [
                  <th key={g + "r"} className="r">{t("Rent", "שכ״ד")}</th>,
                  <th key={g + "y"} className="r">{t("Yield", "תשואה")}</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {cities.map((m) => {
                const any = [...m.values()][0];
                return (
                  <tr key={any.loc}>
                    <td><Link href={`/cities/${any.loc}`}>{cityName(any, lang)}</Link></td>
                    {GROUPS.map((g) => [
                      <td key={g + "r"} className="r">{S(m.get(g)?.rent)}</td>,
                      <td key={g + "y"} className="r"><strong>{fmtYield(m.get(g)?.gross_yield)}</strong></td>,
                    ])}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="chart-note">
        {t(
          <>Rents: <a href={CBS_RENT_URL} target="_blank" rel="noreferrer">Central Bureau of Statistics</a>, Price Statistics Monthly, table 4.9, which covers these 18 cities. Sale prices: median of clean home sales over the last four quarters. Gross yield is before costs, vacancies and tax.</>,
          <>שכר הדירה: <a href={CBS_RENT_URL} target="_blank" rel="noreferrer">הלשכה המרכזית לסטטיסטיקה</a>, ירחון סטטיסטיקה של מחירים, לוח 4.9, שמכסה את 18 הערים האלה. מחירי המכירה: חציון מכירות הדירה התקינות בארבעת הרבעונים האחרונים. התשואה ברוטו היא לפני הוצאות, תקופות ללא שוכר ומס.</>,
        )}
      </p>
    </section>
  );
}
