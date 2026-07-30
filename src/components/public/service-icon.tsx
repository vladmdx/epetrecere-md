import { cn } from "@/lib/utils";

const ICONS: Record<string, string> = {
  moderatori: "microphone",
  dj: "headphones",
  cantareti: "vocal-mic",
  formatii: "violin",
  fotografi: "camera",
  videografi: "video-camera",
  decor: "floral",
  animatori: "confetti",
  sali: "venue",
  "sali-restaurante": "venue",
  echipament: "speaker",
  "echipament-tehnic": "speaker",
  "show-program": "masks",
  "alte-servicii": "cake",
  "candy-bar-tort": "cake",
  "cantareti-de-estrada": "hand-mic",
  "interpreti-muzica-populara": "accordion",
  "cover-band": "sheet-music",
  instrumentalisti: "saxophone",
  cvartet: "cello",
  dansatori: "dancer",
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

export function ServiceIcon({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const icon = ICONS[slug] ?? "sparkles";
  const url = `/icons/services/${icon}.svg`;

  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        WebkitMaskImage: `url("${url}")`,
        maskImage: `url("${url}")`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}
