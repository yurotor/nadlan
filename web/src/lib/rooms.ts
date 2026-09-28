/** Room-count presets used by filters: value → [min, max]. */
export const ROOM_PRESETS: { value: string; label: string; labelHe?: string; min?: number; max?: number }[] = [
  { value: "", label: "Any", labelHe: "הכל" },
  { value: "1-2", label: "\u20661–2\u2069", min: 1, max: 2.5 },
  { value: "3", label: "3", min: 3, max: 3.5 },
  { value: "4", label: "4", min: 4, max: 4.5 },
  { value: "5", label: "5", min: 5, max: 5.5 },
  { value: "6+", label: "\u20666+\u2069", min: 6 },
];

export function roomsParams(v: string) {
  const p = ROOM_PRESETS.find((r) => r.value === v);
  const out: Record<string, string> = {};
  if (p?.min != null) out.rmin = String(p.min);
  if (p?.max != null) out.rmax = String(p.max);
  return out;
}

export const YEARS = Array.from({ length: 2026 - 1998 + 1 }, (_, i) => 1998 + i);

/** Turn page state {from:'2021', to:'2026', rooms:'3', ...} into API filter params. */
export function toApiParams(s: Record<string, string>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (!v) continue;
    if (k === "from") p.set("from", `${v}-01-01`);
    else if (k === "to") p.set("to", `${v}-12-31`);
    else if (k === "rooms") for (const [a, b] of Object.entries(roomsParams(v))) p.set(a, b);
    else p.set(k, v);
  }
  return p;
}
