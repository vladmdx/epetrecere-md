"use client";

// Client-side wrapper for `tel:` anchors that fires a "phone" click
// beacon before the native dialer takes over. Exists because the compare
// page is a server component that can't import track-click directly.

import { Phone } from "lucide-react";
import { trackClick } from "@/lib/analytics/track-click";

interface Props {
  entityKind: "artist" | "venue";
  entityId: number;
  phone: string;
  className?: string;
}

export function TrackedPhoneLink({
  entityKind,
  entityId,
  phone,
  className = "inline-flex items-center gap-1 hover:text-gold",
}: Props) {
  return (
    <a
      href={`tel:${phone}`}
      className={className}
      onClick={() => trackClick(entityKind, entityId, "phone")}
    >
      <Phone className="h-3 w-3" />
      {phone}
    </a>
  );
}
