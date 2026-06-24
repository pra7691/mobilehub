const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// Suppress the Metro HMR crash that occurs when the Replit Expo preview
// connects from a root-path URL (no path component). jsc-safe-url@0.2.4
// throws on root paths, which kills Metro. We catch only that specific
// error so Metro keeps serving the bundle.
process.on("uncaughtException", (err) => {
  if (
    err &&
    typeof err.message === "string" &&
    err.message.includes("empty path") &&
    err.message.includes("JSC-safe")
  ) {
    console.warn(
      "[metro] Suppressed HMR root-path error (Replit web preview quirk):",
      err.message
    );
    return;
  }
  // Re-throw everything else so real errors still crash the process
  throw err;
});

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

// nodeModulesPaths ensures @workspace/* packages and workspace root deps
// are found. We do NOT set disableHierarchicalLookup so that packages
// inside pnpm's virtual store (.pnpm/) can resolve their own transitive
// deps via Metro's normal directory-walking logic.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Resolve the @/ path alias (from tsconfig "paths": { "@/*": ["./*"] })
// explicitly in Metro so it works when bundled from EAS (workspace root cwd).
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@/")) {
    const resolved = path.resolve(projectRoot, moduleName.slice(2));
    return (defaultResolveRequest || context.resolveRequest)(
      context,
      resolved,
      platform
    );
  }
  return (defaultResolveRequest || context.resolveRequest)(
    context,
    moduleName,
    platform
  );
};

module.exports = config;
