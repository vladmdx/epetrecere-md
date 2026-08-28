"use client";

/**
 * Handwritten signature pad — mouse on desktop, finger on touch devices.
 *
 * Drawn with Pointer Events so one code path covers mouse, touch and stylus.
 * The canvas is sized to its container in device pixels (devicePixelRatio) so
 * the stroke is crisp on retina screens instead of blurry.
 *
 * Exports a PNG data URL. It also reports whether the drawing is substantial
 * enough to count: a stray tap must not pass as a signature, so we require a
 * minimum amount of ink AND a minimum bounding box.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

const STROKE_COLOR = "#0D0D0D";
const LINE_WIDTH = 2.2;
/** Ink and size thresholds that separate a signature from an accidental dot. */
const MIN_POINTS = 18;
const MIN_SPAN_PX = 60;

export interface SignatureValue {
  /** PNG data URL, or null while the pad is empty/insufficient. */
  dataUrl: string | null;
  isValid: boolean;
}

export function SignaturePad({
  onChange,
  height = 180,
}: {
  onChange?: (v: SignatureValue) => void;
  height?: number;
}) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const points = useRef(0);
  const bounds = useRef({ minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 });
  const [hasInk, setHasInk] = useState(false);
  /** Mirrors isSubstantial() so the "too small" hint re-renders as you draw —
   *  reading the refs during render never updated it. */
  const [isSubstantialNow, setIsSubstantialNow] = useState(false);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(height * dpr);
    const c = canvas.getContext("2d");
    if (!c) return;
    c.scale(dpr, dpr);
    c.lineWidth = LINE_WIDTH;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = STROKE_COLOR;
    // Opaque white so the exported PNG reads on any background (email, PDF).
    c.fillStyle = "#FFFFFF";
    c.fillRect(0, 0, rect.width, height);
  }, [height]);

  /**
   * Callers pass an inline arrow, so `onChange` is a new function on every
   * parent render. Holding it in a ref keeps it out of the effect's
   * dependencies below — with it in there, finishing a stroke set parent
   * state, the parent re-rendered, the effect re-ran, and `setup()` painted
   * the canvas white again. The signature vanished the instant the mouse
   * came up, which read as "signing does not work".
   */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setup();
    // Resizing has to re-scale the backing store, which clears it. Carry the
    // drawing across instead of discarding it: someone who has already signed
    // should not lose it because they turned their phone or opened devtools.
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const previous = points.current > 0 ? canvas.toDataURL("image/png") : null;
      setup();
      if (!previous) return;
      const img = new Image();
      img.onload = () => {
        const c = canvasRef.current?.getContext("2d");
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!c || !rect) return;
        c.drawImage(img, 0, 0, rect.width, height);
      };
      img.src = previous;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup, height]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function isSubstantial(): boolean {
    const b = bounds.current;
    const spanX = b.maxX - b.minX;
    const spanY = b.maxY - b.minY;
    return points.current >= MIN_POINTS && Math.max(spanX, spanY) >= MIN_SPAN_PX;
  }

  function emit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ok = isSubstantial();
    onChangeRef.current?.({
      dataUrl: ok ? canvas.toDataURL("image/png") : null,
      isValid: ok,
    });
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const c = ctx();
    if (!c) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pos(e);
    c.beginPath();
    c.moveTo(p.x, p.y);
    track(p);
    setHasInk(true);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const c = ctx();
    if (!c) return;
    const p = pos(e);
    c.lineTo(p.x, p.y);
    c.stroke();
    track(p);
  }

  function track(p: { x: number; y: number }) {
    points.current += 1;
    const b = bounds.current;
    b.minX = Math.min(b.minX, p.x);
    b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxY = Math.max(b.maxY, p.y);
    // Only on the transition, so this is not a setState per pointermove.
    const ok = isSubstantial();
    setIsSubstantialNow((was) => (was === ok ? was : ok));
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    emit();
  }

  function clear() {
    setup();
    points.current = 0;
    bounds.current = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 };
    setHasInk(false);
    setIsSubstantialNow(false);
    onChangeRef.current?.({ dataUrl: null, isValid: false });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("legal.drawSignature")}
        </label>
        {hasInk && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
          >
            <Eraser className="h-3.5 w-3.5" />
            {t("legal.clearSignature")}
          </button>
        )}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-white">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height, touchAction: "none", cursor: "crosshair" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label={t("legal.drawSignature")}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-[#9A9A8C]">
            <PenLine className="h-4 w-4" />
            {t("legal.drawHint")}
          </div>
        )}
        {/* Signature baseline, like on paper */}
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-[#D4CFC4]" />
      </div>

      {hasInk && !isSubstantialNow && (
        <p className="mt-1 text-xs text-amber-500">
          {t("legal.signatureTooSmall")}
        </p>
      )}
    </div>
  );
}
