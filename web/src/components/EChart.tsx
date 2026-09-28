"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

export type Tokens = {
  ink: string; ink2: string; muted: string; grid: string; axis: string; surface: string; paper: string;
  brand: string; series: string[]; seq: string[]; font: string; rtl: boolean;
};

export function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    ink: v("--ink"), ink2: v("--ink-2"), muted: v("--muted"), grid: v("--grid"), axis: v("--axis"),
    surface: v("--surface"), paper: v("--paper"), brand: v("--brand"),
    series: ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"].map(v),
    seq: [1, 2, 3, 4, 5, 6, 7].map((i) => v(`--seq-${i}`)),
    font: getComputedStyle(document.body).fontFamily,
    rtl: document.documentElement.dir === "rtl",
  };
}

/** Shared chart chrome: recessive hairline grid, muted axes, surface-coloured tooltip. */
export function base(t: Tokens): EChartsOption {
  return {
    animationDuration: 400,
    textStyle: { fontFamily: t.font, color: t.ink2 },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: t.surface,
      borderColor: t.axis,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.ink, fontSize: 13, fontFamily: t.font },
      axisPointer: { type: "line", lineStyle: { color: t.muted, width: 1, type: "solid" } },
      extraCssText: `box-shadow: 0 6px 20px rgba(0,0,0,.12); border-radius: 8px; direction: ${t.rtl ? "rtl" : "ltr"}; text-align: start;`,
    },
  };
}

/** Time-axis tick labels: the year at January, otherwise a short month in the UI language. */
// ECharts places time ticks at local midnight, so read them in local time.
export const timeLabel = (lang: "he" | "en") => (v: number) => {
  const d = new Date(v);
  if (d.getMonth() === 0) return String(d.getFullYear());
  return new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-GB", { month: "short" }).format(d);
};

export const axisStyle = (t: Tokens) => ({
  axisLine: { lineStyle: { color: t.axis } },
  axisTick: { show: false },
  axisLabel: { color: t.muted, fontSize: 12 },
  splitLine: { lineStyle: { color: t.grid, width: 1 } },
});

/**
 * Right-to-left pages: time still runs left to right, but the value axis sits on the right,
 * where Hebrew readers start. Grid padding is mirrored to match.
 */
function localize(o: EChartsOption, rtl: boolean): EChartsOption {
  if (!rtl) return o;
  const ys = (Array.isArray(o.yAxis) ? o.yAxis : o.yAxis ? [o.yAxis] : []) as { position?: string }[];
  ys.forEach((y) => (y.position = "right"));
  if (o.grid && !Array.isArray(o.grid)) {
    const g = o.grid as { left?: number; right?: number };
    o.grid = { ...o.grid, left: g.right, right: g.left } as EChartsOption["grid"];
  }
  return o;
}
const render = (build: (t: Tokens) => EChartsOption) => {
  const t = readTokens();
  return localize(build(t), t.rtl);
};

export function EChart({
  build, className = "chart", label, onClick,
}: {
  build: (t: Tokens) => EChartsOption;
  className?: string;
  label: string;
  onClick?: (p: { dataIndex: number; seriesIndex?: number; name: string }) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const buildRef = useRef(build);
  const clickRef = useRef(onClick);
  useLayoutEffect(() => {
    buildRef.current = build;
    clickRef.current = onClick;
  });

  useEffect(() => {
    const c = echarts.init(el.current!, undefined, { renderer: "svg" });
    chart.current = c;
    c.on("click", (p) => clickRef.current?.(p as never));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current!);
    const retheme = () => c.setOption(render(buildRef.current), true);
    window.addEventListener("themechange", retheme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", retheme);
    return () => {
      ro.disconnect();
      window.removeEventListener("themechange", retheme);
      mq.removeEventListener("change", retheme);
      c.dispose();
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(render(build), true);
  }, [build]);

  // SVG text inherits the page direction, which would flip every label's anchor on RTL pages.
  return <div ref={el} className={className} role="img" aria-label={label} dir="ltr" />;
}
