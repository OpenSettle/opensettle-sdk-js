import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    webhooks: "src/webhooks.ts",
    errors: "src/errors.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  // Match `engines.node >= 20`. Without an explicit target, future tsup
  // defaults could silently downlevel to an older Node baseline.
  target: "node20",
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  external: [],
});
