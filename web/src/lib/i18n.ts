/** Two UI languages. Hebrew is the default; the choice is stored in the `lang` cookie. */
export type Lang = "he" | "en";
export const LANG_COOKIE = "lang";
export const parseLang = (v: string | undefined | null): Lang => (v === "en" ? "en" : "he");

/** Pick the string for the current language: t("Map", "מפה"). Works for any value, including JSX. */
export type T = <V>(en: V, he: V) => V;
export const translator = (lang: Lang): T => (en, he) => (lang === "he" ? he : en);

export const locale = (lang: Lang) => (lang === "he" ? "he-IL" : "en-GB");
