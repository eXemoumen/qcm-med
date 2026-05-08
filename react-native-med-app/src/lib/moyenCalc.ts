import type { YearLevel } from "@/types";

export type MoyenInputType = "uei" | "module" | "annual";

export interface MoyenInputItem {
  id: string;
  label: string;
  semester?: "S1" | "S2";
  type: MoyenInputType;
  coefficient: number;
}

export interface MoyenYearConfig {
  year: YearLevel;
  label: string;
  totalCoefficients: number;
  items: MoyenInputItem[];
}

export interface MoyenCalculationResult {
  weightedSum: number;
  totalCoefficients: number;
  completedCount: number;
  missingCount: number;
  invalidCount: number;
  missingItemIds: string[];
  invalidItemIds: string[];
  moyenne: number | null;
  isComplete: boolean;
}

export const YEAR_CONFIGS: Record<YearLevel, MoyenYearConfig> = {
  "1": {
    year: "1",
    label: "1ère Année",
    totalCoefficients: 16,
    items: [
      { id: "anatomie-s1", label: "Anatomie S1", semester: "S1", type: "annual", coefficient: 1 },
      { id: "anatomie-s2", label: "Anatomie S2", semester: "S2", type: "annual", coefficient: 1 },
      { id: "biochimie-s1", label: "Biochimie S1", semester: "S1", type: "annual", coefficient: 1 },
      { id: "biochimie-s2", label: "Biochimie S2", semester: "S2", type: "annual", coefficient: 1 },
      { id: "biophysique-s1", label: "Biophysique S1", semester: "S1", type: "annual", coefficient: 1 },
      { id: "biophysique-s2", label: "Biophysique S2", semester: "S2", type: "annual", coefficient: 1 },
      { id: "biostat-info-s1", label: "Biostatistique - Informatique S1", semester: "S1", type: "annual", coefficient: 1 },
      { id: "biostat-info-s2", label: "Biostatistique - Informatique S2", semester: "S2", type: "annual", coefficient: 1 },
      { id: "chimie-s1", label: "Chimie S1", semester: "S1", type: "annual", coefficient: 1 },
      { id: "chimie-s2", label: "Chimie S2", semester: "S2", type: "annual", coefficient: 1 },
      { id: "cytologie-s1", label: "Cytologie S1", semester: "S1", type: "annual", coefficient: 1 },
      { id: "cytologie-s2", label: "Cytologie S2", semester: "S2", type: "annual", coefficient: 1 },
      { id: "embryologie", label: "Embryologie", semester: "S1", type: "module", coefficient: 1 },
      { id: "histologie", label: "Histologie", semester: "S1", type: "module", coefficient: 1 },
      { id: "physiologie", label: "Physiologie", semester: "S2", type: "module", coefficient: 1 },
      { id: "ssh", label: "S.S.H", semester: "S2", type: "module", coefficient: 1 },
    ],
  },
  "2": {
    year: "2",
    label: "2ème Année",
    totalCoefficients: 12,
    items: [
      { id: "uei-cardio-respi", label: "Cardio-vasculaire et Respiratoire", type: "uei", coefficient: 2 },
      { id: "uei-digestif", label: "Digestif", type: "uei", coefficient: 2 },
      { id: "uei-urinaire", label: "Urinaire", type: "uei", coefficient: 2 },
      { id: "uei-endocrinien-reproduction", label: "Endocrinien et Reproduction", type: "uei", coefficient: 2 },
      { id: "uei-nerveux-sens", label: "Nerveux et Organes des Sens", type: "uei", coefficient: 2 },
      { id: "genetique", label: "Génétique", type: "module", coefficient: 1 },
      { id: "immunologie", label: "Immunologie", type: "module", coefficient: 1 },
    ],
  },
  "3": {
    year: "3",
    label: "3ème Année",
    totalCoefficients: 13,
    items: [
      { id: "uei-cardio-respi-psy", label: "Cardiovasculaire, Respiratoire, Psychologie", type: "uei", coefficient: 2 },
      { id: "uei-neuro-loco-cutane", label: "Neurologique, Locomoteur, Cutané", type: "uei", coefficient: 2 },
      { id: "uei-endocrinien-repro-urinaire", label: "Endocrinien, Reproduction, Urinaire", type: "uei", coefficient: 2 },
      { id: "uei-digestif-hemato", label: "Digestif, Hématopoïétiques", type: "uei", coefficient: 2 },
      { id: "anat-path", label: "Anatomie pathologique", type: "module", coefficient: 1 },
      { id: "immunologie-3", label: "Immunologie", type: "module", coefficient: 1 },
      { id: "pharmacologie", label: "Pharmacologie", type: "module", coefficient: 1 },
      { id: "microbiologie", label: "Microbiologie", type: "module", coefficient: 1 },
      { id: "parasitologie", label: "Parasitologie", type: "module", coefficient: 1 },
    ],
  },
};

export function getMoyenYearConfig(year: YearLevel | null | undefined): MoyenYearConfig {
  return YEAR_CONFIGS[year || "2"] || YEAR_CONFIGS["2"];
}

export function createInitialMoyenValues(year: YearLevel): Record<string, string> {
  return YEAR_CONFIGS[year].items.reduce<Record<string, string>>((values, item) => {
    values[item.id] = "";
    return values;
  }, {});
}

export function parseNoteInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");

  if (normalized.length === 0) {
    return null;
  }

  if (!/^\d{1,2}(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 20) {
    return null;
  }

  return value;
}

export function calculateMoyenne(
  year: YearLevel,
  values: Record<string, string>,
): MoyenCalculationResult {
  const config = YEAR_CONFIGS[year];
  let weightedSum = 0;
  let completedCount = 0;
  const missingItemIds: string[] = [];
  const invalidItemIds: string[] = [];

  for (const item of config.items) {
    const raw = values[item.id] ?? "";
    const parsed = parseNoteInput(raw);

    if (raw.trim().length === 0) {
      missingItemIds.push(item.id);
      continue;
    }

    if (parsed === null) {
      invalidItemIds.push(item.id);
      continue;
    }

    weightedSum += parsed * item.coefficient;
    completedCount += 1;
  }

  const missingCount = missingItemIds.length + invalidItemIds.length;
  const invalidCount = invalidItemIds.length;
  const isComplete = missingCount === 0;
  const moyenne = isComplete
    ? Number((weightedSum / config.totalCoefficients).toFixed(2))
    : null;

  return {
    weightedSum: Number(weightedSum.toFixed(2)),
    totalCoefficients: config.totalCoefficients,
    completedCount,
    missingCount,
    invalidCount,
    missingItemIds,
    invalidItemIds,
    moyenne,
    isComplete,
  };
}
