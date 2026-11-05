// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Exclude isolated ledger-import/forecast experiments until their store APIs are wired up.
    ignores: [
      "dist/*",
      "server/**",
      "scripts/**",
      "src/components/ForecastOutcomeEvaluationPanel.tsx",
      "src/components/StatementCsvImport.tsx",
      "src/engine/forecasting/forecastEvaluation.ts",
      "src/engine/ledgerCsvImport.ts",
      "src/engine/statementPickerDiagnostics.ts",
      "src/store/useForecastEvaluationStore.ts",
    ],
  }
]);

