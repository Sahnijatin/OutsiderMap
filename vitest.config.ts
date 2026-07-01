import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure/isolatable server-side helpers. `server-only` is stubbed
// (its whole job is to throw outside an RSC bundle) and `@/` maps to src/.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
