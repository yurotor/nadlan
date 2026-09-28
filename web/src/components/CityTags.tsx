"use client";
import { useLocalities } from "@/lib/useLocalities";
import { CityPicker } from "./CityPicker";
import { useLang } from "./LangProvider";
import { cityName } from "@/lib/format";

/** Multi-city selector: a picker plus removable tags. `value` is a comma-separated list of codes. */
export function CityTags({
  value, onChange, max = 10, colors, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  max?: number;
  colors?: string[];
  placeholder?: string;
}) {
  const all = useLocalities();
  const { lang, t } = useLang();
  placeholder ??= t("Add a city…", "הוספת עיר…");
  const codes = value ? value.split(",").map(Number) : [];
  const byCode = new Map(all.map((l) => [l.code, l]));
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {codes.length < max && (
        <CityPicker placeholder={placeholder} exclude={codes} onPick={(l) => onChange([...codes, l.code].join(","))} />
      )}
      <div className="tags">
        {codes.map((c, i) => {
          const l = byCode.get(c);
          return (
            <span className="tag" key={c}>
              {colors && <i className="swatch" style={{ background: colors[i % colors.length] }} />}
              {l ? cityName(l, lang) : c}
              <button aria-label={t(`Remove ${cityName(l, lang) || c}`, `הסרת ${cityName(l, lang) || c}`)} onClick={() => onChange(codes.filter((x) => x !== c).join(","))}>×</button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
