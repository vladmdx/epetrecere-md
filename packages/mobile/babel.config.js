// Expo SDK 54 + NativeWind v4.2 + Reanimated 4.
// babel-preset-expo automatically adds the react-native-worklets/plugin
// (Reanimated 4) when react-native-worklets is installed. Do NOT add
// react-native-reanimated/plugin or react-native-worklets/plugin manually —
// doing so double-registers the plugin and breaks the build.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
