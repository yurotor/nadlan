import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Hebrew } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { LangProvider } from "@/components/LangProvider";
import { getLang } from "@/lib/lang.server";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });
const plexHe = IBM_Plex_Sans_Hebrew({ subsets: ["hebrew", "latin"], weight: ["400", "500", "600"], variable: "--font-plex-hebrew" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getLang();
  return {
    title: { default: t("Nadlan · Israeli property sales", "נדל״ן · עסקאות נדל״ן בישראל"), template: t("%s · Nadlan", "%s · נדל״ן") },
    description: t(
      "Every property sale reported to the Israel Tax Authority since 1998: map, deals, trends and price checks.",
      "כל עסקאות הנדל״ן שדווחו לרשות המסים מאז 1998: מפה, עסקאות, מגמות ובדיקת מחיר.",
    ),
  };
}

// Applies the saved theme before paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { lang } = await getLang();
  return (
    <html lang={lang} dir={lang === "he" ? "rtl" : "ltr"} className={`${plex.variable} ${plexHe.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <LangProvider lang={lang}>
          <SiteHeader />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
