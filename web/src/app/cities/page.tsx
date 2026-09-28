import type { Metadata } from "next";
import { cityRankings } from "@/lib/queries";
import { getLang } from "@/lib/lang.server";
import { CityRankings } from "./CityRankings";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getLang();
  return { title: t("Cities", "ערים") };
}

export default async function CitiesPage() {
  const [rows, { t }] = await Promise.all([cityRankings(), getLang()]);
  const n = rows.length.toLocaleString("en-US");
  return (
    <main className="page">
      <div className="page-head">
        <h1>{t("Cities and towns", "ערים ויישובים")}</h1>
        <p>
          {t(
            `How ${n} localities compare over the last 12 months: activity, typical price, price per m², and how much price per m² has moved in five years. Select a city to see its full profile.`,
            `השוואה בין ${n} יישובים ב-12 החודשים האחרונים: היקף פעילות, מחיר טיפוסי, מחיר למ״ר, וכמה השתנה המחיר למ״ר בחמש שנים. בחירה בעיר פותחת את הפרופיל המלא שלה.`,
          )}
        </p>
      </div>
      <CityRankings rows={rows} />
    </main>
  );
}
