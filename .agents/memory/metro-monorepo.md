---
name: Metro monorepo config
description: Metro bundler config required for Expo in a pnpm workspace to resolve packages correctly
---

The Metro config must add the workspace root to watchFolders and nodeModulesPaths, and disable hierarchical lookup:

```js
const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
```

**Why:** pnpm hoists packages to the workspace root. Metro's default resolver only looks in the project's own node_modules and misses them, causing "Unable to resolve" errors even for correctly-installed packages.

**How to apply:** Always set this when the Expo artifact lives inside a pnpm monorepo. File lives at `artifacts/mobile/metro.config.js`.
