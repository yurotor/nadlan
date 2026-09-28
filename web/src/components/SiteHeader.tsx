"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ParcelMark } from "./ParcelMark";
import { ThemeToggle } from "./ThemeToggle";
import { LangToggle } from "./LangToggle";
import { useLang } from "./LangProvider";

export function SiteHeader() {
  const path = usePathname();
  const { t } = useLang();
  const links = [
    { href: "/", label: t("Overview", "סקירה") },
    { href: "/map", label: t("Map", "מפה") },
    { href: "/deals", label: t("Deals", "עסקאות") },
    { href: "/trends", label: t("Trends", "מגמות") },
    { href: "/cities", label: t("Cities", "ערים") },
    { href: "/price-check", label: t("Price check", "בדיקת מחיר") },
    { href: "/about", label: t("About the data", "על הנתונים") },
  ];
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label={t("Nadlan home", "נדל״ן, דף הבית")}>
        <ParcelMark />
        {t(<><span>Nadlan</span><span className="he" lang="he">נדל״ן</span></>, <span>נדל״ן</span>)}
      </Link>
      <nav className="nav" aria-label={t("Main", "ראשי")}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="header-end">
        <LangToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
