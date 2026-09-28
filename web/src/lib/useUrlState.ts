"use client";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filter state kept in the URL so every view is shareable. Empty strings remove the key. */
export function useUrlState<K extends string>(defaults: Record<K, string>) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();

  const state = useMemo(() => {
    const s = { ...defaults };
    for (const k of Object.keys(defaults) as K[]) {
      const v = sp.get(k);
      if (v != null) s[k] = v;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const set = useCallback(
    (patch: Partial<Record<K, string>>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch) as [K, string][]) {
        if (v === "" || v == null || v === defaults[k]) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sp, path, router],
  );

  /** Query string for the API: explicit state including defaults. */
  const apiQuery = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(state) as [K, string][]) if (v !== "") p.set(k, v);
    return p.toString();
  }, [state]);

  return [state, set, apiQuery] as const;
}

