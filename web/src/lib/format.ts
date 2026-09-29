import { locale, type Lang } from "./i18n";

const nf = new Intl.NumberFormat("en-US");

export const fmtInt = (v: number | null | undefined) => (v == null ? "–" : nf.format(Math.round(v)));

/** Compact shekels: "₪1.23M" / "1.23 מיליון ₪", "₪845K" / "845 אלף ₪". */
export function fmtShekelShort(v: number | null | undefined, lang: Lang = "en") {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) {
    const n = (v / 1e6).toFixed(a >= 1e7 ? 1 : 2);
    return lang === "he" ? `${n} מיליון ₪` : `₪${n}M`;
  }
  if (a >= 1e3) {
    const n = Math.round(v / 1e3);
    return lang === "he" ? `${n} אלף ₪` : `₪${n}K`;
  }
  return lang === "he" ? `${Math.round(v)} ₪` : `₪${Math.round(v)}`;
}

/** Axis ticks: the shortest form ("₪1.5M" / "1.5 מ׳"). */
export function fmtShekelAxis(v: number, lang: Lang = "en") {
  const a = Math.abs(v);
  if (lang === "en") return fmtShekelShort(v, "en");
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)} מ׳`;
  if (a >= 1e3) return `${Math.round(v / 1e3)} א׳`;
  return String(Math.round(v));
}

export const fmtShekel = (v: number | null | undefined, lang: Lang = "en") =>
  v == null ? "–" : lang === "he" ? `${nf.format(Math.round(v))} ₪` : `₪${nf.format(Math.round(v))}`;

/** Signed percentage, wrapped in a left-to-right isolate so "-14%" never flips to "14%-" in Hebrew text. */
export function fmtPct(v: number | null | undefined, digits = 0) {
  if (v == null || !Number.isFinite(v)) return "–";
  const s = (v * 100).toFixed(digits);
  return `\u2066${v > 0 ? "+" : ""}${s}%\u2069`;
}

const dfs = new Map<string, Intl.DateTimeFormat>();
function df(lang: Lang, opts: Intl.DateTimeFormatOptions) {
  const k = lang + JSON.stringify(opts);
  if (!dfs.has(k)) dfs.set(k, new Intl.DateTimeFormat(locale(lang), { ...opts, timeZone: "UTC" }));
  return dfs.get(k)!;
}
export const fmtDate = (s: string | null | undefined, lang: Lang = "en") =>
  s ? df(lang, { day: "numeric", month: "short", year: "numeric" }).format(new Date(s)) : "–";
export const fmtMonth = (s: string | null | undefined, lang: Lang = "en") =>
  s ? df(lang, { month: "short", year: "numeric" }).format(new Date(s)) : "–";
export const fmtDayMonth = (s: string, lang: Lang = "en") => df(lang, { day: "numeric", month: "short" }).format(new Date(s));
export const fmtMonthYearLong = (s: string, lang: Lang = "en") => df(lang, { month: "long", year: "numeric" }).format(new Date(s));

/** Display name of a locality in the current language. */
export function cityName(c: { name_en?: string | null; name_he?: string | null } | null | undefined, lang: Lang = "en") {
  if (!c) return "";
  return (lang === "he" ? c.name_he || c.name_en : c.name_en || c.name_he) || "";
}

/** "Q2 2026" / "רבעון 2 2026" from the quarter's first day. */
export function fmtQuarter(s: string, lang: Lang = "en") {
  const q = Math.floor(Number(s.slice(5, 7)) / 3) + 1;
  return lang === "he" ? `רבעון ${q} ${s.slice(0, 4)}` : `Q${q} ${s.slice(0, 4)}`;
}
