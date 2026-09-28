import type { Metadata } from "next";
import { qc, q1c } from "@/lib/db";
import { getLang } from "@/lib/lang.server";
import { fmtInt, fmtMonthYearLong } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getLang();
  return { title: t("About the data", "על הנתונים") };
}

const LOC_LABEL: Record<string, [string, string]> = {
  parcel: ["Exact parcel", "חלקה מדויקת"],
  lineage_single: ["Old parcel, replaced by one parcel", "חלקה ישנה שהוחלפה בחלקה אחת"],
  lineage_multi: ["Old parcel that was split (approximate)", "חלקה ישנה שפוצלה (מקורב)"],
  gush: ["Block centre only (approximate)", "מרכז הגוש בלבד (מקורב)"],
};
const ADDR_LABEL: Record<string, [string, string]> = {
  address_point: ["Street and house number", "רחוב ומספר בית"],
  gazetteer_subparcel: ["Street, from the property register", "רחוב, ממאגר הנכסים"],
  gazetteer_parcel: ["Street, from the parcel", "רחוב, לפי החלקה"],
  nearest_address: ["Nearest address within 100 m", "הכתובת הקרובה ביותר, עד 100 מ׳"],
  lineage_street: ["Street shared by the split parcel", "רחוב משותף לחלקות שפוצלו"],
  none: ["No address", "אין כתובת"],
};

export default async function About() {
  const [{ lang, t }, loc, addr, tot] = await Promise.all([
    getLang(),
    qc<{ k: string; n: number }>(`SELECT location_level AS k, count(*)::INT AS n FROM tx GROUP BY 1 ORDER BY n DESC`),
    qc<{ k: string; n: number }>(`SELECT address_source AS k, count(*)::INT AS n FROM tx GROUP BY 1 ORDER BY n DESC`),
    q1c<{ n: number; clean: number; first: string; last: string }>(
      `SELECT count(*)::INT AS n, count(*) FILTER (clean)::INT AS clean, min(date)::VARCHAR AS first, max(date)::VARCHAR AS last FROM tx`,
    ),
  ]);
  const pct = (n: number) => `${((n / tot!.n) * 100).toFixed(1)}%`;
  const label = (m: Record<string, [string, string]>, k: string) => (m[k] ? t(m[k][0], m[k][1]) : k);
  const firstYear = tot!.first.slice(0, 4);
  const last = fmtMonthYearLong(tot!.last, lang);
  const src = <a href="https://over.org.il">over.org.il</a>;

  return (
    <main className="page prose-page">
      <div className="page-head">
        <h1>{t("About the data", "על הנתונים")}</h1>
        <p>{t("Where the numbers come from, how they were cleaned, and what to keep in mind when reading them.", "מאיפה המספרים מגיעים, איך הם נוקו, ומה כדאי לזכור כשקוראים אותם.")}</p>
      </div>

      <section className="prose">
        <h2>{t("Source", "מקור")}</h2>
        <p>
          {t(
            <>Every sale of real estate in Israel must be reported to the Israel Tax Authority (מיסוי מקרקעין). This site uses the full published deals file, {fmtInt(tot!.n)} sales from {firstYear} to {last}, obtained from the {src} mirror. Parcel shapes and parcel history come from the Survey of Israel, addresses from the over.org.il address crosswalk and the national property gazetteer, and locality names from the Central Bureau of Statistics.</>,
            <>כל מכירת נדל״ן בישראל חייבת בדיווח לרשות המסים (מיסוי מקרקעין). האתר משתמש בקובץ העסקאות המלא שפורסם, {fmtInt(tot!.n)} עסקאות מ-{firstYear} ועד {last}, דרך האתר {src}. צורות החלקות וההיסטוריה שלהן מגיעות מהמרכז למיפוי ישראל, הכתובות ממאגר הכתובות של over.org.il ומגזטיר הנכסים הארצי, ושמות היישובים מהלשכה המרכזית לסטטיסטיקה.</>,
          )}
        </p>
        <p>
          {t(
            "Recent months are incomplete. Deals are often reported weeks or months after signing, so the last few months always look quieter than they will end up.",
            "החודשים האחרונים חלקיים. עסקאות מדווחות לעיתים קרובות שבועות או חודשים אחרי החתימה, ולכן החודשים האחרונים תמיד נראים שקטים יותר ממה שיתברר בסוף.",
          )}
        </p>

        <h2>{t("From reported rows to sales", "משורות מדווחות לעסקאות")}</h2>
        <p>
          {t(
            "A single sale is often reported as several rows: one per seller, or one per registered sub-parcel (a flat plus its parking space, for example). Rows that share a parcel, date and declared value are merged into one sale. Each sale is then classified: a single home sold in full, a partial share, a whole parcel, land, commercial, and so on. The price shown for a partial share is scaled up to the whole unit when at least 10% was sold.",
            "עסקה אחת מדווחת פעמים רבות בכמה שורות: שורה לכל מוכר, או שורה לכל תת-חלקה רשומה (למשל דירה וחניה). שורות עם אותה חלקה, אותו תאריך ואותו שווי מוצהר מאוחדות לעסקה אחת. אחר כך כל עסקה מסווגת: דירה בודדת שנמכרה במלואה, חלק מנכס, חלקה שלמה, קרקע, מסחרי וכן הלאה. במכירת חלק מנכס, המחיר המוצג מחושב לנכס השלם כשנמכרו 10% ממנו לפחות.",
          )}
        </p>
        <p>
          {t(
            <><strong>Clean home sales</strong> ({fmtInt(tot!.clean)} sales) are the basis for every median price on this site. They are single dwellings sold in full, with a value of at least ₪20,000 and a price per m² between a quarter and four times the median of their locality in that year. This excludes most family transfers, data-entry errors and bundled deals.</>,
            <><strong>מכירות דירה תקינות</strong> ({fmtInt(tot!.clean)} עסקאות) הן הבסיס לכל מחיר חציוני באתר. אלה דירות בודדות שנמכרו במלואן, בשווי של 20,000 ₪ לפחות, ובמחיר למ״ר שבין רבע לפי ארבעה מהחציון ביישוב באותה שנה. כך מסוננות רוב ההעברות בתוך המשפחה, טעויות הקלדה ועסקאות מאוגדות.</>,
          )}
        </p>

        <h2>{t("Location", "מיקום")}</h2>
        <p>
          {t(
            "Deals are recorded by block and parcel (gush and helka), not by address. Each deal was placed on the map through the parcel register:",
            "העסקאות רשומות לפי גוש וחלקה, לא לפי כתובת. כל עסקה מוקמה על המפה דרך מרשם החלקות:",
          )}
        </p>
        <table className="data" style={{ maxWidth: 560 }}>
          <tbody>
            {loc.map((r) => <tr key={r.k}><td>{label(LOC_LABEL, r.k)}</td><td className="r">{pct(r.n)}</td></tr>)}
          </tbody>
        </table>
        <p>
          {t(
            "Parcels that were later split no longer exist in today's register. They are placed at the centre of the parcels that replaced them and drawn as hollow circles on the map.",
            "חלקות שפוצלו מאז כבר לא קיימות במרשם של היום. הן ממוקמות במרכז החלקות שהחליפו אותן ומוצגות במפה כעיגולים חלולים.",
          )}
        </p>

        <h3>{t("Address", "כתובת")}</h3>
        <table className="data" style={{ maxWidth: 560 }}>
          <tbody>
            {addr.map((r) => <tr key={r.k}><td>{label(ADDR_LABEL, r.k)}</td><td className="r">{pct(r.n)}</td></tr>)}
          </tbody>
        </table>
        <p>
          {t(
            "Most sales without an address are old split parcels, rural parcels and land. New buildings are often missing from the address register, so recent years have the weakest house-number coverage.",
            "רוב העסקאות בלי כתובת הן חלקות ישנות שפוצלו, חלקות כפריות וקרקעות. בניינים חדשים חסרים לעיתים קרובות במאגר הכתובות, ולכן בשנים האחרונות הכיסוי של מספרי בתים הוא הנמוך ביותר.",
          )}
        </p>

        <h2>{t("Reading the prices", "איך לקרוא את המחירים")}</h2>
        <ul>
          <li>{t("All prices are nominal shekels, as reported, and are not adjusted for inflation.", "כל המחירים בשקלים נומינליים, כפי שדווחו, ואינם מתואמים לאינפלציה.")}</li>
          <li>{t("The median is used everywhere instead of the average, so a handful of luxury sales cannot distort a figure.", "בכל מקום משמש החציון ולא הממוצע, כך שמספר קטן של עסקאות יוקרה לא מעוות את התמונה.")}</li>
          <li>{t("Price per m² uses the registered area of the unit. Balconies, gardens and storage are recorded inconsistently.", "המחיר למ״ר מחושב לפי השטח הרשום של היחידה. מרפסות, גינות ומחסנים נרשמים באופן לא אחיד.")}</li>
          <li>{t("Areas with few sales produce noisy medians. Figures based on fewer than 5 sales are hidden.", "באזורים עם מעט עסקאות החציון רועש. נתונים שמבוססים על פחות מ-5 עסקאות מוסתרים.")}</li>
        </ul>
      </section>
    </main>
  );
}
