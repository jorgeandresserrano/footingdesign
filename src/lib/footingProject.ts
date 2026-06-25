// Portable `.footing` project files: a versioned, human-readable JSON snapshot
// of the full workspace, re-imported with schema validation.
//
// State is stored verbatim in its current unit system (plus a `units` field),
// so a file round-trips byte-faithfully whether the workspace is SI or USC.

import type {
  BuildingCode,
  ConcreteStandard,
  LoadStandard,
  ReinforcementInputs,
  SoilTreatmentMode,
} from "./footingEngine";
import type { DisplayPrecisionSpec } from "./displayPrecision";
import type { FootingGeometry } from "@/components/footing/FootingModel3d";
import type {
  LoadCase,
  LoadCombinationType,
  MaterialInputs,
  UnitSystem,
} from "@/app/page";

export const FOOTING_SCHEMA_VERSION = 1;

export interface FootingProjectFile {
  schemaVersion: number;
  modelName: string;
  units: UnitSystem;
  buildingCode: BuildingCode;
  loadStandard: LoadStandard;
  concreteStandard: ConcreteStandard;
  displayPrecision: DisplayPrecisionSpec;
  loadCombinationType: LoadCombinationType;
  soilTreatmentMode: SoilTreatmentMode;
  concreteModulusOverridden: boolean;
  geometry: FootingGeometry;
  materials: MaterialInputs;
  reinforcement: ReinforcementInputs;
  serviceLoadCases: LoadCase[];
  strengthLoadCases: LoadCase[];
}

export type FootingProjectState = Omit<FootingProjectFile, "schemaVersion">;

export function serializeProject(
  state: FootingProjectState
): FootingProjectFile {
  return { schemaVersion: FOOTING_SCHEMA_VERSION, ...state };
}

function slug(name: string) {
  const cleaned = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return cleaned || "footing";
}

export function downloadProject(state: FootingProjectState) {
  const blob = new Blob([JSON.stringify(serializeProject(state), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug(state.modelName)}.footing`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateProject(value: unknown): FootingProjectFile {
  if (!isObject(value)) {
    throw new Error("Project file must contain a JSON object.");
  }
  if (value.schemaVersion !== FOOTING_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported project schema version: ${String(value.schemaVersion)}. Expected ${FOOTING_SCHEMA_VERSION}.`
    );
  }
  if (
    !isObject(value.geometry) ||
    !isObject(value.materials) ||
    !isObject(value.reinforcement) ||
    !isObject(value.displayPrecision)
  ) {
    throw new Error(
      "Project file is missing the geometry, materials, reinforcement, or precision sections."
    );
  }
  if (
    !Array.isArray(value.serviceLoadCases) ||
    !Array.isArray(value.strengthLoadCases)
  ) {
    throw new Error("Project file is missing the service or strength load tables.");
  }
  if (value.units !== "SI" && value.units !== "USC") {
    throw new Error(`Project file has an invalid unit system: ${String(value.units)}.`);
  }
  return value as unknown as FootingProjectFile;
}
