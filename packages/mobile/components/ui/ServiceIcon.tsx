import Svg, { Path, Circle, Ellipse, Rect } from "react-native-svg";
import {
  SERVICE_ICONS,
  SERVICE_ICON_VIEWBOX,
  type ServiceIconEl,
} from "./service-icon-data";

/**
 * A category's own icon, drawn the way the website draws it.
 *
 * Every category tile in the app used a single `Sparkles` glyph, so a DJ, a
 * photographer and a fire show were visually identical — twenty-nine services
 * wearing one face. The API even returns an icon name per category and the
 * screen ignored it.
 *
 * The mapping below is copied from src/components/public/service-icon.tsx and
 * keyed the same way, by SLUG rather than by the API's `icon` field: only ten
 * of twenty-nine categories carry that field, while the web map covers all of
 * them. Keep the two in step.
 */
const BY_SLUG: Record<string, string> = {
  "moderatori": "microphone",
  "dj": "headphones",
  "cantareti": "vocal-mic",
  "formatii": "violin",
  "fotografi": "camera",
  "videografi": "video-camera",
  "decor": "floral",
  "animatori": "confetti",
  "sali": "venue",
  "sali-restaurante": "venue",
  "echipament": "speaker",
  "echipament-tehnic": "speaker",
  "show-program": "masks",
  "alte-servicii": "cake",
  "candy-bar-tort": "cake",
  "cantareti-de-estrada": "hand-mic",
  "interpreti-muzica-populara": "accordion",
  "cover-band": "sheet-music",
  "instrumentalisti": "saxophone",
  "cvartet": "cello",
  "dansatori": "dancer",
  "dansuri-populare": "dance-shoes",
  "ansamblu-tiganesc": "guitar",
  "dans-oriental": "fan",
  "iluzionisti-magicieni": "magic-hat",
  "show-ul-focului": "flame",
  "interesant-la-sarbatoare": "sparkles",
  "show-circus": "circus",
  "foto-video": "clapperboard",
  "foto-zona-selfie": "selfie",
};

/** The site's own fallback, for a slug neither map knows. */
const FALLBACK = "sparkles";

export function ServiceIcon({
  slug,
  size = 24,
  color,
}: {
  slug: string;
  size?: number;
  color: string;
}) {
  const def =
    SERVICE_ICONS[BY_SLUG[slug] ?? ""] ?? SERVICE_ICONS[FALLBACK];
  if (!def) return null;

  const common = {
    stroke: color,
    strokeWidth: def.sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${SERVICE_ICON_VIEWBOX} ${SERVICE_ICON_VIEWBOX}`}
    >
      {def.els.map((el: ServiceIconEl, i: number) => {
        switch (el.t) {
          case "p":
            return <Path key={i} d={el.d!} {...common} />;
          case "c":
            return (
              <Circle key={i} cx={el.cx!} cy={el.cy!} r={el.r!} {...common} />
            );
          case "e":
            return (
              <Ellipse
                key={i}
                cx={el.cx!}
                cy={el.cy!}
                rx={el.rx!}
                ry={el.ry!}
                transform={el.tr}
                {...common}
              />
            );
          case "r":
            return (
              <Rect
                key={i}
                x={el.x!}
                y={el.y!}
                width={el.w!}
                height={el.h!}
                rx={el.rx}
                {...common}
              />
            );
          default:
            return null;
        }
      })}
    </Svg>
  );
}
