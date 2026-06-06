// QR scanner — scan a printed table-card QR to open that event's public
// Photo Moments gallery. Guest upload happens on the web album (the QR
// encodes an epetrecere.md/moments/<slug> URL), so on a successful scan
// we hand off to the in-app browser.

import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, QrCode } from "lucide-react-native";
import { colors } from "../../../constants/theme";
import { openExternal } from "../../../lib/links";

export default function ScanResultScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (scanned) return;
      // Accept any …/moments/<slug> URL, or a bare epetrecere link.
      const match = data.match(/moments\/([a-zA-Z0-9]+)/);
      if (match) {
        setScanned(true);
        void openExternal(`https://epetrecere.md/moments/${match[1]}`);
        setTimeout(() => router.back(), 500);
      } else if (/^https?:\/\/[^\s]*epetrecere/i.test(data)) {
        setScanned(true);
        void openExternal(data);
        setTimeout(() => router.back(), 500);
      } else {
        setHint("Cod necunoscut — scanează un cod ePetrecere Moments.");
        setTimeout(() => setHint(null), 2500);
      }
    },
    [scanned, router],
  );

  // Permission still resolving.
  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  // Permission denied / not yet granted.
  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <QrCode size={48} color={colors.gold} />
        <Text className="text-center font-heading text-[20px] font-bold text-foreground">
          Scanează codul QR
        </Text>
        <Text className="text-center text-[13px] leading-5 text-muted-foreground">
          Avem nevoie de acces la cameră ca să scanezi codul de pe cardul de
          masă și să deschizi galeria foto a evenimentului.
        </Text>
        <Pressable
          onPress={requestPermission}
          className="mt-1 rounded-2xl bg-gold px-6 py-3 active:opacity-80"
        >
          <Text className="text-[15px] font-bold text-background">
            Permite camera
          </Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Text className="text-[13px] text-muted-foreground">Înapoi</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : handleScan}
      />

      {/* Top bar */}
      <SafeAreaView edges={["top"]} className="absolute left-0 right-0 top-0">
        <View className="flex-row items-center gap-2 p-4">
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/50"
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </Pressable>
          <Text className="font-heading text-[16px] font-bold text-white">
            Scanează QR
          </Text>
        </View>
      </SafeAreaView>

      {/* Reticle */}
      <View
        className="absolute bottom-0 left-0 right-0 top-0 items-center justify-center"
        pointerEvents="none"
      >
        <View className="h-56 w-56 rounded-3xl border-2 border-white/80" />
      </View>

      {/* Hint */}
      <View className="absolute bottom-0 left-0 right-0 items-center pb-12">
        <Text className="mx-8 rounded-full bg-black/60 px-4 py-2 text-center text-[13px] text-white">
          {hint ?? "Îndreaptă camera spre codul QR de pe cardul de masă"}
        </Text>
      </View>
    </View>
  );
}
