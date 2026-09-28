"use client";
import { useId, useMemo, useRef, useState } from "react";
import { useLocalities, type Locality } from "@/lib/useLocalities";
import { useLang } from "./LangProvider";

/** Searchable city combobox (English or Hebrew names). Calls onPick with a locality. */
export function CityPicker({
  onPick, placeholder, exclude = [], label, id,
}: {
  onPick: (l: Locality) => void;
  placeholder?: string;
  exclude?: number[];
  label?: string;
  id?: string;
}) {
  const all = useLocalities();
  const { lang, t } = useLang();
  placeholder ??= t("Search a city…", "חיפוש עיר…");
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const t = text.trim().toLowerCase();
    const ex = new Set(exclude);
    const res = all.filter((l) => !ex.has(l.code) && (!t || l.name_he.includes(t) || (l.name_en ?? "").toLowerCase().includes(t)));
    return res.slice(0, 40);
  }, [all, text, exclude]);

  const pick = (l: Locality) => {
    onPick(l);
    setText("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="combo">
      <input
        id={id}
        ref={inputRef}
        className="input"
        style={{ width: 220 }}
        role="combobox"
        aria-label={label ?? placeholder}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && matches[hi]) { e.preventDefault(); pick(matches[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && matches.length > 0 && (
        <ul className="combo-list" id={listId} role="listbox">
          {matches.map((l, i) => (
            <li key={l.code} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); pick(l); }} onMouseEnter={() => setHi(i)}>
              {lang === "he" ? (
                <>
                  <span>{l.name_he}</span>
                  {l.name_en && <span className="muted" lang="en" dir="ltr">{l.name_en}</span>}
                </>
              ) : (
                <>
                  <span>{l.name_en || l.name_he}</span>
                  <span className="he" lang="he" dir="rtl">{l.name_he}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
