// Conservative, dependency-free HTML sanitizer for admin-authored rich text
// (Tiptap output rendered via dangerouslySetInnerHTML on blog/pages).
//
// ⚠️ This is DEFENSE-IN-DEPTH, not a bulletproof sanitizer. The primary
// control is that only admins can write this content (requireAdmin on the
// blog/pages APIs). It strips the common stored-XSS vectors — executable /
// embedding elements, inline event handlers, and dangerous URL schemes — so
// a compromised admin session or a bad paste can't trivially inject script.
// For stronger guarantees, replace the body with DOMPurify.sanitize()
// (isomorphic-dompurify) and delete these regexes.

const DANGEROUS_TAGS = [
  "script", "style", "iframe", "object", "embed", "noscript", "template",
  "svg", "math", "link", "meta", "base", "form", "input", "button",
  "textarea", "select", "option", "frame", "frameset", "applet",
];

export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return "";
  let out = String(html);

  // Drop dangerous elements: paired (with their content) first, then any
  // stray self-closing / unclosed variants.
  for (const tag of DANGEROUS_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "gi"), "");
    out = out.replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), "");
  }

  // Strip inline event handlers: on…="…" / on…='…' / on…=unquoted.
  out = out.replace(/\son[a-z0-9_-]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z0-9_-]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son[a-z0-9_-]+\s*=\s*[^\s>]+/gi, "");

  // Neutralize dangerous URL schemes in link/media attributes.
  const badScheme = /(?:javascript|vbscript|data)\s*:/i;
  out = out.replace(
    /\s(href|src|xlink:href|formaction|action|srcdoc)\s*=\s*"([^"]*)"/gi,
    (m, attr, val) => (badScheme.test(val) ? ` ${attr}="#"` : m),
  );
  out = out.replace(
    /\s(href|src|xlink:href|formaction|action|srcdoc)\s*=\s*'([^']*)'/gi,
    (m, attr, val) => (badScheme.test(val) ? ` ${attr}='#'` : m),
  );

  return out;
}
