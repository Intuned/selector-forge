/** @type {import("@ladle/react").UserConfig} */
export default {
  // Gallery stories live under `stories/`; components may also co-locate their
  // own `*.stories.tsx` under `entrypoints/` (WXT only bundles entrypoints, so
  // story files there are ignored by `wxt build`).
  stories: "{stories,entrypoints}/**/*.stories.{ts,tsx}",
  outDir: "dist/ladle",
  // Distinct from the WXT dev server (7877) and apps/web's Ladle (61000) so all
  // three can run at once.
  port: 61010,
};
