import { useCallback, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { View, Text, Pressable, PanResponder, LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../constants/theme";

/**
 * Where a partner draws their signature.
 *
 * The web pad is an HTML canvas, which has no counterpart here, so this draws
 * into react-native-svg and asks the native view for a PNG through its own
 * `toDataURL`. That avoids pulling in a WebView or a screenshot library just
 * to produce a few kilobytes of image, and it is the same format the server
 * already accepts: `data:image/png;base64,…`, capped at 400 KB.
 *
 * Strokes are kept as separate paths rather than one long path, so lifting a
 * finger between letters does not draw a line across the gap — the bug that
 * made the first web pad unusable.
 */
export interface SignaturePadHandle {
  /** PNG data URL, or null when nothing substantial has been drawn. */
  toPngDataUrl(): Promise<string | null>;
  clear(): void;
}

/**
 * A few dots are not a signature. The web side rejects trivial marks the same
 * way, so a partner cannot tap once and be treated as having signed.
 */
const MIN_POINTS = 12;

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  {
    height?: number;
    onChange?: (hasSignature: boolean) => void;
    /**
     * Fires true while a stroke is in progress. The parent uses it to turn
     * off its ScrollView: the responder flags below help, but a native
     * ScrollView pan can still take the gesture, and the only reliable way
     * to draw inside one is to stop it scrolling while the finger is down.
     */
    onDrawingChange?: (drawing: boolean) => void;
  }
>(function SignaturePad({ height = 190, onChange, onDrawingChange }, ref) {
  const svgRef = useRef<Svg>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef<string>("");
  const pointCount = useRef(0);
  const [width, setWidth] = useState(0);

  // Held in a ref so the PanResponder, created once, never reads a stale
  // callback — the same mistake that made the web pad wipe itself.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDrawingRef = useRef(onDrawingChange);
  onDrawingRef.current = onDrawingChange;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The pad lives inside the registration form's ScrollView, and without
      // these three the ScrollView wins: it claims the gesture a few pixels
      // into a stroke, so the page slides away under the finger and the
      // signature arrives in fragments. Verified on a simulator — a slow,
      // deliberate signature (which is how people actually sign) broke after
      // the first centimetre while the form scrolled.
      //
      // Capture phase beats the parent to the gesture; refusing termination
      // stops it being taken back mid-stroke.
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        onDrawingRef.current?.(true);
        const { locationX, locationY } = e.nativeEvent;
        current.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        pointCount.current += 1;
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        current.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        pointCount.current += 1;
        // Commit on every move so the stroke is visible as it is drawn.
        setPaths((prev) => {
          const next = prev.slice();
          next[next.length - 1] = current.current;
          return next;
        });
      },
      onPanResponderStart: () => {
        setPaths((prev) => [...prev, current.current]);
      },
      onPanResponderRelease: () => {
        onDrawingRef.current?.(false);
        onChangeRef.current?.(pointCount.current >= MIN_POINTS);
      },
      // If the system takes the gesture anyway (an incoming call, a system
      // sheet), keep what was drawn rather than leaving a half-stroke that
      // never counts.
      onPanResponderTerminate: () => {
        onDrawingRef.current?.(false);
        onChangeRef.current?.(pointCount.current >= MIN_POINTS);
      },
    }),
  ).current;

  const clear = useCallback(() => {
    setPaths([]);
    current.current = "";
    pointCount.current = 0;
    onChangeRef.current?.(false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      clear,
      toPngDataUrl: () =>
        new Promise((resolve) => {
          if (pointCount.current < MIN_POINTS || !svgRef.current) {
            resolve(null);
            return;
          }
          // Native only; if the bridge ever fails to answer we resolve null
          // rather than hanging the submit button forever.
          const timer = setTimeout(() => resolve(null), 4000);
          try {
            svgRef.current.toDataURL((base64: string) => {
              clearTimeout(timer);
              resolve(base64 ? `data:image/png;base64,${base64}` : null);
            });
          } catch {
            clearTimeout(timer);
            resolve(null);
          }
        }),
    }),
    [clear],
  );

  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  return (
    <View style={{ gap: 8 }}>
      <View
        onLayout={onLayout}
        {...responder.panHandlers}
        style={{
          height,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: "#FFFFFF",
          overflow: "hidden",
        }}
      >
        {width > 0 && (
          <Svg ref={svgRef} width={width} height={height}>
            {paths.map((d, i) => (
              <Path
                key={i}
                d={d}
                stroke="#111111"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        )}
        {paths.length === 0 && (
          <View
            pointerEvents="none"
            style={{
              ...({ position: "absolute" } as const),
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#9A9A9A", fontSize: 14 }}>
              Semnează cu degetul
            </Text>
          </View>
        )}
      </View>
      <Pressable onPress={clear} hitSlop={8} style={{ alignSelf: "flex-end" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
          Șterge semnătura
        </Text>
      </Pressable>
    </View>
  );
});
