// useLanguagePicker — open a native ActionSheet (iOS) / Alert (Android)
// to pick app language. Persists via setLocale and immediately re-renders
// the entire app via i18next change-language event (react-i18next
// subscribes for us).

import { ActionSheetIOS, Alert, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { setLocale, supportedLocales, type SupportedLocale } from "./i18n";

const LABEL_BY_LOCALE: Record<SupportedLocale, string> = {
  ro: "Română",
  ru: "Русский",
  en: "English",
};

export function useLanguagePicker(): () => void {
  const { t } = useTranslation();

  return () => {
    const options = supportedLocales.map((l) => LABEL_BY_LOCALE[l]);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Schimbă limba",
          options: [...options, t("common.cancel")],
          cancelButtonIndex: options.length,
        },
        (i) => {
          if (i >= 0 && i < options.length) {
            void setLocale(supportedLocales[i]!);
          }
        },
      );
    } else {
      Alert.alert(
        "Schimbă limba",
        undefined,
        [
          ...supportedLocales.map((l) => ({
            text: LABEL_BY_LOCALE[l],
            onPress: () => void setLocale(l),
          })),
          { text: t("common.cancel"), style: "cancel" as const },
        ],
      );
    }
  };
}
