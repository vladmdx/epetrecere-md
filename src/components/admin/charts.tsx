"use client";

/**
 * The charts behind /admin/statistici.
 *
 * Hand-drawn SVG rather than a charting library: the admin needs four shapes,
 * all of them small, and a library would add ~100KB to a page that already
 * fans out a dozen queries. Everything here is one file so the visual rules
 * stay in one place.
 *
 * Colour: the two-series palette is the validated categorical pair (blue,
 * orange) — it clears CVD separation, the normal-vision floor and 3:1
 * contrast against both the light (#FAF8F2) and dark (#1A1A2E) admin
 * surfaces. Slots are assigned in fixed order and never cycled, so adding a
 * third series means adding slot 3, not reusing slot 1. Single-series charts
 * use slot 1; ranked bars use one hue because their job is magnitude, and
 * every bar is directly labelled so colour carries nothing.
 */

import { useId, useMemo, useState } from "react";
import { useLocale } from "@/hooks/use-locale";

/* ── shared frame ───────────────────────────────────────────────── */

export const SERIES = ["var(--viz-1)", "var(--viz-2)"] as const;

/**
 * Defines the palette once. Dark values are stepped for the dark surface,
 * not an automatic flip, and are declared under `.dark` because that is the
 * strategy the app's theme provider uses.
 */
export function ChartStyles() {
  return (
    <style>{`
      .viz {
        --viz-1: #2a78d6;
        --viz-2: #eb6834;
        --viz-grid: rgba(44,44,58,.10);
        --viz-axis: #6B6B7B;
        --viz-ink: #2C2C3A;
      }
      .dark .viz {
        --viz-1: #3987e5;
        --viz-2: #d95926;
        --viz-grid: rgba(250,248,242,.10);
        --viz-axis: #A0A0B0;
        --viz-ink: #FAF8F2;
      }
    `}</style>
  );
}

export function ChartCard({
  title,
  subtitle,
  legend,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: { label: string; color: string }[];
  children: React.ReactNode;
}) {
  return (
    <section className="viz rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {legend && legend.length > 1 && (
          <ul className="flex flex-wrap items-center gap-3">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: l.color }}
                />
                {l.label}
              </li>
            ))}
          </ul>
        )}
      </header>
      {children}
    </section>
  );
}

/** Empty state — a chart of nothing is worse than a sentence saying so. */
function NoData({ text }: { text: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

/**
 * A round ceiling for the axis that is also divisible by `divisions`, so
 * every gridline gets an exact label. Without the divisibility rule a max of
 * 6 printed ticks at 2.5 and 7.5 — rounded to "3" and "8" — which are not
 * values the axis actually marks.
 */
function niceMax(v: number, divisions = 4): number {
  if (!Number.isFinite(v) || v <= 0) return divisions;
  const mag = 10 ** Math.floor(Math.log10(v));
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const s of steps) {
    const candidate = s * mag;
    if (v <= candidate && Number.isInteger(candidate / divisions)) return candidate;
  }
  // Fall back to the next multiple of `divisions` above v.
  return Math.ceil(v / divisions) * divisions;
}

/** Evenly spaced, exact tick values from 0 to max. */
function ticksFor(max: number, divisions: number): number[] {
  return Array.from({ length: divisions + 1 }, (_, i) => (max / divisions) * i);
}

/* ── time series (2 series, line + crosshair) ───────────────────── */

export interface TimePoint {
  date: string;
  label: string;
  values: number[];
}

export function TimeSeriesChart({
  points,
  seriesLabels,
  emptyText,
  formatValue = (n: number) => String(n),
}: {
  points: TimePoint[];
  seriesLabels: string[];
  emptyText: string;
  formatValue?: (n: number) => string;
}) {
  const { t } = useLocale();
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 220;
  const P = { top: 12, right: 12, bottom: 26, left: 44 };

  const DIVISIONS = 4;
  const max = useMemo(
    () => niceMax(Math.max(0, ...points.flatMap((p) => p.values)), DIVISIONS),
    [points],
  );

  // Gaps are filled with explicit zeros, so "no data" arrives as a full set
  // of zero buckets rather than an empty array. Without this the reader sees
  // a flat line on the axis and cannot tell it from a broken chart.
  if (points.length === 0 || points.every((p) => p.values.every((v) => !v))) {
    return <NoData text={emptyText} />;
  }

  const innerW = W - P.left - P.right;
  const innerH = H - P.top - P.bottom;
  const x = (i: number) =>
    P.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => P.top + innerH - (v / max) * innerH;

  const ticks = ticksFor(max, DIVISIONS);
  // Enough x labels to orient without collisions.
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <figure className="m-0">
      {/* No fixed pixel height: the viewBox aspect ratio drives the size, so
          the drawing fills the card instead of being letterboxed inside it. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={t("adminUi.charts.seriesOverPeriod", {
          series: seriesLabels.join(t("adminUi.charts.and")),
        })}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round(
            ((px - P.left) / innerW) * Math.max(1, points.length - 1),
          );
          setHover(Math.min(points.length - 1, Math.max(0, i)));
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={P.left}
              x2={W - P.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
            <text
              x={P.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--viz-axis)"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={p.date}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--viz-axis)"
            >
              {p.label}
            </text>
          ) : null,
        )}

        {seriesLabels.map((_, s) => {
          const d = points
            .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.values[s] ?? 0)}`)
            .join(" ");
          const area = `${d} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
          return (
            <g key={s}>
              <defs>
                <linearGradient id={`${gid}-f${s}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[s]} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={SERIES[s]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${gid}-f${s})`} />
              <path
                d={d}
                fill="none"
                stroke={SERIES[s]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {points.length <= 24 &&
                points.map((p, i) => (
                  <circle
                    key={p.date}
                    cx={x(i)}
                    cy={y(p.values[s] ?? 0)}
                    r={hover === i ? 5 : 3.5}
                    fill={SERIES[s]}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ))}
            </g>
          );
        })}

        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={P.top}
            y2={P.top + innerH}
            stroke="var(--viz-axis)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
      </svg>

      <figcaption
        className="mt-1 flex min-h-[20px] flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        aria-live="polite"
      >
        {hover != null && points[hover] && (
          <>
            <span className="font-medium text-foreground">{points[hover]!.label}</span>
            {seriesLabels.map((l, s) => (
              <span key={l} className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: SERIES[s] }}
                />
                {l}: <b className="text-foreground">{formatValue(points[hover]!.values[s] ?? 0)}</b>
              </span>
            ))}
          </>
        )}
      </figcaption>
    </figure>
  );
}

/* ── vertical bars (single series) ──────────────────────────────── */

export function BarSeriesChart({
  points,
  emptyText,
  formatValue = (n: number) => String(n),
}: {
  points: { date: string; label: string; value: number }[];
  emptyText: string;
  formatValue?: (n: number) => string;
}) {
  const { t } = useLocale();
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 200;
  const P = { top: 12, right: 12, bottom: 26, left: 52 };

  const max = useMemo(
    () => niceMax(Math.max(0, ...points.map((p) => p.value)), 2),
    [points],
  );
  // Same as above: a zero-height rect paints nothing, so an all-zero window
  // rendered as an empty grid with no explanation.
  if (points.length === 0 || points.every((p) => !p.value)) {
    return <NoData text={emptyText} />;
  }

  const innerW = W - P.left - P.right;
  const innerH = H - P.top - P.bottom;
  // A 2px gap between neighbours keeps adjacent bars readable as separate marks.
  const slot = innerW / points.length;
  const barW = Math.max(3, Math.min(28, slot - 4));
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={t("adminUi.charts.valueOverPeriod")}
        onMouseLeave={() => setHover(null)}
      >
        {ticksFor(max, 2).map((v) => {
          const f = max > 0 ? v / max : 0;
          const yy = P.top + innerH - f * innerH;
          return (
            <g key={v}>
              <line x1={P.left} x2={W - P.right} y1={yy} y2={yy} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={P.left - 8} y={yy + 4} textAnchor="end" fontSize={10} fill="var(--viz-axis)">
                {formatValue(v)}
              </text>
            </g>
          );
        })}

        {points.map((p, i) => {
          const h = max > 0 ? (p.value / max) * innerH : 0;
          const cx = P.left + slot * i + slot / 2;
          return (
            <g key={p.date} onMouseEnter={() => setHover(i)}>
              {/* Invisible full-height hit target — the bar itself is too thin to hover. */}
              <rect x={cx - slot / 2} y={P.top} width={slot} height={innerH} fill="transparent" />
              <rect
                x={cx - barW / 2}
                y={P.top + innerH - h}
                width={barW}
                height={Math.max(h, p.value > 0 ? 2 : 0)}
                rx={4}
                fill={SERIES[0]}
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--viz-axis)">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 min-h-[20px] text-xs text-muted-foreground" aria-live="polite">
        {hover != null && points[hover] && (
          <>
            <span className="font-medium text-foreground">{points[hover]!.label}</span>{" "}
            — <b className="text-foreground">{formatValue(points[hover]!.value)}</b>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/* ── ranked horizontal bars ─────────────────────────────────────── */

export function RankedBars({
  rows,
  emptyText,
  formatValue = (n: number) => String(n),
}: {
  rows: { key: string; label: string; value: number; note?: string }[];
  emptyText: string;
  formatValue?: (n: number) => string;
}) {
  if (rows.length === 0) return <NoData text={emptyText} />;
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-foreground">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              <b className="text-foreground">{formatValue(r.value)}</b>
              {r.note ? ` · ${r.note}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, background: SERIES[0] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
