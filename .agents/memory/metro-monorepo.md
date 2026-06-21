---
name: Metro + pnpm monorepo for Expo
description: How to configure Metro bundler for pnpm workspaces so that both workspace packages AND pnpm virtual-store transitive deps resolve correctly, and how to fix the Replit Expo web preview HMR crash.
---

## Metro config for pnpm workspaces

**Rule:** Do NOT set `config.resolver.disableHierarchicalLookup = true` for pnpm monorepos.

```js
// artifacts/mobile/metro.config.js
const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Do NOT add disableHierarchicalLookup = true
module.exports = config;
```

**Why:** pnpm's virtual store (`.pnpm/`) uses hierarchical `node_modules` inside each package entry. With `disableHierarchicalLookup = true`, Metro can't walk into those nested stores, causing cascading "Unable to resolve" errors for transitive deps (stacktrace-parser, expo-modules-core, etc.). The `nodeModulesPaths` list already ensures workspace-root packages are found without disabling hierarchy.

## Replit Expo web preview HMR crash

**Problem:** After bundling succeeds, Metro crashes when the Replit Expo web preview iframe connects via HMR WebSocket. The browser sends its page URL (root path `/`) and Metro's `_registerEntryPoint` calls `jsc-safe-url@0.2.4` which throws on root paths. `@expo/cli`'s uncaught-exception handler calls `process.exit()` before any user-registered handler can suppress it — so `process.on('uncaughtException')` in metro.config.js does NOT help.

**Fix:** Patch `HmrServer.js` in the pnpm store to add `.catch()` around `_registerEntryPoint` inside `onClientMessage`:

File: `node_modules/.pnpm/metro@0.83.3/node_modules/metro/src/HmrServer.js`

```js
// Change the "register-entrypoints" case to:
case "register-entrypoints":
  return Promise.all(
    data.entryPoints.map((entryPoint) =>
      this._registerEntryPoint(client, entryPoint, sendFn).catch((err) => {
        debug("Ignoring _registerEntryPoint error for %s: %s", entryPoint, err.message);
      }),
    ),
  );
```

**Why:** The rejection propagates as unhandled → `@expo/cli` calls `process.exit()`. Catching at `.catch()` level prevents the cascade. HMR for the web preview is non-critical; the bundle is already served.

**Note:** This patch lives in the pnpm store and must be re-applied after `pnpm install`.

## expo-notifications on web

Always guard all `expo-notifications` calls with `Platform.OS !== "web"`:
- `Notifications.setNotificationHandler(...)` — module-level call
- `Notifications.useLastNotificationResponse()` — hook in component
- `useNotifications(isAuthenticated)` — custom hook that registers push tokens

These throw `UnavailabilityError` on web and crash the entire app with "Something went wrong".

## experiments.baseUrl

Set `"baseUrl": "/mobile"` in app.json `experiments` so the web bundle uses `/mobile` as the base path, consistent with the artifact's `previewPath = "/mobile/"`.
