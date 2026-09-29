import type { Lang, T } from "@/lib/i18n";
import type { RentRow } from "@/lib/rent";
import { fmtPct, fmtShekel } from "@/lib/format";

export const CBS_RENT_URL = "https://www.cbs.gov.il/he/publications/Madad/Pages/default.aspx";

/** Gross yield as "2.4%", isolated left-to-right for Hebrew text. */
export const fmtYield = (v: number | null | undefined) => (v == null ? "–" : `⁦${(v * 100).toFixed(1)}%⁩`);
export const roomsLabel = (r: string) => <bdi>{r.replace("-", "–")}</bdi>;

/** A city's rents by rooms group with year-on-year change, median sale price and gross yield. */
export function RentTable({ rows, lang, t }: { rows: RentRow[]; lang: Lang; t: T }) {
  const S = (v: number | null) => <bdi>{fmtShekel(v, lang)}</bdi>;
  return (
    <table className="data">
      <thead><tr>
        <th>{t("Rooms", "חדרים")}</th>
        <th className="r">{t("Average rent a month", "שכר דירה חודשי ממוצע")}</th>
        <th className="r">{t("Year on year", "שינוי בשנה")}</th>
        <th className="r">{t("Median sale price", "מחיר מכירה חציוני")}</th>
        <th className="r">{t("Gross yield", "תשואה ברוטו")}</th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.rooms}>
            <td>{roomsLabel(r.rooms)}</td>
            <td className="r">{S(r.rent)}</td>
            <td className="r"><bdi>{r.rent_change == null ? "–" : fmtPct(r.rent_change, 1)}</bdi></td>
            <td className="r">{r.n_sales && r.n_sales >= 20 ? S(r.med_price) : "–"}<span className="sub">{r.n_sales ? t(`${r.n_sales} sales`, `${r.n_sales} מכירות`) : ""}</span></td>
            <td className="r"><strong>{fmtYield(r.gross_yield)}</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
