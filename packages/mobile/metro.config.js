// Metro config tweaked for:
//   1. NativeWind v4 (CSS-in-JS transform on Tailwind classes).
//   2. Monorepo — Metro by default only looks in the package's own
//      node_modules. We add the repo root so React Native can resolve
//      @epetrecere/shared and its (root-hoisted) transitive deps.

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the entire monorepo so changes in packages/shared trigger
//    hot reloads in the mobile app.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from BOTH the mobile package's own node_modules and
//    the workspace root's. Order matters: project first so its peer-dep
//    versions win.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// NOTE: disableHierarchicalLookup was removed (SDK 54). The mobile package
// is standalone (out of npm workspaces) with its own react-native, so the
// default hierarchical resolution no longer risks a duplicate RN copy, and
// expo-doctor flags the override as incompatible with expo/metro-config.

module.exports = withNativeWind(config, {
  input: "./global.css",
});
