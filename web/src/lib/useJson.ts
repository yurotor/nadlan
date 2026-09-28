"use client";
import { useEffect, useState } from "react";

type Result<T> = { url: string; data: T | null; error: string | null };

/** Fetch JSON for `url`; keeps the previous data while the next request is in flight. */
export function useJson<T>(url: string | null) {
  const [res, setRes] = useState<Result<T> | null>(null);
  useEffect(() => {
    if (!url) return;
    const ctl = new AbortController();
    fetch(url, { signal: ctl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
        setRes({ url, data: j, error: null });
      })
      .catch((e) => { if (e.name !== "AbortError") setRes({ url, data: null, error: e.message }); });
    return () => ctl.abort();
  }, [url]);
  return {
    data: res?.data ?? null,
    loading: url != null && res?.url !== url,
    error: res?.url === url ? res.error : null,
  };
}
