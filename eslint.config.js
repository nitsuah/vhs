export default [
  {
    ignores: ["node_modules/", "dist/", "build/"],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        node: true,
        es2022: true,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-undef": "error",
      "no-console": "off",
      "eqeqeq": ["error", "always"],
      "no-var": "error",
      "prefer-const": "warn",
    },
  },
  {
    files: ["tests/**/*.js", "tests/**/*.spec.js"],
    languageOptions: {
      globals: {
        jest: true,
      },
    },
  },
  {
    files: ["tests_playwright/**/*.js", "tests_playwright/**/*.spec.js"],
    languageOptions: {
      globals: {
        browser: true,
        node: true,
        openDetail: "readonly",
        openNewTapeModal: "readonly",
        renderInv: "readonly",
      },
    },
  },
];