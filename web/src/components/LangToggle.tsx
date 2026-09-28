"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LANG_COOKIE } from "@/lib/i18n";
import { useLang } from "./LangProvider";

export function LangToggle() {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (next: "he" | "en") => {
    if (next === lang) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  };
  return (
    <div className="seg lang-toggle" role="group" aria-label={lang === "he" ? "שפה" : "Language"} style={{ opacity: pending ? 0.6 : 1 }}>
      <button aria-pressed={lang === "he"} onClick={() => pick("he")} lang="he">עב</button>
      <button aria-pressed={lang === "en"} onClick={() => pick("en")} lang="en">EN</button>
    </div>
  );
}
