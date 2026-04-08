"use client";

import { useScroll, useTransform, motion } from "framer-motion";
import { useRef } from "react";

interface ParallaxImageProps {
  src: string;
  alt?: string;
  opacity?: number;
}

export function ParallaxImage({ src, alt = "", opacity = 0.07 }: ParallaxImageProps) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["-10%", "10%"]);

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.img
        src={src}
        alt={alt}
        style={{ y, opacity }}
        className="w-full h-[120%] object-cover blur-[2px]"
        loading="lazy"
      />
    </div>
  );
}
