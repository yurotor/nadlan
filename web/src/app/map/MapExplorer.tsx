"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import { useUrlState } from "@/lib/useUrlState";
import { ROOM_PRESETS, YEARS, toApiParams } from "@/lib/rooms";
import { CityPicker } from "@/components/CityPicker";
import { cityName, fmtDate, fmtInt, fmtShekel, fmtShekelShort } from "@/lib/format";
import { classLabel, natureLabel } from "@/lib/natures";
import { useLang } from "@/components/LangProvider";
import type { Lang, T } from "@/lib/i18n";
import styles from "./map.module.css";

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const POINT_ZOOM = 15;

type Feature = { lat: number; lon: number; n: number; p: number | null; exact?: boolean; n_exact?: number; street?: string; house?: string; last?: string };
type MapResp = { mode: "cells" | "points"; features: Feature[]; breaks: number[] };
type Deal = {
  id: string; date: string; nature: string; cls: string; price: number | null; declared: number | null; portion: number | null;
  area: number | null; rooms: number | null; year_built: number | null; ppsqm: number | null; street: string | null; house: string | null;
  address_source: string; location_level: string; spread_m: number | null; gush: number; helka: number; sub_parcels: string;
  name_he: string | null; name_en: string | null;
};

const DEFAULTS = { from: "2021", to: "2026", kind: "homes", type: "", rooms: "", exact: "" };

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}
function seq() {
  const cs = getComputedStyle(document.documentElement);
  return [1, 2, 3, 4, 5, 6, 7].map((i) => cs.getPropertyValue(`--seq-${i}`).trim());
}
function luminance(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Hebrew basemap labels need MapLibre's RTL shaping plugin (self-hosted, loaded on first use).
if (typeof window !== "undefined" && maplibregl.getRTLTextPluginStatus() === "unavailable") {
  maplibregl.setRTLTextPlugin("/vendor/mapbox-gl-rtl-text.js", true).catch(() => {});
}

/** Show basemap place names in the UI language. Road-number labels are left alone. */
function localizeLabels(m: MLMap, lang: Lang) {
  const field = lang === "he"
    ? ["coalesce", ["get", "name:he"], ["get", "name"]]
    : ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
  for (const l of m.getStyle()?.layers ?? []) {
    if (l.type !== "symbol" || l.id.startsWith("deals")) continue;
    const tf = m.getLayoutProperty(l.id, "text-field");
    if (!tf || JSON.stringify(tf).includes('"ref"')) continue;
    m.setLayoutProperty(l.id, "text-field", field);
  }
}

const short = (n: number) => (n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

export function MapExplorer({ focus }: { focus?: { lat: number; lon: number; z: number } }) {
  const [state, set] = useUrlState(DEFAULTS);
  const { lang, t } = useLang();
  const langRef = useRef(lang);
  const filterQs = useMemo(() => toApiParams(state).toString(), [state]);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [resp, setResp] = useState<MapResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ lat: number; lon: number } | null>(focus ? { lat: focus.lat, lon: focus.lon } : null);
  const [dealsRes, setDealsRes] = useState<{ key: string; rows: Deal[] } | null>(null);
  // null = default: open on wide screens, collapsed on phones (decided in CSS to avoid a hydration flash).
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const reqId = useRef(0);
  const filterRef = useRef(filterQs);
  useEffect(() => { filterRef.current = filterQs; }, [filterQs]);

  const load = useCallback(async () => {
    const m = map.current;
    if (!m) return;
    const b = m.getBounds();
    const z = Math.floor(m.getZoom());
    const id = ++reqId.current;
    setLoading(true);
    const url = `/api/map?bbox=${[b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => x.toFixed(5)).join(",")}&z=${z}&${filterRef.current}`;
    const r: MapResp = await fetch(url).then((x) => x.json());
    if (id !== reqId.current) return;
    setResp(r);
    setLoading(false);
  }, []);

  // Map setup (once).
  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current!,
      style: isDark() ? STYLE.dark : STYLE.light,
      center: focus ? [focus.lon, focus.lat] : [34.95, 31.9],
      zoom: focus?.z ?? 7.6,
      minZoom: 6,
      maxZoom: 19,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.on("error", (e) => console.error("[map]", e.error?.message ?? e));
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map: MLMap }).__map = m;
    const addLayers = () => {
      if (m.getSource("deals")) return;
      m.addSource("deals", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "deals-circle",
        type: "circle",
        source: "deals",
        paint: {
          "circle-radius": ["get", "r"],
          "circle-color": ["get", "color"],
          "circle-opacity": ["case", ["get", "approx"], 0.18, 0.85],
          "circle-stroke-color": ["case", ["get", "approx"], ["get", "color"], isDark() ? "#151b1f" : "#ffffff"],
          "circle-stroke-width": ["case", ["get", "approx"], 1.5, 1],
        },
      });
      m.addLayer({
        id: "deals-label",
        type: "symbol",
        source: "deals",
        filter: [">=", ["get", "r"], 13],
        layout: { "text-field": ["get", "label"], "text-size": 11, "text-font": ["Noto Sans Regular"], "text-allow-overlap": false },
        paint: { "text-color": ["get", "textColor"] },
      });
      m.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "sel-ring", type: "circle", source: "sel",
        paint: { "circle-radius": 14, "circle-color": "transparent", "circle-stroke-color": "#eb6834", "circle-stroke-width": 2.5 },
      });
    };
    if (!focus) {
      const wide = box.current!.clientWidth > 760;
      const rtl = document.documentElement.dir === "rtl";
      const pad = wide ? { left: rtl ? 60 : 380, right: rtl ? 380 : 60, top: 20, bottom: 20 } : 10;
      m.fitBounds([[34.25, 29.5], [35.9, 33.3]], { padding: pad, animate: false });
    }
    m.on("load", () => { addLayers(); localizeLabels(m, langRef.current); load(); });
    m.on("styledata", () => { if (m.isStyleLoaded()) addLayers(); });
    m.on("moveend", load);
    m.on("mouseenter", "deals-circle", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "deals-circle", () => (m.getCanvas().style.cursor = ""));
    m.on("click", "deals-circle", (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const pr = f.properties as { mode: string; lat: number; lon: number };
      if (pr.mode === "cells") {
        m.easeTo({ center: [pr.lon, pr.lat], zoom: Math.min(m.getZoom() + 2.5, POINT_ZOOM + 0.5) });
      } else {
        setSelected({ lat: pr.lat, lon: pr.lon });
      }
    });
    const retheme = () => {
      m.setStyle(isDark() ? STYLE.dark : STYLE.light);
      m.once("idle", () => { addLayers(); localizeLabels(m, langRef.current); load(); });
    };
    window.addEventListener("themechange", retheme);
    return () => {
      window.removeEventListener("themechange", retheme);
      map.current = null;
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Language: basemap labels, and zoom buttons on the side away from the filter panel.
  useEffect(() => {
    langRef.current = lang;
    const m = map.current;
    if (!m) return;
    if (m.isStyleLoaded()) localizeLabels(m, lang);
    const nav = new maplibregl.NavigationControl({ showCompass: false });
    m.addControl(nav, lang === "he" ? "top-left" : "top-right");
    return () => { if (map.current === m) m.removeControl(nav); };
  }, [lang]);

  // Reload when filters change.
  useEffect(() => { if (map.current?.loaded()) load(); }, [filterQs, load]);

  // Push data into the source.
  const breaks = resp?.breaks ?? [];
  useEffect(() => {
    const m = map.current;
    const src = m?.getSource("deals") as GeoJSONSource | undefined;
    if (!m || !src || !resp) return;
    const ramp = seq();
    const dark = isDark();
    const color = (p: number | null) => {
      if (p == null) return dark ? "#5b666e" : "#a3acb2";
      let i = 0;
      while (i < resp.breaks.length && p > resp.breaks[i]) i++;
      return ramp[i];
    };
    const maxN = Math.max(1, ...resp.features.map((f) => f.n));
    src.setData({
      type: "FeatureCollection",
      features: resp.features.map((f) => {
        const r = resp.mode === "cells"
          ? 5 + 21 * Math.sqrt(f.n / maxN)
          : 4 + Math.min(9, Math.sqrt(f.n) * 1.6);
        const c = color(f.p);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [f.lon, f.lat] },
          properties: {
            mode: resp.mode, lat: f.lat, lon: f.lon, n: f.n, r,
            color: c,
            approx: resp.mode === "points" && !f.exact,
            label: resp.mode === "cells" ? short(f.n) : f.n > 1 ? String(f.n) : "",
            textColor: luminance(c) < 0.35 ? "#ffffff" : "#16202a",
          },
        };
      }),
    });
  }, [resp]);

  // Selected location: ring + deals list.
  useEffect(() => {
    const m = map.current;
    const put = () => {
      const src = m?.getSource("sel") as GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: selected ? [{ type: "Feature", geometry: { type: "Point", coordinates: [selected.lon, selected.lat] }, properties: {} }] : [],
      });
    };
    if (m?.isStyleLoaded()) put(); else m?.once("idle", put);
    if (!selected) return;
    const key = `${selected.lat},${selected.lon},${filterQs}`;
    const ctl = new AbortController();
    fetch(`/api/map/point?lat=${selected.lat}&lon=${selected.lon}&${filterQs}`, { signal: ctl.signal })
      .then((r) => r.json()).then((rows) => setDealsRes({ key, rows })).catch(() => {});
    return () => ctl.abort();
  }, [selected, filterQs]);
  const deals = selected && dealsRes?.key === `${selected.lat},${selected.lon},${filterQs}` ? dealsRes.rows : null;

  const total = resp?.features.reduce((a, f) => a + f.n, 0) ?? 0;
  const zoomedIn = resp?.mode === "points";
  const hideLabel = t("Hide filters", "הסתרת מסננים");
  const showLabel = t("Filters", "מסננים");

  return (
    <div className={styles.wrap}>
      <div ref={box} className={styles.map} />
      {loading && <div className={`loading-bar ${styles.loading}`} />}

      <section className={styles.filters} aria-label={t("Map filters", "מסנני מפה")} data-open={panelOpen == null ? "auto" : String(panelOpen)}>
        <div className={styles.filtersHead}>
          <h1>{t("Deals map", "מפת עסקאות")}</h1>
          <button
            className="btn ghost"
            onClick={() => setPanelOpen((o) => !(o ?? window.innerWidth > 760))}
            aria-expanded={panelOpen ?? undefined}
          >
            {panelOpen == null ? (
              <><span className={styles.wide}>{hideLabel}</span><span className={styles.narrow}>{showLabel}</span></>
            ) : panelOpen ? hideLabel : showLabel}
          </button>
        </div>
        {panelOpen !== false && (
          <div className={styles.filtersBody}>
            <div className="field">
              <span className="flabel">{t("Go to city", "מעבר לעיר")}</span>
              <CityPicker
                onPick={(l) => map.current?.flyTo({ center: [l.lon, l.lat], zoom: l.n > 20000 ? 12 : 13.5 })}
              />
            </div>
            <div className="field">
              <span className="flabel">{t("Period", "תקופה")}</span>
              <div className="range">
                <select className="select" aria-label={t("From year", "משנה")} value={state.from} onChange={(e) => set({ from: e.target.value })}>
                  {YEARS.map((y) => <option key={y}>{y}</option>)}
                </select>
                {t("to", "עד")}
                <select className="select" aria-label={t("To year", "עד שנה")} value={state.to} onChange={(e) => set({ to: e.target.value })}>
                  {YEARS.map((y) => <option key={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <span className="flabel">{t("Deals shown", "עסקאות מוצגות")}</span>
              <div className="seg" role="group" aria-label={t("Deals shown", "עסקאות מוצגות")}>
                {[["homes", t("Homes", "דירות")], ["residential", t("All residential", "כל המגורים")], ["all", t("Everything", "הכל")]].map(([v, l]) => (
                  <button key={v} aria-pressed={state.kind === v} onClick={() => set({ kind: v })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="flabel">{t("Property", "סוג נכס")}</span>
              <div className="seg" role="group" aria-label={t("Property type", "סוג נכס")}>
                {[["", t("Any", "הכל")], ["apartment", t("Apartments", "דירות")], ["house", t("Houses", "בתים")]].map(([v, l]) => (
                  <button key={v} aria-pressed={state.type === v} onClick={() => set({ type: v })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="flabel">{t("Rooms", "חדרים")}</span>
              <div className="seg" role="group" aria-label={t("Rooms", "חדרים")}>
                {ROOM_PRESETS.map((r) => (
                  <button key={r.value} aria-pressed={state.rooms === r.value} onClick={() => set({ rooms: r.value })}>{t(r.label, r.labelHe ?? r.label)}</button>
                ))}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={state.exact === "1"} onChange={(e) => set({ exact: e.target.checked ? "1" : "" })} />
              {t("Only deals with an exact parcel location", "רק עסקאות עם מיקום חלקה מדויק")}
            </label>
          </div>
        )}
      </section>

      <section className={styles.legend} aria-label={t("Legend", "מקרא")} data-hidden={!!selected}>
        <div className={styles.legendRow}>
          <strong className="num">{fmtInt(total)}</strong>
          <span className="ink2">{zoomedIn ? t("deals at the locations in view", "עסקאות במיקומים שבתצוגה") : t("deals in view", "עסקאות בתצוגה")}</span>
        </div>
        <div className={styles.scaleLabel}>{t("Median price per m², relative to the area in view", "מחיר חציוני למ״ר, יחסית לאזור שבתצוגה")}</div>
        <div className={styles.scale}>
          {[1, 2, 3, 4, 5, 6, 7].map((i) => <i key={i} style={{ background: `var(--seq-${i})` }} />)}
        </div>
        <div className={`${styles.scaleTicks} num`}>
          <bdi>{breaks[0] ? fmtShekelShort(breaks[0], lang) : ""}</bdi>
          <bdi>{breaks[3] ? fmtShekelShort(breaks[3], lang) : ""}</bdi>
          <bdi>{breaks[5] ? fmtShekelShort(breaks[5], lang) : ""}</bdi>
        </div>
        <div className={styles.keyRow}>
          {zoomedIn ? (
            <>
              <span><i className={styles.dotSolid} /> {t("Exact parcel", "חלקה מדויקת")}</span>
              <span><i className={styles.dotHollow} /> {t("Approximate (old or split parcel)", "מקורב (חלקה ישנה או מפוצלת)")}</span>
            </>
          ) : (
            <span className="muted">{t("Circle size is the number of deals. Zoom in to see individual buildings.", "גודל העיגול הוא מספר העסקאות. אפשר להתקרב כדי לראות בניינים בודדים.")}</span>
          )}
        </div>
      </section>

      {selected && (
        <aside className={styles.drawer} aria-label={t("Deals at this location", "עסקאות במיקום זה")}>
          <div className={styles.drawerHead}>
            <div>
              <h2 dir="auto">{deals?.[0] ? addressOf(deals[0], t) : deals ? t("No matching deals", "אין עסקאות מתאימות") : t("Loading…", "טוען…")}</h2>
              {deals?.[0] && (
                <p className="ink2">
                  {cityName(deals[0], lang)}, {t("gush", "גוש")} {deals[0].gush} {t("parcel", "חלקה")} {deals[0].helka}
                </p>
              )}
            </div>
            <button className="icon-btn" aria-label={t("Close", "סגירה")} onClick={() => setSelected(null)}>✕</button>
          </div>
          {deals && deals[0] && <LocationNote d={deals[0]} t={t} />}
          {deals && (
            <div className={styles.drawerBody}>
              <p className={styles.count}>
                {deals.length === 300
                  ? t("The latest 300 deals matching the filters", "300 העסקאות האחרונות שמתאימות למסננים")
                  : deals.length === 1
                    ? t("1 deal matching the filters", "עסקה אחת שמתאימה למסננים")
                    : t(`${deals.length} deals matching the filters`, `${deals.length} עסקאות שמתאימות למסננים`)}
              </p>
              {deals.length === 0 && <p className="ink2">{t("No deals here match the current filters.", "אין כאן עסקאות שמתאימות למסננים הנוכחיים.")}</p>}
              <ol className={styles.dealList}>
                {deals.map((d) => (
                  <li key={d.id}>
                    <div className={styles.dealTop}>
                      <span className="num">{fmtDate(d.date, lang)}</span>
                      <strong className="num"><bdi>{fmtShekel(d.price ?? d.declared, lang)}</bdi></strong>
                    </div>
                    <div className={styles.dealMeta}>
                      <span>{natureLabel(d.nature, lang)}</span>
                      {d.rooms != null && <span>{d.rooms} {t("rooms", "חדרים")}</span>}
                      {d.area != null && <span className="num">{d.area} {t("m²", "מ״ר")}</span>}
                      {d.ppsqm != null && <bdi className="num">{fmtShekel(d.ppsqm, lang)}/{t("m²", "מ״ר")}</bdi>}
                      {d.year_built != null && <span>{t("built", "נבנה")} {d.year_built}</span>}
                    </div>
                    {d.cls !== "single_unit" && <div className={styles.dealCls}>{classLabel(d.cls, lang)}{d.portion != null && d.portion < 1 ? ` (${Math.round(d.portion * 100)}%)` : ""}</div>}
                    {d.sub_parcels && d.sub_parcels !== "0" && <div className={styles.dealCls}>{t("Sub-parcel", "תת-חלקה")} {d.sub_parcels}</div>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function addressOf(d: Deal, t: T) {
  if (d.street) return `${d.street}${d.house ? " " + d.house : ""}`;
  return t(`Gush ${d.gush}, parcel ${d.helka}`, `גוש ${d.gush}, חלקה ${d.helka}`);
}

function LocationNote({ d, t }: { d: Deal; t: T }) {
  const approxAddr = d.address_source === "nearest_address";
  const approxLoc = d.location_level === "lineage_multi" || d.location_level === "gush";
  if (!approxAddr && !approxLoc) return null;
  const spread = d.spread_m ? fmtInt(d.spread_m) : null;
  return (
    <p className={styles.note}>
      {approxLoc
        ? t(
            `Approximate location: this parcel was split or no longer exists, so the point is the centre of its successors${spread ? ` (spread ≈ ${spread} m)` : ""}.`,
            `מיקום מקורב: החלקה פוצלה או אינה קיימת עוד, ולכן הנקודה היא מרכז החלקות שהחליפו אותה${spread ? ` (פיזור של כ-${spread} מ׳)` : ""}.`,
          )
        : t(
            "The address is the nearest registered address to the parcel, not a confirmed match.",
            "הכתובת היא הכתובת הרשומה הקרובה ביותר לחלקה, ולא התאמה ודאית.",
          )}
    </p>
  );
}
