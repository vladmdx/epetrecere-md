// Expo + NativeWind v4 + Reanimated. Order matters: NativeWind must run
// before Reanimated; Reanimated plugin must be last. Don't reorder.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Reanimated MUST be the last plugin in the list.
      "react-native-reanimated/plugin",
    ],
  };
};
