import { Suspense } from "react";
import type { Metadata } from "next";
import { getLang } from "@/lib/lang.server";
import { MapExplorer } from "./MapExplorer";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getLang();
  return { title: t("Map", "מפה") };
}

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lat = Number(sp.lat), lon = Number(sp.lon);
  const focus = Number.isFinite(lat) && Number.isFinite(lon) && sp.lat && sp.lon ? { lat, lon, z: Number(sp.z ?? 17) } : undefined;
  return (
    <main>
      <Suspense>
        <MapExplorer focus={focus} />
      </Suspense>
    </main>
  );
}
