import { Suspense } from "react";
import type { Metadata } from "next";
import { getLang } from "@/lib/lang.server";
import { PriceCheck } from "./PriceCheck";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getLang();
  return { title: t("Price check", "בדיקת מחיר") };
}

export default async function PriceCheckPage() {
  const { t } = await getLang();
  return (
    <main className="page">
      <div className="page-head">
        <h1>{t("Is this price fair?", "המחיר הוגן?")}</h1>
        <p>
          {t(
            "Describe a home and see what similar homes in the same city actually sold for: same room count (±½), similar size (±25%), recent sales only, adjusted to today’s prices. Add an asking price, from any listing, to see how it compares.",
            "מתארים דירה ורואים בכמה נמכרו בפועל דירות דומות באותו יישוב: אותו מספר חדרים (±½), שטח דומה (±25%), מכירות אחרונות בלבד, מותאמות למחירי היום. אפשר להוסיף מחיר מבוקש מכל מודעה ולראות איך הוא משתווה.",
          )}
        </p>
      </div>
      <Suspense>
        <PriceCheck />
      </Suspense>
    </main>
  );
}
