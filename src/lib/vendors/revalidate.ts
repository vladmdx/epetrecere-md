import { revalidatePath } from "next/cache";

/** Public profiles/categories otherwise keep pre-approval data for an hour. */
export function revalidateVendorCatalog(kind: "artist" | "venue") {
  const directory = kind === "artist" ? "artisti" : "sali";
  revalidatePath(`/[locale]/(public)/${directory}/[slug]`, "page");
  revalidatePath(`/[locale]/(public)/${directory}`, "page");
  revalidatePath("/[locale]/(public)/categorie/[slug]", "page");
  revalidatePath("/[locale]/(public)/servicii", "page");
  revalidatePath("/[locale]/(public)", "page");
}
