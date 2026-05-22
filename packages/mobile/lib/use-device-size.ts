// Device size hook — phone vs tablet detection.
//
// Breakpoints:
//   compact  width < 600dp — typical phone portrait
//   medium   600dp ≤ width < 840dp — phone landscape / small tablet
//   expanded width ≥ 840dp — iPad portrait+ and most foldables unfolded
//
// Mirrors Material 3's window-size-class spec so designers and
// developers share a vocabulary. Width updates on orientation change
// via Dimensions listener.
//
// Use this hook anywhere you'd want different layouts. Example:
//   const { isTablet, columns } = useDeviceSize();
//   <FlatList numColumns={columns}>...</FlatList>

import { useEffect, useState } from "react";
import { Dimensions } from "react-native";

export type WindowSizeClass = "compact" | "medium" | "expanded";

interface DeviceSize {
  width: number;
  height: number;
  sizeClass: WindowSizeClass;
  isCompact: boolean;
  isTablet: boolean; // alias for medium or expanded
  /** Recommended FlatList numColumns for grid layouts (1, 2 or 3). */
  columns: number;
}

function classify(width: number): WindowSizeClass {
  if (width < 600) return "compact";
  if (width < 840) return "medium";
  return "expanded";
}

function snapshot(): DeviceSize {
  const { width, height } = Dimensions.get("window");
  const sizeClass = classify(width);
  return {
    width,
    height,
    sizeClass,
    isCompact: sizeClass === "compact",
    isTablet: sizeClass !== "compact",
    columns: sizeClass === "expanded" ? 3 : sizeClass === "medium" ? 2 : 1,
  };
}

export function useDeviceSize(): DeviceSize {
  const [size, setSize] = useState(snapshot);
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", () => {
      setSize(snapshot());
    });
    return () => sub.remove();
  }, []);
  return size;
}
