// Flat config for eslint 9. eslint-config-expo 57 ships a native flat config
// (and bundles its own plugin deps, incl. react-hooks), so we consume its flat
// export directly — no FlatCompat shim and no separate react-hooks pin needed.
const expoFlatConfig = require("eslint-config-expo/flat");

module.exports = [
  { ignores: ["dist/*", ".expo/*", "expo-env.d.ts", "eslint.config.js", "babel.config.js"] },
  ...expoFlatConfig,
  {
    rules: {
      // The load()-in-useEffect / reset-flag-on-session-change patterns here
      // are intentional; keep the signal without failing the build.
      "react-hooks/set-state-in-effect": "warn",
      // react/no-unescaped-entities is a web/HTML rule (raw quotes/apostrophes
      // matter in DOM markup). It is meaningless for React Native <Text>, which
      // renders these literals fine, and it was not enforced before the SDK 57
      // flat config. Keep it off so this migration stays behavior-neutral rather
      // than rewriting user-facing copy.
      "react/no-unescaped-entities": "off",
    },
  },
];
