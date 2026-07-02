// Flat config for eslint 9. eslint-config-expo 8.x (the SDK 52-matched
// version) only ships a legacy shareable config, so wrap it with FlatCompat.
const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  { ignores: ["dist/*", ".expo/*", "expo-env.d.ts", "eslint.config.js", "babel.config.js"] },
  ...compat.extends("expo"),
  {
    rules: {
      // The load()-in-useEffect / reset-flag-on-session-change patterns here
      // are intentional; keep the signal without failing the build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
