import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import next from "@next/eslint-plugin-next";
export default [
  { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": reactHooks, "@next/next": next, "@typescript-eslint": tseslint.plugin },
    rules: { ...reactHooks.configs.recommended.rules, ...next.configs.recommended.rules, "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] },
    linterOptions: { reportUnusedDisableDirectives: "error" } },
];
