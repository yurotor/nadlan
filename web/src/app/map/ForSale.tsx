"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ForSale, Placed } from "@/app/api/listings/route";
import { CityPicker } from "@/components/CityPicker";
import { useLang } from "@/components/LangProvider";
import { useLocalities, type Locality } from "@/lib/useLocalities";
import { cityName, fmtDate, fmtInt, fmtShekel } from "@/lib/format";
import type { Lang, T } from "@/lib/i18n";
import styles from "./map.module.css";

/** Asking price vs recent sales: buckets, their colours and labels. Thresholds are ±3% and ±10%. */
export const BUCKETS = [
  { max: -0.1, color: "#1a9850", en: "Over 10% below", he: "יותר מ-\u206610%\u2069 מתחת" },
  { max: -0.03, color: "#8fcb66", en: "3–10% below", he: "\u20663–10%\u2069 מתחת" },
  { max: 0.03, color: "#b9c0c4", en: "In line (±3%)", he: "בהתאם (\u2066±3%\u2069)" },
  { max: 0.1, color: "#f59a5e", en: "3–10% above", he: "\u20663–10%\u2069 מעל" },
  { max: Infinity, color: "#d7301f", en: "Over 10% above", he: "יותר מ-\u206610%\u2069 מעל" },
];
export const diffColor = (d: number | null) => (d == null ? "#7d878d" : BUCKETS.find((b) => d <= b.max)!.color);
export const fmtDiff = (d: number) => `⁦${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(Math.round(d * 100))}%⁩`;

export type Listing = (ForSale | (Placed & MyInput)) & { kind: "yad2" | "mine" };

/** Listings at one point on the map. */
export type Group = { key: string; kind: "yad2" | "mine"; lat: number; lon: number; items: Listing[]; median: number | null };

/** Group listings that share a point (to ~1 m), each group sorted from most under- to most over-priced. */
export function groupListings(ls: Listing[]): Group[] {
  const by = new Map<string, Listing[]>();
  for (const l of ls) {
    const key = `${l.kind}:${l.lat.toFixed(5)},${l.lon.toFixed(5)}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key)!.push(l);
  }
  return [...by.entries()].map(([key, items]) => {
    const ds = items.map((l) => l.diff).filter((d): d is number => d != null).sort((a, b) => a - b);
    const median = ds.length ? (ds.length % 2 ? ds[(ds.length - 1) / 2] : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2) : null;
    items.sort((a, b) => (a.diff ?? 9) - (b.diff ?? 9));
    return { key, kind: items[0].kind, lat: items[0].lat, lon: items[0].lon, items, median };
  });
}

/** How exactly a listing is placed: at its building, or only at its street / neighbourhood / city. */
export function precision(l: Listing): "building" | "street" | "area" {
  if (l.kind === "mine") return "located" in l ? (l.located === "address" ? "building" : l.located === "street" ? "street" : "area") : "area";
  if ("house" in l && l.house) return "building";
  return "street" in l && l.street ? "street" : "area";
}
export type MyInput = { id: string; loc: number; street: string; house: string; rooms: number | null; area: number; price: number; added: string };

/** The local Yad2 snapshot. Absent on deployed sites (the API answers available: false). */
export function useSnapshot() {
  const [s, setS] = useState<{ available: boolean; taken_at?: string; listings?: ForSale[] } | null>(null);
  useEffect(() => { fetch("/api/listings").then((r) => r.json()).then(setS).catch(() => setS({ available: false })); }, []);
  return s;
}

const KEY = "nadlan.myListings.v1";
function readStore(): MyInput[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function writeStore(v: MyInput[]) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: keep in memory only */ }
}

/** Listings the user adds. Kept in this browser only; placed and compared by the server on load. */
export function useMyListings() {
  const [inputs, setInputs] = useState<MyInput[]>([]);
  const [placed, setPlaced] = useState<Map<string, Placed>>(new Map());
  const compare = useCallback(async (items: MyInput[]): Promise<Placed[]> => {
    if (!items.length) return [];
    const r = await fetch("/api/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
    const { listings } = (await r.json()) as { listings: Placed[] };
    setPlaced((m) => { const n = new Map(m); for (const l of listings) n.set(l.id, l); return n; });
    return listings;
  }, []);
  useEffect(() => {
    const v = readStore();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from localStorage after hydration
    setInputs(v);
    compare(v);
  }, [compare]);
  const add = useCallback(async (items: MyInput[]) => {
    const next = [...readStore(), ...items];
    writeStore(next);
    setInputs(next);
    return compare(items);
  }, [compare]);
  const remove = useCallback((id: string) => {
    const next = readStore().filter((x) => x.id !== id);
    writeStore(next);
    setInputs(next);
  }, []);
  const listings: Listing[] = inputs.flatMap((i) => {
    const p = placed.get(i.id);
    return p ? [{ ...p, ...i, kind: "mine" as const }] : [];
  });
  return { listings, count: inputs.length, add, remove };
}

const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Filter-panel section: the snapshot toggle and the user's own listings. */
export function ForSalePanel({
  snapshot, showSnapshot, setShowSnapshot, onZoom, onAdded, mine,
}: {
  onAdded: (placed: Placed[]) => void;
  snapshot: ReturnType<typeof useSnapshot>;
  showSnapshot: boolean;
  setShowSnapshot: (v: boolean) => void;
  onZoom: () => void;
  mine: ReturnType<typeof useMyListings>;
}) {
  const { lang, t } = useLang();
  const [mode, setMode] = useState<"" | "form" | "csv">("");
  return (
    <div className={styles.forsale}>
      <span className="flabel">{t("Homes for sale", "דירות למכירה")}</span>
      {snapshot?.available && (
        <label className="check">
          <input type="checkbox" checked={showSnapshot} onChange={(e) => setShowSnapshot(e.target.checked)} />
          <span>
            {t(`Yad2 snapshot, ${fmtDate(snapshot.taken_at!, lang)}`, `צילום מצב של יד2, ${fmtDate(snapshot.taken_at!, lang)}`)}
            <span className={styles.hint}>
              {t(
                `${fmtInt(snapshot.listings?.length)} listings in Givatayim and Ramat Gan. Local demo, not on the public site.`,
                `${fmtInt(snapshot.listings?.length)} מודעות בגבעתיים וברמת גן. הדגמה מקומית, לא באתר הציבורי.`,
              )}{" "}
              {showSnapshot && <button type="button" className={styles.linkBtn} onClick={onZoom}>{t("Zoom to them", "התקרבות אליהן")}</button>}
            </span>
          </span>
        </label>
      )}
      <div className={styles.mineRow}>
        <span className="ink2">{t(`My listings: ${mine.count}`, `המודעות שלי: ${mine.count}`)}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn ghost" aria-pressed={mode === "form"} onClick={() => setMode(mode === "form" ? "" : "form")}>{t("Add", "הוספה")}</button>
          <button className="btn ghost" aria-pressed={mode === "csv"} onClick={() => setMode(mode === "csv" ? "" : "csv")}>{t("Import", "ייבוא")}</button>
        </div>
      </div>
      {mode === "form" && <AddForm onAdd={async (x) => { onAdded(await mine.add([x])); setMode(""); }} />}
      {mode === "csv" && <CsvImport onAdd={async (xs) => onAdded(await mine.add(xs))} onClose={() => setMode("")} />}
      {mine.count > 0 && mode === "" && (
        <span className={styles.hint}>{t("Saved in this browser only.", "נשמרות בדפדפן הזה בלבד.")}</span>
      )}
      {mode === "" && mine.count === 0 && (
        <span className={styles.hint}>{t("Add a listing from any site to pin it and compare it with recent sales.", "אפשר להוסיף מודעה מכל אתר, לנעוץ אותה במפה ולהשוות למכירות האחרונות.")}</span>
      )}
    </div>
  );
}

function AddForm({ onAdd }: { onAdd: (x: MyInput) => Promise<void> }) {
  const { lang, t } = useLang();
  const [city, setCity] = useState<Locality | null>(null);
  const [streets, setStreets] = useState<{ street: string }[]>([]);
  const [f, setF] = useState({ street: "", house: "", rooms: "", area: "", price: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (city) fetch(`/api/streets?loc=${city.code}`).then((r) => r.json()).then(setStreets);
  }, [city]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!city) return;
    setBusy(true);
    await onAdd({
      id: newId(), loc: city.code, street: f.street.trim(), house: f.house.trim(), rooms: Number(f.rooms) || null,
      area: Number(f.area), price: Number(f.price), added: new Date().toISOString(),
    });
    setBusy(false);
  };
  return (
    <form className={styles.addForm} onSubmit={submit}>
      {city ? (
        <div className="tag" style={{ height: 34, borderRadius: 6, justifyContent: "space-between" }}>
          {cityName(city, lang)}
          <button type="button" aria-label={t("Change city", "החלפת יישוב")} onClick={() => setCity(null)}>×</button>
        </div>
      ) : <CityPicker onPick={setCity} />}
      <div className={styles.formRow}>
        <input className="input he" dir="auto" list="add-streets" placeholder={t("Street", "רחוב")} value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} disabled={!city} />
        <input className="input" style={{ width: 70 }} placeholder={t("No.", "מס׳")} value={f.house} onChange={(e) => setF({ ...f, house: e.target.value })} disabled={!city} />
      </div>
      <datalist id="add-streets">{streets.map((s) => <option key={s.street} value={s.street} />)}</datalist>
      <div className={styles.formRow}>
        <input className="input" type="number" step="0.5" min={1} max={12} placeholder={t("Rooms", "חדרים")} value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value })} />
        <input className="input" type="number" min={15} max={600} required placeholder={t("m²", "מ״ר")} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />
      </div>
      <input className="input" type="number" min={100000} step={1000} required placeholder={t("Asking price in ₪", "מחיר מבוקש ב-₪")} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
      <button className="btn primary" type="submit" disabled={!city || busy}>{busy ? t("Adding…", "מוסיף…") : t("Pin it on the map", "נעיצה במפה")}</button>
    </form>
  );
}

/** Letters and digits only, lower case: "Tel Aviv-Yafo" and "tel aviv yafo" compare equal. */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * One listing per line: city, street, house number, rooms, m², asking price (comma or tab separated).
 * The city can be its Hebrew or English name, a unique start of one ("Tel Aviv"), or its code.
 */
function CsvImport({ onAdd, onClose }: { onAdd: (xs: MyInput[]) => Promise<void>; onClose: () => void }) {
  const { t } = useLang();
  const locs = useLocalities();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const names = locs.flatMap((l) => [[norm(l.name_he), l.code], [norm(l.name_en ?? ""), l.code], [String(l.code), l.code]] as [string, number][]).filter(([k]) => k);
    const findCity = (s: string) => {
      const k = norm(s ?? "");
      if (!k) return undefined;
      const exact = names.find(([n]) => n === k);
      if (exact) return exact[1];
      const starts = [...new Set(names.filter(([n]) => n.startsWith(k)).map(([, c]) => c))];
      return starts.length === 1 ? starts[0] : undefined;
    };
    const out: MyInput[] = [];
    const bad: string[] = [];
    for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const [city, street, house, rooms, area, price] = line.split(/\t|,/).map((x) => x.trim());
      if (/^(city|עיר|יישוב)$/i.test(city)) continue;  // header row
      const loc = findCity(city);
      const a = Number(area), p = Number(String(price ?? "").replace(/[^\d.]/g, ""));
      if (!loc || !(a > 0) || !(p > 0)) { bad.push(line); continue; }
      out.push({ id: newId(), loc, street: street ?? "", house: house ?? "", rooms: Number(rooms) || null, area: a, price: p, added: new Date().toISOString() });
    }
    setBusy(true);
    if (out.length) await onAdd(out);
    setBusy(false);
    if (!bad.length) return onClose();
    // Keep the lines that failed, so they can be fixed and imported again.
    setText(bad.join("\n"));
    setErr(t(
      `${out.length ? `Added ${out.length}. ` : ""}Couldn't read ${bad.length === 1 ? "this line" : "these lines"}: check the city name and that size and price are numbers.`,
      `${out.length ? `נוספו ${out.length}. ` : ""}לא הצלחתי לקרוא ${bad.length === 1 ? "את השורה הזו" : "את השורות האלה"}: כדאי לבדוק את שם היישוב ושהשטח והמחיר הם מספרים.`,
    ));
  };
  return (
    <div className={styles.addForm}>
      <textarea className="input" rows={5} dir="auto" style={{ height: "auto", padding: 8, fontFamily: "inherit" }}
        placeholder={t("city, street, number, rooms, m², price\nגבעתיים, כצנלסון, 50, 4, 95, 3900000", "עיר, רחוב, מספר, חדרים, מ״ר, מחיר\nגבעתיים, כצנלסון, 50, 4, 95, 3900000")}
        value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} />
      {err && <span className={styles.hint} style={{ color: "var(--neg, #c0392b)" }}>{err}</span>}
      <button className="btn primary" onClick={run} disabled={!text.trim() || busy}>{busy ? t("Adding…", "מוסיף…") : t("Pin them on the map", "נעיצה במפה")}</button>
    </div>
  );
}

/** Drawer card for one listing. */
export function ListingCard({ l, onClose, onBack, onShowSales, onRemove }: { l: Listing; onClose: () => void; onBack?: () => void; onShowSales: () => void; onRemove: (id: string) => void }) {
  const { lang, t } = useLang();
  const locs = useLocalities();
  const city = locs.find((x) => x.code === l.loc);
  const S = (v: number | null) => <bdi>{fmtShekel(v, lang)}</bdi>;
  const street = "street" in l && l.street ? `${l.street}${l.house ? " " + l.house : ""}` : null;
  const check = `/price-check?loc=${l.loc}&rooms=${Math.min(6, Math.max(2, Math.round(l.rooms ?? 4)))}&area=${Math.round(l.area)}&ask=${Math.round(l.price)}${"street" in l && l.street ? `&street=${encodeURIComponent(l.street)}` : ""}`;
  return (
    <aside className={styles.drawer} aria-label={t("Listing", "מודעה")}>
      <div className={styles.drawerHead}>
        <div>
          <h2 dir="auto">{street ?? t("Listing", "מודעה")}</h2>
          <p className="ink2">
            {cityName(city, lang)}
            {"neighborhood" in l && l.neighborhood ? `, ${l.neighborhood}` : ""}
            {" · "}
            {l.kind === "yad2" ? t("Yad2 snapshot", "צילום מצב של יד2") : t("My listing", "המודעה שלי")}
          </p>
        </div>
        <button className="icon-btn" aria-label={t("Close", "סגירה")} onClick={onClose}>✕</button>
      </div>
      <div className={styles.drawerBody}>
        {onBack && <button className={styles.linkBtn} style={{ marginTop: 10 }} onClick={onBack}>{t("← All listings here", "→ כל המודעות כאן")}</button>}
        <div className={styles.listPrice}><strong className="num">{S(l.price)}</strong></div>
        <div className={styles.dealMeta}>
          {l.rooms != null && <span>{l.rooms} {t("rooms", "חדרים")}</span>}
          <span className="num">{Math.round(l.area)} {t("m²", "מ״ר")}</span>
          {"floor" in l && l.floor != null && <span>{t("floor", "קומה")} {l.floor}</span>}
          {"property" in l && l.property && <span>{l.property}</span>}
          {"seller" in l && l.seller && <span>{l.seller === "private" ? t("private seller", "בעלים פרטיים") : t("broker", "תיווך")}</span>}
        </div>
        <Verdict l={l} lang={lang} t={t} />
        {l.kind === "mine" && "located" in l && l.located !== "address" && (
          <p className={styles.hint}>
            {l.located === "street"
              ? t("Pinned at the middle of the street: we have no sale at this house number.", "ננעץ באמצע הרחוב: אין לנו מכירה במספר הבית הזה.")
              : t("Pinned at the city centre: we couldn't find the street among the sales.", "ננעץ במרכז היישוב: לא מצאנו את הרחוב במכירות.")}
          </p>
        )}
        {l.kind === "yad2" && precision(l) !== "building" && (
          <p className={styles.hint}>
            {precision(l) === "street"
              ? t("Approximate location: the ad gives no house number, so Yad2 places it at the middle of the street.", "מיקום מקורב: במודעה אין מספר בית, ולכן יד2 ממקמת אותה באמצע הרחוב.")
              : t("Approximate location: the ad gives no street, so Yad2 places it at the centre of the neighbourhood.", "מיקום מקורב: במודעה אין רחוב, ולכן יד2 ממקמת אותה במרכז השכונה.")}
          </p>
        )}
        <div className={styles.cardActions}>
          <Link className="btn primary" href={check}>{t("Full price check", "בדיקת מחיר מלאה")}</Link>
          <button className="btn" onClick={onShowSales}>{t("Sales at this spot", "מכירות במקום הזה")}</button>
          {l.kind === "yad2" && <a className="btn ghost" href={`https://www.yad2.co.il/realestate/item/${l.id}`} target="_blank" rel="noreferrer">{t("Ad on Yad2", "המודעה ביד2")}</a>}
          {l.kind === "mine" && <button className="btn ghost" onClick={() => { onRemove(l.id); onClose(); }}>{t("Remove", "הסרה")}</button>}
        </div>
      </div>
    </aside>
  );
}

/** Drawer for several listings at one point: why they share it, then each with its verdict. */
export function ListingGroup({ g, onClose, onPick }: { g: Group; onClose: () => void; onPick: (l: Listing) => void }) {
  const { lang, t } = useLang();
  const locs = useLocalities();
  const first = g.items[0];
  const city = cityName(locs.find((x) => x.code === first.loc), lang);
  const where = precision(first);
  const street = "street" in first && first.street ? first.street : null;
  const nb = "neighborhood" in first && first.neighborhood ? first.neighborhood : null;
  const title = where === "building" && street
    ? `${street} ${"house" in first ? first.house : ""}`
    : where === "street" && street ? street : nb ?? city;
  return (
    <aside className={styles.drawer} aria-label={t("Listings here", "מודעות כאן")}>
      <div className={styles.drawerHead}>
        <div>
          <h2 dir="auto">{title}</h2>
          <p className="ink2">{city} · {t(`${g.items.length} listings`, `${g.items.length} מודעות`)}</p>
        </div>
        <button className="icon-btn" aria-label={t("Close", "סגירה")} onClick={onClose}>✕</button>
      </div>
      <p className={styles.note}>
        {where === "building"
          ? t("These ads are all in one building.", "כל המודעות האלה באותו בניין.")
          : where === "street"
            ? t("These ads give no house number, so Yad2 places them all at the middle of the street. Their real locations are somewhere along it.", "במודעות האלה אין מספר בית, ולכן יד2 ממקמת את כולן באמצע הרחוב. המיקום האמיתי שלהן איפשהו לאורכו.")
            : t("These ads give no street, so Yad2 places them all at the centre of the neighbourhood.", "במודעות האלה אין רחוב, ולכן יד2 ממקמת את כולן במרכז השכונה.")}
        {g.median != null && <> {t("Median:", "חציון:")} <strong>{fmtDiff(g.median)}</strong> {t("vs recent sales.", "מול המכירות האחרונות.")}</>}
      </p>
      <div className={styles.drawerBody}>
        <ol className={styles.dealList}>
          {g.items.map((l) => (
            <li key={l.id}>
              <button className={styles.groupRow} onClick={() => onPick(l)}>
                <span>
                  <strong className="num"><bdi>{fmtShekel(l.price, lang)}</bdi></strong>
                  <span className={styles.dealMeta}>
                    {l.rooms != null && <span>{l.rooms} {t("rooms", "חדרים")}</span>}
                    <span className="num">{Math.round(l.area)} {t("m²", "מ״ר")}</span>
                    {"floor" in l && l.floor != null && <span>{t("floor", "קומה")} {l.floor}</span>}
                  </span>
                </span>
                {l.diff != null && <span className={styles.verdictChip} style={{ background: diffColor(l.diff) }}>{fmtDiff(l.diff)}</span>}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function Verdict({ l, lang, t }: { l: Listing; lang: Lang; t: T }) {
  const S = (v: number | null) => <bdi>{fmtShekel(v, lang)}</bdi>;
  if (l.diff == null || l.comp_ppsqm == null) {
    return <p className="ink2">{t("Too few comparable sales to judge this price.", "אין מספיק מכירות דומות כדי להעריך את המחיר.")}</p>;
  }
  const where = l.scope === "nearby" ? t("within 750 m", "ברדיוס 750 מ׳") : t("in the city", "ביישוב");
  const bucket = BUCKETS.find((b) => l.diff! <= b.max)!;
  return (
    <div className={styles.verdictBox} style={{ borderInlineStartColor: bucket.color }}>
      <div className={styles.verdictHead}>
        <span className={styles.verdictChip} style={{ background: bucket.color }}>{fmtDiff(l.diff)}</span>
        <span>
          {Math.abs(l.diff) < 0.03
            ? t("In line with recent sales", "בהתאם למכירות האחרונות")
            : l.diff > 0 ? t("Above recent sales", "מעל המכירות האחרונות") : t("Below recent sales", "מתחת למכירות האחרונות")}
        </span>
      </div>
      <p>
        {t(
          <>Asking {S(l.ppsqm)} per m². Similar homes {where} sold for a median {S(l.comp_ppsqm)} per m² at today&rsquo;s prices ({fmtInt(l.n_comps)} sales in the last two years, same rooms ±½, size ±25%).</>,
          <>מבוקש {S(l.ppsqm)} למ״ר. דירות דומות {where} נמכרו בחציון של {S(l.comp_ppsqm)} למ״ר במחירי היום ({fmtInt(l.n_comps)} מכירות בשנתיים האחרונות, אותו מספר חדרים ±½, שטח ±25%).</>,
        )}
      </p>
    </div>
  );
}

/** Legend block for the for-sale layers. */
export function ForSaleLegend() {
  const { lang, t } = useLang();
  return (
    <div className={styles.fsLegend}>
      <div className={styles.scaleLabel}>{t("Asking price per m² vs recent sales", "מחיר מבוקש למ״ר מול מכירות אחרונות")}</div>
      <div className={styles.fsKeys}>
        {BUCKETS.map((b) => (
          <span key={b.color}><i style={{ background: b.color }} />{lang === "he" ? b.he : b.en}</span>
        ))}
      </div>
    </div>
  );
}
