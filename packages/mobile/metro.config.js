// Metro config tweaked for:
//   1. NativeWind v4 (CSS-in-JS transform on Tailwind classes).
//   2. Monorepo workspaces — Metro by default only looks in the
//      package's own node_modules. We add the repo root and the
//      shared package so React Native can resolve @epetrecere/shared.

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the entire monorepo so changes in packages/shared trigger
//    hot reloads in the mobile app.
config.watchFolders = [workspaceRoot];

// 2. Let Metro resolve modules from BOTH the mobile package's own
//    node_modules and the workspace root's. Order matters: project
//    first so its peer-dep versions win.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Disable hierarchical resolution. With monorepos + npm workspaces
//    enabled it can resolve the wrong copy of react-native if both
//    nesting levels have one.
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, {
  input: "./global.css",
});
