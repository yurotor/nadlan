import { Suspense } from "react";
import type { Metadata } from "next";
import { getLang } from "@/lib/lang.server";
import { DealsTable } from "./DealsTable";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getLang();
  return { title: t("Deals", "עסקאות") };
}

export default async function DealsPage() {
  const { t } = await getLang();
  return (
    <main className="page" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <h1>{t("Deals", "עסקאות")}</h1>
        <p>
          {t(
            "Every sale reported to the Tax Authority since 1998. Filter by city, deal type, date, rooms and size, then sort any column or download the result.",
            "כל עסקה שדווחה לרשות המסים מאז 1998. אפשר לסנן לפי יישוב, סוג עסקה, תאריך, חדרים ושטח, למיין לפי כל עמודה ולהוריד את התוצאה.",
          )}
        </p>
      </div>
      <Suspense>
        <DealsTable />
      </Suspense>
    </main>
  );
}
