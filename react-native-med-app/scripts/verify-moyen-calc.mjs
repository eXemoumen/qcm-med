import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(projectRoot, "src", "lib", "moyenCalc.ts");

function loadMoyenCalcModule() {
  const source = fs.readFileSync(modulePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  }).outputText;

  const module = { exports: {} };
  const context = vm.createContext({
    exports: module.exports,
    module,
    require,
    console,
    __DEV__: false,
  });
  vm.runInContext(transpiled, context, { filename: modulePath });
  return module.exports;
}

const {
  YEAR_CONFIGS,
  calculateMoyenne,
  createInitialMoyenValues,
  parseNoteInput,
} = loadMoyenCalcModule();

assert.equal(YEAR_CONFIGS["1"].items.length, 16);
assert.equal(YEAR_CONFIGS["1"].totalCoefficients, 16);
assert.equal(YEAR_CONFIGS["2"].totalCoefficients, 12);
assert.equal(YEAR_CONFIGS["3"].totalCoefficients, 13);

assert.equal(parseNoteInput("14,5"), 14.5);
assert.equal(parseNoteInput("14.25"), 14.25);
assert.equal(parseNoteInput(""), null);
assert.equal(parseNoteInput("-1"), null);
assert.equal(parseNoteInput("21"), null);

for (const year of ["1", "2", "3"]) {
  const values10 = createInitialMoyenValues(year);
  const values20 = createInitialMoyenValues(year);

  for (const item of YEAR_CONFIGS[year].items) {
    values10[item.id] = "10";
    values20[item.id] = "20";
  }

  assert.equal(calculateMoyenne(year, values10).moyenne, 10);
  assert.equal(calculateMoyenne(year, values20).moyenne, 20);
  assert.equal(calculateMoyenne(year, values10).isComplete, true);
}

const incomplete = createInitialMoyenValues("2");
incomplete["uei-cardio-respi"] = "14,5";
const incompleteResult = calculateMoyenne("2", incomplete);
assert.equal(incompleteResult.isComplete, false);
assert.equal(incompleteResult.completedCount, 1);
assert.equal(incompleteResult.missingCount, 6);
assert.equal(incompleteResult.moyenne, null);

console.log("Moyen Calc verification passed");
