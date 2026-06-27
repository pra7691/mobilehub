const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

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

config.watchFolders = [...(config.watchFolders || []), workspaceRoot];

// Exclude ephemeral temp build directories created by @smithy/* packages
// (e.g. @smithy/core_tmp_NNNNN/dist-cjs) that get created and deleted
// during build, causing Metro's FallbackWatcher to throw ENOENT.
config.resolver.blockList = [
  /node_modules\/\.pnpm\/.*_tmp_[0-9]+\/.*/,
];

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
// We return the resolution object directly (sourceFile) rather than
// re-calling context.resolveRequest with an absolute path, which Metro
// does not handle reliably.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@/")) {
    const rel = moduleName.slice(2); // strip leading "@/"
    const base = path.resolve(projectRoot, rel);
    const exts = ["ts", "tsx", "js", "jsx", "json"];
    // Try file directly with each extension
    for (const ext of exts) {
      const filePath = `${base}.${ext}`;
      if (fs.existsSync(filePath)) return { type: "sourceFile", filePath };
    }
    // Try index file inside a directory
    for (const ext of exts) {
      const filePath = path.join(base, `index.${ext}`);
      if (fs.existsSync(filePath)) return { type: "sourceFile", filePath };
    }
    // Fall through — let Metro report the missing module normally
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
