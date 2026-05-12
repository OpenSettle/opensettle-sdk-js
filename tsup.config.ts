import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    webhooks: "src/webhooks.ts",
    errors: "src/errors.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  external: [],
});
