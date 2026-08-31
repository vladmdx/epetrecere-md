/**
 * The website's service icons, as data.
 *
 * Generated from public/icons/services/*.svg — the same 27 drawings the site
 * uses, so a category looks the same on a phone as it does in a browser. The
 * app was drawing a single Sparkles glyph for every category instead, which
 * made twenty-nine different services look like one.
 *
 * Data rather than files because Metro cannot import an .svg without a
 * transformer, and adding one to render twenty-seven small line drawings is a
 * poor trade. Every source file is a 32x32 stroke drawing built from paths,
 * circles, ellipses and rects, so the whole set reduces to this.
 *
 * REGENERATE when public/icons/services changes — this is a copy, and a copy
 * that drifts is worse than no copy. The generator lives in the commit that
 * added this file.
 */

export interface ServiceIconEl {
  t: "p" | "c" | "e" | "r";
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  tr?: string;
}

export interface ServiceIconDef {
  /** Stroke width in the 32x32 viewBox, as the source drawing specifies. */
  sw: number;
  els: ServiceIconEl[];
}

export const SERVICE_ICON_VIEWBOX = 32;

export const SERVICE_ICONS: Record<string, ServiceIconDef> = {"accordion":{"sw":1.45,"els":[{"t":"p","d":"M3 7h7l2 3h8l2-3h7v19h-7l-2-3h-8l-2 3H3z"},{"t":"p","d":"M10 7v19M22 7v19M13 10l2 13M16 10l1 13M19 10l-1 13M6 11h1M6 15h1M6 19h1M25 11h1M25 15h1M25 19h1"}]},"cake":{"sw":1.6,"els":[{"t":"p","d":"M6 15h20v13H6zM8 15v-4h16v4M11 11V7M16 11V6M21 11V8"},{"t":"p","d":"M10 7c1-2 2-2 3 0M15 6c1-2 2-2 3 0M20 8c1-2 2-2 3 0M6 20c3 2 5-2 8 0s5-2 8 0 4 0 4 0"}]},"camera":{"sw":1.7,"els":[{"t":"p","d":"M4 10h6l2-4h8l2 4h6v17H4z"},{"t":"c","cx":16.0,"cy":18.0,"r":6.0},{"t":"p","d":"M25 13h.01"}]},"cello":{"sw":1.5,"els":[{"t":"p","d":"M18 3v9c5 2 6 6 4 10-1 3-3 5-6 5s-5-2-6-5c-2-4-1-8 4-10V3zM14 7h4M13 17h6M16 27v3"},{"t":"p","d":"M8 5c7 8 11 15 16 24"}]},"circus":{"sw":1.45,"els":[{"t":"p","d":"M4 27h24L24 11l-8-7-8 7zM16 4v23M8 11h16M8 11l8 16M24 11l-8 16M4 27h24M7 27v3M25 27v3"},{"t":"p","d":"M13 17h6"}]},"clapperboard":{"sw":1.55,"els":[{"t":"p","d":"M4 11h24v17H4zM4 11l3-7h22l-3 7M9 4l-3 7M17 4l-3 7M25 4l-3 7"},{"t":"p","d":"m13 16 7 4-7 4z"}]},"confetti":{"sw":1.7,"els":[{"t":"p","d":"m5 27 5-14 9 9zM11 14l7 7M19 5v4M26 8l-3 3M27 16h-4M11 5l2 4"},{"t":"p","d":"M22 3c-1 3 0 5 3 6"}]},"dance-shoes":{"sw":1.55,"els":[{"t":"p","d":"M7 4c3 2 4 6 3 10-1 3 0 5 3 7 2 2 1 6-2 7-4 1-7-2-7-6 0-5 2-8 3-11 1-3-1-5 0-7zM22 5c-3 2-4 6-3 10 1 3 0 5-3 7-2 2-1 6 2 7 4 1 7-2 7-6 0-5-2-8-3-11-1-3 1-5 0-7z"},{"t":"p","d":"M5 19h7M20 19h7"}]},"dancer":{"sw":1.55,"els":[{"t":"c","cx":18.0,"cy":5.0,"r":2.5},{"t":"p","d":"M16 8c-2 4-2 7 1 10l-5 10M17 18l6 10M15 11l-7 5M16 10l7 5"},{"t":"p","d":"M12 16c-4 1-6 5-5 9 4-2 8-2 12 0 2-4 1-7-2-9"}]},"fan":{"sw":1.45,"els":[{"t":"p","d":"M6 26c2-12 8-20 20-21 2 12-4 21-20 21z"},{"t":"p","d":"M6 26 26 5M6 26l14-20M6 26 14 8M6 26 8 12M12 23l-3-4M17 19l-4-6M22 13l-5-5"}]},"flame":{"sw":1.55,"els":[{"t":"p","d":"M18 3c2 7-3 8-1 13 2-2 4-3 5-6 4 4 6 8 4 13-2 5-6 7-10 7S8 28 6 24c-3-6 1-12 6-17 0 5 1 7 3 8-1-5 2-8 3-12z"},{"t":"p","d":"M16 20c3 2 3 6 0 8-3-2-3-6 0-8z"}]},"floral":{"sw":1.55,"els":[{"t":"c","cx":16.0,"cy":14.0,"r":3.0},{"t":"p","d":"M16 11c-3-8-8-5-6-1-6-2-7 4-2 5-5 3-1 8 3 4 0 6 6 6 6 1 4 4 8-1 4-4 5-1 4-7-2-6 2-4-2-8-5-5zM16 19v10M16 25c-3-3-6-2-7 0 3 1 5 2 7 4M16 23c3-3 6-2 7 0-3 1-5 2-7 4"}]},"guitar":{"sw":1.5,"els":[{"t":"p","d":"M20 4c-2 1-3 4-5 6-2-1-4-1-6 0-3 2-4 6-2 9s6 4 9 2c2-1 3-3 3-5 2-2 5-3 6-5z"},{"t":"p","d":"m12 16 15-12M23 4l5 5M10 14l4 4"},{"t":"c","cx":13.0,"cy":15.0,"r":2.0}]},"hand-mic":{"sw":1.65,"els":[{"t":"e","cx":21.0,"cy":8.0,"rx":5.0,"ry":6.0,"tr":"rotate(38 21 8)"},{"t":"p","d":"m17.5 12.5-11 13 4 3 10-14M18 5l7 6M6 25c-2-1-4 2-2 4 2 1 5 0 6-1"}]},"headphones":{"sw":1.7,"els":[{"t":"p","d":"M5 17a11 11 0 0 1 22 0v7"},{"t":"r","x":4.0,"y":16.0,"w":6.0,"h":10.0,"rx":3.0},{"t":"r","x":22.0,"y":16.0,"w":6.0,"h":10.0,"rx":3.0},{"t":"p","d":"M22 25c0 2-2 4-5 4"}]},"magic-hat":{"sw":1.55,"els":[{"t":"e","cx":16.0,"cy":25.0,"rx":12.0,"ry":3.0},{"t":"p","d":"M9 24 11 10h10l2 14M8 10h16M23 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM8 3l.7 1.5L10 5l-1.3.5L8 7l-.7-1.5L6 5l1.3-.5z"}]},"masks":{"sw":1.5,"els":[{"t":"p","d":"M4 6c4 2 8 2 12 0v9c0 5-6 8-6 8s-6-3-6-8z"},{"t":"p","d":"M16 9c4 2 8 2 12 0v9c0 5-6 8-6 8s-3-2-5-5M7 12c1-1 2-1 3 0M12 12c1-1 2-1 3 0M7 17c2 2 4 2 6 0M19 15c1 1 2 1 3 0M24 15c1 1 2 1 3 0M19 20c2-2 4-2 6 0"}]},"microphone":{"sw":1.7,"els":[{"t":"r","x":11.0,"y":3.0,"w":10.0,"h":17.0,"rx":5.0},{"t":"p","d":"M7.5 15.5a8.5 8.5 0 0 0 17 0M16 24v5M11 29h10"},{"t":"p","d":"M13.5 8h5M13.5 12h5"}]},"saxophone":{"sw":1.55,"els":[{"t":"p","d":"M20 4h7v3h-5l-2 4v10c0 5-3 8-8 8-4 0-7-3-7-7 0-3 2-5 5-5 2 0 4 2 4 4 0 1-.5 2-1 3"},{"t":"p","d":"M14 13h6M14 17h6M13 21h7M23 7l3 5M10 17l-2-5 3-1 3 5"}]},"selfie":{"sw":1.5,"els":[{"t":"r","x":8.0,"y":3.0,"w":16.0,"h":26.0,"rx":2.0},{"t":"c","cx":16.0,"cy":13.0,"r":4.0},{"t":"p","d":"M11 24c1-4 3-6 5-6s4 2 5 6M13 6h6M15 26h2"}]},"sheet-music":{"sw":1.55,"els":[{"t":"p","d":"M5 6h22v19H5zM9 10h14M9 14h14M9 18h14M9 22h14"},{"t":"p","d":"M15 10v10c0 2-2 3-4 3s-3-1-3-2 2-2 4-2c1 0 2 0 3 1M22 8v8c0 2-2 3-4 3s-3-1-3-2 2-2 4-2c1 0 2 0 3 1"}]},"sparkles":{"sw":1.55,"els":[{"t":"p","d":"m11 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2zM23 15l1.5 4.5L29 21l-4.5 1.5L23 27l-1.5-4.5L17 21l4.5-1.5zM6 23l.8 2.2L9 26l-2.2.8L6 29l-.8-2.2L3 26l2.2-.8z"}]},"speaker":{"sw":1.7,"els":[{"t":"r","x":7.0,"y":3.0,"w":18.0,"h":26.0,"rx":2.0},{"t":"c","cx":16.0,"cy":20.0,"r":5.0},{"t":"c","cx":16.0,"cy":9.0,"r":2.5},{"t":"p","d":"M14 20h4M16 18v4"}]},"venue":{"sw":1.55,"els":[{"t":"p","d":"M4 29h24M6 29V12h20v17M9 12V7h6v5M17 12V4h6v8M10 17h3v4h-3zM19 17h3v4h-3zM13 29v-5h6v5"},{"t":"p","d":"M4 12h24"}]},"video-camera":{"sw":1.7,"els":[{"t":"r","x":3.0,"y":8.0,"w":18.0,"h":17.0,"rx":3.0},{"t":"p","d":"m21 14 8-4v14l-8-4zM8 5h8M10 8V5"}]},"violin":{"sw":1.55,"els":[{"t":"p","d":"M19 3c2 2 1 5-1 7l-2 2c-2-1-5-1-7 1-3 3-1 6 1 8s5 4 8 1c2-2 2-5 1-7l2-2c2-2 5-3 7-1"},{"t":"p","d":"m6 26 20-20M4 28l4-4M25 4l3 3M11 15l6 6"}]},"vocal-mic":{"sw":1.7,"els":[{"t":"e","cx":17.0,"cy":9.0,"rx":6.0,"ry":7.0},{"t":"p","d":"m14 15-8 12 3 2 8-13M12 8h10M12 11h10"}]}};
