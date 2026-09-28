import { Suspense } from "react";
import type { Metadata } from "next";
import { getLang } from "@/lib/lang.server";
import { Trends } from "./Trends";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getLang();
  return { title: t("Trends", "מגמות") };
}

export default async function TrendsPage() {
  const { t } = await getLang();
  return (
    <main className="page">
      <div className="page-head">
        <h1>{t("Prices and volumes over time", "מחירים והיקפי עסקאות לאורך זמן")}</h1>
        <p>
          {t(
            "Track median prices, price per m² and the number of deals from 1998 on. Compare up to five cities, or index them to a common start to see which grew fastest.",
            "מחירים חציוניים, מחיר למ״ר ומספר העסקאות מאז 1998. אפשר להשוות עד חמש ערים, או להציג אותן כמדד עם נקודת פתיחה משותפת כדי לראות איפה המחירים עלו מהר יותר.",
          )}
        </p>
      </div>
      <Suspense>
        <Trends />
      </Suspense>
    </main>
  );
}
