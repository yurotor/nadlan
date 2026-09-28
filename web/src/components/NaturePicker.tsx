"use client";
import { useEffect, useRef, useState } from "react";
import { natureLabel } from "@/lib/natures";
import { useLang } from "./LangProvider";

type Nature = { nature: string; category: string; n: number };
const GROUPS: [string, string, string][] = [
  ["residential", "Residential", "מגורים"], ["land", "Land", "קרקע"], ["commercial_other", "Commercial & other", "מסחרי ואחר"], ["building", "Buildings", "בניינים"],
];

/** Multi-select popover for deal natures. `value` is a comma-separated list of Hebrew natures. */
export function NaturePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [list, setList] = useState<Nature[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = new Set(value ? value.split(",") : []);
  const { lang, t } = useLang();

  useEffect(() => { fetch("/api/natures").then((r) => r.json()).then(setList); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const toggle = (n: string) => {
    const s = new Set(sel);
    if (s.has(n)) s.delete(n); else s.add(n);
    onChange([...s].join(","));
  };
  const label = sel.size === 0 ? t("Any type", "כל הסוגים") : sel.size === 1 ? natureLabel([...sel][0], lang) : t(`${sel.size} types`, `${sel.size} סוגים`);

  return (
    <div className="combo" ref={ref}>
      <button className="btn" style={{ minWidth: 180, justifyContent: "space-between" }} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <div className="combo-list" style={{ width: 320, padding: 8 }}>
          {sel.size > 0 && <button className="btn ghost" style={{ height: 28, marginBottom: 4 }} onClick={() => onChange("")}>{t("Clear selection", "ניקוי הבחירה")}</button>}
          {GROUPS.map(([g, glEn, glHe]) => {
            const gl = t(glEn, glHe);
            const items = list.filter((x) => x.category === g);
            if (!items.length) return null;
            return (
              <fieldset key={g} style={{ border: 0, margin: "4px 0 8px", padding: 0 }}>
                <legend style={{ fontSize: 12.5, color: "var(--muted)", padding: "4px 6px" }}>{gl}</legend>
                {items.map((x) => (
                  <label key={x.nature} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 4, cursor: "pointer", fontSize: 14 }}>
                    <input type="checkbox" checked={sel.has(x.nature)} onChange={() => toggle(x.nature)} style={{ accentColor: "var(--brand)" }} />
                    <span style={{ flex: 1 }}>{natureLabel(x.nature, lang)}</span>
                    {lang === "en" && <span className="he muted" lang="he" dir="rtl" style={{ fontSize: 13 }}>{x.nature}</span>}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}
