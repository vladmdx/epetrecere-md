import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The real brand assets, replacing the hand-drawn sparkles that stood in for
 * them until now.
 *
 * Both files carry the logo's own near-black (#070707) baked in — they are
 * photographs of the mark, not transparent cut-outs — so they only sit
 * correctly on a surface of that same colour. Every placement below is on one.
 * Do NOT drop these onto a light background or into an email: the black
 * rectangle will show. If a light-surface version is ever needed, it has to
 * come from the designer as SVG or transparent PNG, not from cutting these.
 */

/** Square mark: the "e" on its rounded tile. Sidebars, avatars, app icon. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/icon-192.png"
      alt=""
      aria-hidden="true"
      width={192}
      height={192}
      priority
      className={cn("h-7 w-7 rounded-[22%] object-contain", className)}
    />
  );
}

/** Full lockup: mark plus "ePetrecere.md". Header, footer, anywhere the name
 *  is being stated rather than merely marked. */
export function BrandLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/logo-header.png"
      alt="ePetrecere.md"
      width={560}
      height={107}
      priority={priority}
      className={cn("h-9 w-auto object-contain", className)}
    />
  );
}
