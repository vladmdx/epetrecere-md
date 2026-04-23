// Escape user-supplied strings before injecting them into email HTML.
// Prevents XSS/HTML injection in clients that render HTML (Gmail, Outlook).
//
// Use this on ANY value the user provides that ends up in an email
// template — names, review text, custom messages, etc. Template literals
// like `<strong>${name}</strong>` are NOT safe by default; wrap with
// escapeHtml first.

export function escapeHtml(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  const s = String(input);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}
