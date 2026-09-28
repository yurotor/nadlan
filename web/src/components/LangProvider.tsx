"use client";
import { createContext, useContext, useMemo } from "react";
import { translator, type Lang, type T } from "@/lib/i18n";

const Ctx = createContext<Lang>("he");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useLang(): { lang: Lang; t: T } {
  const lang = useContext(Ctx);
  return useMemo(() => ({ lang, t: translator(lang) }), [lang]);
}
