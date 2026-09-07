import React from "react";

/** Public queries already require approved reviews. Keep the reply fail-closed
 * as well and always render the vendor's text as text, never executable HTML. */
export function PublicReviewReply({ reply, isApproved, label }: {
  reply: string | null | undefined;
  isApproved: boolean | undefined;
  label: string;
}) {
  if (isApproved !== true || !reply?.trim()) return null;
  return (
    <div data-public-review-reply data-no-auto-translate className="mt-3 rounded-lg border-l-2 border-gold/40 bg-gold/[.05] p-3 text-xs text-muted-foreground">
      <p className="font-semibold text-gold">{label}</p>
      <p className="mt-1 whitespace-pre-line leading-relaxed">{reply}</p>
    </div>
  );
}
