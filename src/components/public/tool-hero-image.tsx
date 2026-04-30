"use client";

import { useState } from "react";

interface Props {
  src: string;
  alt: string;
  emoji: string;
}

/**
 * Image with built-in fallback. If the placeholder file hasn't been uploaded
 * yet (404), we hide the <img> and show a gold-gradient + emoji tile instead
 * so the page never has a broken-image icon.
 */
export function ToolHeroImage({ src, alt, emoji }: Props) {
  const [errored, setErrored] = useState(false);

  return (
    <>
      {!errored && (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      )}
      {errored && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gold/30 via-gold/10 to-[#0D0D0D]">
          <span className="text-9xl drop-shadow-2xl" aria-hidden>
            {emoji}
          </span>
        </div>
      )}
    </>
  );
}
