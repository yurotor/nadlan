import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang, translator } from "./i18n";

export async function getLang() {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return { lang, t: translator(lang) };
}
