// Onboarding step 1: welcome carousel.
//
// Three slides showcase the platform's main jobs-to-be-done: discover,
// plan, photo moments. Auto-advances every 5s but pauses on touch so
// the user can read.
//
// Implementation note: we use react-native-reanimated's
// FadeInRight / FadeOutLeft on slide changes for a calm transition
// rather than a hard cut. The dots at the bottom serve as both
// progress indicator and a tap-to-jump control.

import { useState, useRef, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Music,
  Image,
  Calendar,
  type LucideIcon,
} from "lucide-react-native";
import { Button, SafeScreen } from "../../components/ui";
import { colors, motion } from "../../constants/theme";
import { cn } from "../../lib/cn";

interface Slide {
  icon: LucideIcon;
  titleKey: string;
  bodyKey: string;
}

const SLIDES: Slide[] = [
  { icon: Sparkles, titleKey: "onboarding.welcomeTitle", bodyKey: "onboarding.welcomeBody" },
  { icon: Music, titleKey: "onboarding.discoverTitle", bodyKey: "onboarding.discoverBody" },
  { icon: Calendar, titleKey: "onboarding.planTitle", bodyKey: "onboarding.planBody" },
  { icon: Image, titleKey: "onboarding.momentsTitle", bodyKey: "onboarding.momentsBody" },
];

const AUTOPLAY_MS = 5000;

export default function OnboardingWelcome() {
  const { t } = useTranslation();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (paused.current) return;
      setIndex((i) => (i + 1) % SLIDES.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, []);

  function next() {
    if (index < SLIDES.length - 1) setIndex(index + 1);
    else router.replace("/(onboarding)/permissions");
  }

  function skip() {
    router.replace("/(onboarding)/permissions");
  }

  return (
    <SafeScreen padded scroll={false}>
      {/* Skip in top-right */}
      <View className="flex-row justify-end pt-2">
        <Pressable hitSlop={12} onPress={skip}>
          <Text className="text-[14px] text-muted-foreground">
            {t("common.skip")}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPressIn={() => {
          paused.current = true;
        }}
        onPressOut={() => {
          paused.current = false;
        }}
        className="flex-1 items-center justify-center gap-6"
      >
        <SlideCard
          key={index}
          slide={SLIDES[index]!}
          t={t}
        />
      </Pressable>

      {/* Pagination dots */}
      <View className="mb-6 flex-row justify-center gap-2">
        {SLIDES.map((_, i) => (
          <Pressable
            key={i}
            hitSlop={8}
            onPress={() => setIndex(i)}
            className={cn(
              "h-2 rounded-full transition-all",
              i === index ? "w-6 bg-gold" : "w-2 bg-muted",
            )}
          />
        ))}
      </View>

      <Button onPress={next} fullWidth size="lg">
        {index === SLIDES.length - 1
          ? t("onboarding.getStarted")
          : t("common.next")}
      </Button>
    </SafeScreen>
  );
}

function SlideCard({
  slide,
  t,
}: {
  slide: Slide;
  t: (k: string) => string;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: motion.normal });
    translateY.value = withTiming(0, { duration: motion.normal });
    return () => {
      opacity.value = 0;
      translateY.value = 16;
    };
  }, [opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const Icon = slide.icon;
  return (
    <Animated.View style={animatedStyle} className="items-center gap-6 px-6">
      <View className="h-28 w-28 items-center justify-center rounded-3xl bg-gold/15 ring-1 ring-gold/30">
        <Icon size={48} color={colors.gold} />
      </View>
      <Text className="text-center font-heading text-[28px] font-bold leading-tight text-foreground">
        {t(slide.titleKey)}
      </Text>
      <Text className="max-w-[280px] text-center text-[15px] leading-6 text-muted-foreground">
        {t(slide.bodyKey)}
      </Text>
    </Animated.View>
  );
}
