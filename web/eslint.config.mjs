import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  { ignores: [".next/**", "**/*.d.ts", "eslint.config.mjs", "next.config.js", "node_modules/**"] },
  ...nextCoreWebVitals,
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/use-memo": "off",
    },
  },
];
