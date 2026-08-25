"use client";

// Share buttons — renders WhatsApp / Facebook / Telegram / copy-link
// pills for sharing an artist or venue profile. All links open in new
// tab; the copy button uses the Clipboard API with a subtle success
// animation.
//
// Usage:
//   <ShareButtons url={publicUrl} title={`${name} pe ePetrecere.md`} />
//
// If `url` is omitted the component reads window.location.href on mount.

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

interface Props {
  /** Full URL to share. If omitted, uses window.location.href. */
  url?: string;
  /** Text prefix for WhatsApp/Telegram messages. */
  title: string;
  /** Compact: render only icons; otherwise includes labels. */
  compact?: boolean;
  className?: string;
}

export function ShareButtons({ url, title, compact = false, className }: Props) {
  const { t } = useLocale();
  const [currentUrl, setCurrentUrl] = useState(url || "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!url && typeof window !== "undefined") {
      setCurrentUrl(window.location.href);
    }
  }, [url]);

  if (!currentUrl) return null;

  const encoded = encodeURIComponent(currentUrl);
  const text = encodeURIComponent(title);

  // Native share (mobile) when available — nicer UX than our chips.
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function nativeShare() {
    try {
      await navigator.share({ title, url: currentUrl });
    } catch {
      /* user dismissed — ignore */
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  const services = [
    {
      name: "WhatsApp",
      href: `https://wa.me/?text=${text}%20${encoded}`,
      color: "hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/30",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M20.1 3.9A10 10 0 0 0 2 12a10 10 0 0 0 1.5 5.3L2 22l4.8-1.5A10 10 0 0 0 22 12a10 10 0 0 0-1.9-8.1m-8.1 15.3a8.3 8.3 0 0 1-4.2-1.1l-.3-.2-3.1 1 1-3-.2-.3a8.3 8.3 0 1 1 6.8 3.6m4.6-6.2c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.2.2-.3.2-.6.1a6.9 6.9 0 0 1-2-1.3 7.5 7.5 0 0 1-1.4-1.8c-.1-.3 0-.4.1-.5l.4-.5c.1-.1.1-.2.2-.4s0-.3 0-.4l-.8-2c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4 0-.6.3a2.5 2.5 0 0 0-.8 1.9c0 1.1.8 2.2.9 2.4a9 9 0 0 0 3.7 3.3c.5.2.9.3 1.2.4.5.2.9.2 1.3.1.4-.1 1.2-.5 1.4-1 .2-.5.2-.9.1-1l-.5-.2" />
        </svg>
      ),
    },
    {
      name: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
      color: "hover:bg-blue-500/10 hover:text-blue-500 hover:border-blue-500/30",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7v-3.5h3.1V9.4a4.3 4.3 0 0 1 4.6-4.7c1.3 0 2.7.2 2.7.2V8h-1.5a1.8 1.8 0 0 0-2 2v2.1h3.4l-.6 3.5h-2.8v8.4A12 12 0 0 0 24 12" />
        </svg>
      ),
    },
    {
      name: "Telegram",
      href: `https://t.me/share/url?url=${encoded}&text=${text}`,
      color: "hover:bg-sky-500/10 hover:text-sky-500 hover:border-sky-500/30",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24m5.6 8.2-1.9 8.8c-.1.6-.5.8-1 .5L11.9 15l-1.3 1.3c-.2.1-.3.3-.5.3l.2-2.5 4.5-4.1c.2-.2 0-.2-.3 0l-5.5 3.5-2.4-.8c-.5-.1-.5-.5.1-.7l9.3-3.6c.4-.1.8.1.6.8" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        compact && "gap-1.5",
        className,
      )}
    >
      {canNativeShare && (
        <button
          type="button"
          onClick={nativeShare}
          aria-label={t("share.action")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium transition-colors hover:border-gold/60 hover:text-gold",
            compact && "px-2.5 py-1",
          )}
        >
          <Share2 className="h-3.5 w-3.5" />
          {!compact && t("share.action")}
        </button>
      )}
      {services.map((s) => (
        <a
          key={s.name}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("share.on", { network: s.name })}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium transition-colors text-muted-foreground",
            s.color,
            compact && "px-2.5 py-1",
          )}
        >
          {s.icon}
          {!compact && s.name}
        </a>
      ))}
      <button
        type="button"
        onClick={copyLink}
        aria-label={copied ? t("share.copied") : t("share.copy")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          copied
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
            : "border-border/60 text-muted-foreground hover:border-gold/60 hover:text-gold",
          compact && "px-2.5 py-1",
        )}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {!compact && (copied ? t("share.copiedShort") : t("share.copy"))}
      </button>
    </div>
  );
}
