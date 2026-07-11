// Workaround: react-native-css-interop 0.1.22 (pinned by NativeWind 4.1.x)
// applies layout + font-size from className to <Text> but NOT `color`. Every
// `text-foreground` / `text-muted-foreground` / `text-gold` etc. silently
// no-ops, so all text renders in the platform-default dark color (invisible on
// the app's dark background).
//
// We patch RN's Text render (which runs AFTER css-interop, at the underlying
// element) to inject the color that className implies. If css-interop kept the
// className on the element we read it and map the exact color; otherwise we
// fall back to the foreground color so text is at least legible.
//
// Proper fix is NativeWind 4.2 + css-interop 0.2 (needs Reanimated 4 / worklets
// + New Arch + a native rebuild) — tracked as a follow-up.
import React from "react";
import { Text } from "react-native";

const COLOR_MAP: Record<string, string> = {
  // order: most specific first (substring safety)
  "text-muted-foreground": "#8E8B82",
  "text-foreground": "#F7F5EE",
  "text-gold": "#C9A84C",
  "text-white": "#FFFFFF",
  "text-[#EF4444]": "#EF4444",
  "text-[#0D0D0D]": "#0D0D0D",
};

const DEFAULT_COLOR = "#F7F5EE";

const TextAny = Text as unknown as {
  render?: (props: any, ref: any) => any;
  __colorPatched?: boolean;
};

if (TextAny.render && !TextAny.__colorPatched) {
  const originalRender = TextAny.render;
  TextAny.render = function patchedRender(props: any, ref: any) {
    const element = originalRender.call(this, props, ref);
    if (!element) return element;

    const className: string =
      props?.className ?? element?.props?.className ?? "";

    let color: string | undefined;
    for (const cls in COLOR_MAP) {
      if (className.includes(cls)) {
        color = COLOR_MAP[cls];
        break;
      }
    }
    if (!color) color = DEFAULT_COLOR;

    // color first = base default; anything css-interop / the caller set on
    // `style` (including an explicit inline color) still wins over it.
    return React.cloneElement(element, {
      style: [{ color }, element.props?.style],
    });
  };
  TextAny.__colorPatched = true;
}

export {};
