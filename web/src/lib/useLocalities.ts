"use client";
import { useEffect, useState } from "react";

export type Locality = { code: number; name_he: string; name_en: string | null; n: number; lat: number; lon: number };

let cache: Promise<Locality[]> | null = null;

export function useLocalities() {
  const [list, setList] = useState<Locality[]>([]);
  useEffect(() => {
    cache ??= fetch("/api/localities").then((r) => r.json());
    cache.then(setList);
  }, []);
  return list;
}

export const locName = (l?: Locality | null) => (l ? l.name_en || l.name_he : "");
