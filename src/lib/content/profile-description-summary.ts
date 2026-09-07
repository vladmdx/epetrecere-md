import { plainText } from "./plain-text";

/**
 * Artist descriptions may contain Markdown, while the venue editor stores HTML.
 * Registration cards only need readable text. This is not an HTML sanitizer:
 * always render its result as a React text child, never as innerHTML. Do not use
 * this presentation helper for immutable signed documents or stored content.
 */
export function profileDescriptionSummary(value: string | null | undefined): string {
  return plainText((value ?? "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ""))
    .replace(/^[ \t]*```[^\n]*\n?|^[ \t]*```[ \t]*$/gm, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*(?:[-*+] |\d+\. |> ?)/gm, "")
    .replace(/!?\[([^\]]*)\]\([^\n)]*\)/g, "$1")
    .replace(/(\*\*|__)([\s\S]*?)\1/g, "$2")
    .replace(/(?<!\w)([*_])(?=\S)(.*?)\1(?!\w)/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
