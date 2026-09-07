export const TABLE_SHAPES = ["round", "rectangular", "long"] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

/** Legacy rows have no recorded shape. Preserve their old seats-based visual,
 * without guessing a saved preference or changing any existing row. */
export function resolveTableShape(table: { shape?: TableShape | null; seats: number }): TableShape {
  return table.shape ?? (table.seats > 12 ? "long" : "round");
}
