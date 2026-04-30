import Link from "next/link";
import { getCategoryEmoji } from "@/lib/wizard/categories-meta";

// Same card style as the homepage CategoriesSection (image + gradient overlay
// + name + "from X€"). Falls back to a gold-gradient + emoji tile when there's
// no image available — many of the long-tail categories (Striptiz, Moș
// Crăciun, etc.) don't have promo photos yet.
interface Props {
  slug: string;
  name: string;
  image: string | null;
  priceFrom: number | null;
  /** Admin-controlled label rendered as a pill in the top-right. */
  badge?: string | null;
}

export function CategoryCard({ slug, name, image, priceFrom, badge }: Props) {
  const emoji = getCategoryEmoji(slug);
  return (
    <Link
      href={`/categorie/${slug}`}
      className="group relative block overflow-hidden rounded-xl card-premium"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {image ? (
          <>
            <img
              src={image}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gold/30 via-gold/10 to-[#0D0D0D] transition-transform duration-500 group-hover:scale-110">
            <span className="text-6xl drop-shadow-lg" aria-hidden>
              {emoji}
            </span>
          </div>
        )}
        {badge && (
          <span className="absolute right-3 top-3 rounded-full bg-gold px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0D0D0D] shadow-lg">
            {badge}
          </span>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4">
        <h3 className="font-heading text-base font-bold text-white">{name}</h3>
        {priceFrom && priceFrom > 0 && (
          <p className="font-accent text-sm text-gold mt-1">de la {priceFrom}€</p>
        )}
      </div>
    </Link>
  );
}
