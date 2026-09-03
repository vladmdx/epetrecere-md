/** Convert rich editor content to plain text. Render the result as text, not HTML. */
export function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
      const named: Record<string,string> = {"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'","&nbsp;":" "};
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      const n = entity.toLowerCase().startsWith("&#x") ? parseInt(entity.slice(3,-1),16) : parseInt(entity.slice(2,-1),10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }).trim();
}
