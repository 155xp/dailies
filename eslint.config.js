import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "fixtures", "dist", "**/dist", "**/test-results", "**/playwright-report"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
