"use client";

import katex from "katex";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Building2,
  Calculator,
  CheckCircle2,
  Copy,
  Download,
  Info,
  MinusCircle,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NumField } from "@/components/footing/NumField";
import { TableOfContents } from "@/components/footing/TableOfContents";
import { ContactPlan } from "@/components/footing/ContactPlan";
import type { FootingGeometry } from "@/components/footing/FootingModel3d";
import {
  calculateFootingDesign,
  type CheckStatus,
  type CheckUnit,
  type ContactPlanCase,
  type DesignCheck,
  type ReinforcementInputs as EngineReinforcementInputs,
  type SoilTreatmentMode,
} from "@/lib/footingEngine";
import { createFootingCalculationBriefHtml } from "@/lib/footingReport";
import {
  downloadProject,
  validateProject,
  type FootingProjectState,
} from "@/lib/footingProject";
import {
  DEFAULT_DISPLAY_PRECISION,
  DISPLAY_PRECISION_ROWS,
  clampDisplayDigits,
  displayDigitsForUnit,
  type DisplayPrecisionSpec,
} from "@/lib/displayPrecision";

const FootingModel3d = dynamic(
  () =>
    import("@/components/footing/FootingModel3d").then(
      (module) => module.FootingModel3d
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] items-center justify-center rounded-md border bg-slate-100 text-sm text-muted-foreground dark:bg-slate-900 sm:h-[420px]">
        Loading 3D model...
      </div>
    ),
  }
);

export type UnitSystem = "SI" | "USC";
type BuildingCode =
  | "IBC-2018"
  | "IBC-2024"
  | "NBCC-2015"
  | "NBCC-2020"
  | "NBCC-2025";
type LoadStandard = "ASCE 7-16" | "ASCE 7-22" | "none";
type ConcreteStandard =
  | "ACI 318-14"
  | "ACI 318-19"
  | "CSA A23.3-14"
  | "CSA A23.3-19"
  | "CSA A23.3-24";

const M_TO_FT = 3.28084;
const MPA_TO_KSI = 0.1450377377;
const KN_M3_TO_PCF = 6.365880986;
const MM_TO_IN = 0.0393700787;
const KPA_TO_KSF = 0.0208854342;
const KN_TO_KIP = 0.2248089431;
const KN_M_TO_KIP_FT = 0.7375621493;
const KN_PER_M_TO_KIP_PER_FT = KN_TO_KIP / M_TO_FT;
const KN_M_PER_M_TO_KIP_FT_PER_FT = KN_M_TO_KIP_FT / M_TO_FT;
const MM2_PER_M_TO_IN2_PER_FT = 0.0015500031 / M_TO_FT;
const PCI_TO_KN_M3 = 271.4471412;
const APP_DATE = "2026-06-24";
const APP_VERSION = "7";
const DisplayPrecisionContext = createContext<DisplayPrecisionSpec>(
  DEFAULT_DISPLAY_PRECISION
);

function useDisplayPrecision() {
  return useContext(DisplayPrecisionContext);
}

function formatForUnit(
  value: number,
  unit?: string,
  digits?: number,
  precision?: DisplayPrecisionSpec
) {
  return fmt(value, digits ?? displayDigitsForUnit(unit, precision));
}

function formatTexForUnit(
  value: string,
  unit: string,
  precision?: DisplayPrecisionSpec
) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed)
    ? formatForUnit(parsed, unit, undefined, precision).replace(/,/g, "{,}")
    : value;
}

const BUILDING_CODE_OPTIONS: BuildingCode[] = [
  "IBC-2018",
  "IBC-2024",
  "NBCC-2015",
  "NBCC-2020",
  "NBCC-2025",
];

type MathTextPattern = {
  pattern: RegExp;
  tex: (match: RegExpMatchArray, precision: DisplayPrecisionSpec) => string;
};

const CODE_REFERENCES: Record<
  BuildingCode,
  { loadStandard: LoadStandard; concreteStandard: ConcreteStandard }
> = {
  "IBC-2018": {
    loadStandard: "ASCE 7-16",
    concreteStandard: "ACI 318-14",
  },
  "IBC-2024": {
    loadStandard: "ASCE 7-22",
    concreteStandard: "ACI 318-19",
  },
  "NBCC-2015": {
    loadStandard: "none",
    concreteStandard: "CSA A23.3-14",
  },
  "NBCC-2020": {
    loadStandard: "none",
    concreteStandard: "CSA A23.3-19",
  },
  "NBCC-2025": {
    loadStandard: "none",
    concreteStandard: "CSA A23.3-24",
  },
};

const MATH_TEXT_PATTERNS: MathTextPattern[] = [
  {
    pattern: /q = P\/A \+\/- Mx\/Sx \+\/- Mz\/Sz/,
    tex: () => "q = \\frac{P}{A} \\pm \\frac{M_x}{S_x} \\pm \\frac{M_z}{S_z}",
  },
  {
    pattern: /q = N\/A \+\/- Mx\/Sx \+\/- Mz\/Sz/,
    tex: () => "q = \\frac{N}{A} \\pm \\frac{M_x}{S_x} \\pm \\frac{M_z}{S_z}",
  },
  {
    pattern: /H <= mu N \/ ([0-9.]+)/,
    tex: (match) => `H \\le \\frac{\\mu N}{${match[1]}}`,
  },
  {
    pattern: /phi Vc = 0\.75 x 0\.17 lambda sqrt\(fc'\) bw d/,
    tex: () => "\\phi V_c = 0.75 \\times 0.17\\lambda\\sqrt{f'_c}\\,b_w d",
  },
  {
    pattern: /phi vc = 0\.75 x least concrete two-way shear stress/,
    tex: () => "\\phi v_c = 0.75 \\times \\text{least concrete two-way shear stress}",
  },
  {
    pattern: /phi_c = ([0-9.]+) and phi_s = ([0-9.]+)/,
    tex: (match) => `\\phi_c = ${match[1]}\\;\\text{and}\\;\\phi_s = ${match[2]}`,
  },
  {
    pattern: /phi = ([0-9.]+)/,
    tex: (match) => `\\phi = ${match[1]}`,
  },
  {
    pattern: /D\/L\/W\/E/,
    tex: () => "D/L/W/E",
  },
  {
    pattern: /1\.2D \+ 1\.6L/,
    tex: () => "1.2D + 1.6L",
  },
  {
    pattern: /1\.4D/,
    tex: () => "1.4D",
  },
  {
    pattern: /D \+ L/,
    tex: () => "D + L",
  },
  {
    pattern: /Hx\/Hz/,
    tex: () => "H_x/H_z",
  },
  {
    pattern: /Mx\/Mz/,
    tex: () => "M_x/M_z",
  },
  {
    pattern: /\bP\b/,
    tex: () => "P",
  },
  {
    pattern: /\bT\b/,
    tex: () => "T",
  },
  {
    pattern: /0\.002Ag/,
    tex: () => "0.002A_g",
  },
  {
    pattern: /c\/d/,
    tex: () => "c/d",
  },
  {
    pattern: /d\/2/,
    tex: () => "d/2",
  },
  {
    pattern: /N = ([0-9.,-]+) kN/,
    tex: (match, precision) =>
      `N = ${formatTexForUnit(match[1], "kN", precision)}\\,\\mathrm{kN}`,
  },
  {
    pattern: /Mx = ([0-9.,-]+) kN-m, Mz = ([0-9.,-]+) kN-m/,
    tex: (match, precision) =>
      `M_x = ${formatTexForUnit(
        match[1],
        "kN-m",
        precision
      )}\\,\\mathrm{kN\\cdot m},\\ M_z = ${formatTexForUnit(
        match[2],
        "kN-m",
        precision
      )}\\,\\mathrm{kN\\cdot m}`,
  },
  {
    pattern: /qmin = ([0-9.,-]+) kPa/,
    tex: (match, precision) =>
      `q_{min} = ${formatTexForUnit(match[1], "kPa", precision)}\\,\\mathrm{kPa}`,
  },
  {
    pattern: /qmin >= 0 (kPa|ksf)/,
    tex: (match) => `q_{min} \\ge 0\\,\\mathrm{${match[1]}}`,
  },
  {
    pattern: /FS = ([0-9.,-]+|infinite)/,
    tex: (match) => `FS = ${match[1] === "infinite" ? "\\infty" : match[1]}`,
  },
  {
    pattern: /Le = ([0-9.,-]+) m from \(Ec h\^3 \/ 3ks\)\^0\.25\./,
    tex: (match, precision) =>
      `L_e = ${formatTexForUnit(match[1], "m", precision)}\\,\\mathrm{m}\\;\\text{from}\\;\\left(\\frac{E_c h^3}{3k_s}\\right)^{1/4}`,
  },
  {
    pattern: /Leff\/Le <= 1\.75/,
    tex: () => "\\frac{L_{eff}}{L_e} \\le 1.75",
  },
  {
    pattern: /Leff = 4a/,
    tex: () => "L_{eff} = 4a",
  },
  {
    pattern: /a_x = ([0-9.,-]+) m, a_z = ([0-9.,-]+) m; a_max = ([0-9.,-]+) m/,
    tex: (match, precision) =>
      `a_x = ${formatTexForUnit(match[1], "m", precision)}\\,\\mathrm{m},\\ a_z = ${formatTexForUnit(match[2], "m", precision)}\\,\\mathrm{m};\\ a_{max} = ${formatTexForUnit(match[3], "m", precision)}\\,\\mathrm{m}`,
  },
  {
    pattern:
      /Governing Leff\/Le = ([0-9.,-]+) vs 1\.75; minimum Le for current projection = ([0-9.,-]+) m\./,
    tex: (match, precision) =>
      `\\max\\left(\\frac{L_{eff}}{L_e}\\right) = ${match[1]}\\ \\text{vs}\\ 1.75;\\ L_{e,min} = ${formatTexForUnit(match[2], "m", precision)}\\,\\mathrm{m}`,
  },
  {
    pattern: /dX = ([0-9.,-]+) mm, dZ = ([0-9.,-]+) mm/,
    tex: (match, precision) =>
      `d_x = ${formatTexForUnit(match[1], "mm", precision)}\\,\\mathrm{mm},\\ d_z = ${formatTexForUnit(
        match[2],
        "mm",
        precision
      )}\\,\\mathrm{mm}`,
  },
  {
    pattern: /Provided AsX = ([0-9.,-]+) mm2\/m/,
    tex: (match, precision) =>
      `A_{s,x} = ${formatTexForUnit(match[1], "mm2/m", precision)}\\,\\mathrm{mm^2/m}`,
  },
  {
    pattern: /Provided AsZ = ([0-9.,-]+) mm2\/m/,
    tex: (match, precision) =>
      `A_{s,z} = ${formatTexForUnit(match[1], "mm2/m", precision)}\\,\\mathrm{mm^2/m}`,
  },
  {
    pattern: /Required As = ([0-9.,-]+) mm2\/m; provided As = ([0-9.,-]+) mm2\/m/,
    tex: (match, precision) =>
      `A_{s,req} = ${formatTexForUnit(
        match[1],
        "mm2/m",
        precision
      )}\\,\\mathrm{mm^2/m};\\ A_s = ${formatTexForUnit(
        match[2],
        "mm2/m",
        precision
      )}\\,\\mathrm{mm^2/m}`,
  },
  {
    pattern: /c = ([0-9.,-]+) mm, limit = ([0-9.,-]+) mm/,
    tex: (match, precision) =>
      `c = ${formatTexForUnit(match[1], "mm", precision)}\\,\\mathrm{mm},\\ c_{limit} = ${formatTexForUnit(
        match[2],
        "mm",
        precision
      )}\\,\\mathrm{mm}`,
  },
  {
    pattern: /bo = ([0-9.,-]+) mm, d = ([0-9.,-]+) mm/,
    tex: (match, precision) =>
      `b_o = ${formatTexForUnit(match[1], "mm", precision)}\\,\\mathrm{mm},\\ d = ${formatTexForUnit(
        match[2],
        "mm",
        precision
      )}\\,\\mathrm{mm}`,
  },
  {
    pattern:
      /vu direct = ([0-9.,-]+) MPa, vu\(Mx\) = ([0-9.,-]+) MPa, vu\(Mz\) = ([0-9.,-]+) MPa/,
    tex: (match) =>
      `v_u = ${match[1]}\\,\\mathrm{MPa},\\ v_u(M_x) = ${match[2]}\\,\\mathrm{MPa},\\ v_u(M_z) = ${match[3]}\\,\\mathrm{MPa}`,
  },
  {
    pattern: /s_max = q_max \/ k_s/,
    tex: () => "s_{max} = \\frac{q_{max}}{k_s}",
  },
  {
    pattern: /qmax = ([0-9.,-]+) kPa/,
    tex: (match, precision) =>
      `q_{max} = ${formatTexForUnit(match[1], "kPa", precision)}\\,\\mathrm{kPa}`,
  },
  {
    pattern: /theta_x = \|dq\/dz\| \/ k_s/,
    tex: () => "\\theta_x = \\frac{\\lvert dq/dz \\rvert}{k_s}",
  },
  {
    pattern: /theta_z = \|dq\/dx\| \/ k_s/,
    tex: () => "\\theta_z = \\frac{\\lvert dq/dx \\rvert}{k_s}",
  },
  {
    pattern: /dq\/dz = ([0-9.,-]+) kPa\/m/,
    tex: (match, precision) =>
      `\\frac{dq}{dz} = ${formatTexForUnit(match[1], "kPa", precision)}\\,\\mathrm{kPa/m}`,
  },
  {
    pattern: /dq\/dx = ([0-9.,-]+) kPa\/m/,
    tex: (match, precision) =>
      `\\frac{dq}{dx} = ${formatTexForUnit(match[1], "kPa", precision)}\\,\\mathrm{kPa/m}`,
  },
  {
    pattern: /([0-9.]+) \|Mx\| <= N B\/2/,
    tex: (match) => `${match[1]}\\,\\lvert M_x \\rvert \\le \\frac{NB}{2}`,
  },
  {
    pattern: /([0-9.]+) \|Mz\| <= N L\/2/,
    tex: (match) => `${match[1]}\\,\\lvert M_z \\rvert \\le \\frac{NL}{2}`,
  },
];

export interface MaterialInputs {
  concreteStrength: number;
  concreteElasticModulus: number;
  rebarYield: number;
  concreteUnitWeight: number;
  soilUnitWeight: number;
  saturatedSoilUnitWeight: number;
  waterUnitWeight: number;
  clearCover: number;
  allowableBearing: number;
  ultimateBearing: number;
  subgradeReactionModulus: number;
  soilFrictionCoefficient: number;
  slidingSafetyFactor: number;
  overturningSafetyFactor: number;
  allowableSettlement: number;
  allowableRotationX: number;
  allowableRotationZ: number;
  minimumContactRatio: number;
}

export interface LoadCase {
  id: string;
  name: string;
  P: number;
  Hx: number;
  Hz: number;
  Mx: number;
  Mz: number;
  T: number;
  foundationDeadLoadFactor: number;
}

type ReinforcementInputs = EngineReinforcementInputs;

export type LoadCombinationType = "service" | "strength";
type LoadCaseColumn =
  | "name"
  | "P"
  | "Hx"
  | "Hz"
  | "Mx"
  | "Mz"
  | "T"
  | "foundationDeadLoadFactor";
type CellPosition = { row: number; column: number };
type SelectionRange = { start: CellPosition; end: CellPosition };
type EditingCell = CellPosition | null;

// A soil-contact-plan case as offered in the selector: a renderable case plus
// its load-combination kind and which criticality marks it carries.
type ContactPlanOption = ContactPlanCase & {
  kind: "service" | "strength";
  key: string;
  peak: number;
  bearingCritical: boolean;
  upliftCritical: boolean;
};

const DEFAULT_GEOMETRY_SI: FootingGeometry = {
  footingLength: 2.4,
  footingWidth: 2.4,
  footingThickness: 0.6,
  soilCoverDepth: 0.6,
  frostDepth: 1.2,
  groundwaterDepth: 1.5,
  pedestalLength: 0.6,
  pedestalWidth: 0.6,
  pedestalHeight: 1.6,
  pedestalOffsetX: 0,
  pedestalOffsetZ: 0,
};

const DEFAULT_MATERIALS_SI: MaterialInputs = {
  concreteStrength: 30,
  concreteElasticModulus: concreteElasticModulusFromStrength(30, "SI"),
  rebarYield: 420,
  concreteUnitWeight: 23.5,
  soilUnitWeight: 18,
  saturatedSoilUnitWeight: 20,
  waterUnitWeight: 9.81,
  clearCover: 75,
  allowableBearing: 200,
  ultimateBearing: 400,
  subgradeReactionModulus: 45000,
  soilFrictionCoefficient: 0.45,
  slidingSafetyFactor: 1.5,
  overturningSafetyFactor: 1.5,
  allowableSettlement: 25,
  allowableRotationX: 0.003,
  allowableRotationZ: 0.003,
  minimumContactRatio: 100,
};

const DEFAULT_REINFORCEMENT_SI: ReinforcementInputs = {
  barDiameterX: 25,
  barSpacingX: 200,
  barDiameterZ: 25,
  barSpacingZ: 200,
};

const SOIL_TREATMENT_OPTIONS: Array<{
  value: SoilTreatmentMode;
  label: string;
}> = [
  { value: "ignored", label: "Ignore" },
  {
    value: "service",
    label: "Use for serviceability and stability checks",
  },
  {
    value: "full",
    label: "Use for serviceability, stability and strength checks",
  },
];

const METRIC_REBARS = [
  { label: "10M", diameter: 11.3 },
  { label: "15M", diameter: 16 },
  { label: "20M", diameter: 19.5 },
  { label: "25M", diameter: 25.2 },
  { label: "30M", diameter: 29.9 },
  { label: "35M", diameter: 35.7 },
  { label: "45M", diameter: 43.7 },
  { label: "55M", diameter: 56.4 },
];

const US_REBARS = [
  { label: "#3", diameter: 0.375 },
  { label: "#4", diameter: 0.5 },
  { label: "#5", diameter: 0.625 },
  { label: "#6", diameter: 0.75 },
  { label: "#7", diameter: 0.875 },
  { label: "#8", diameter: 1 },
  { label: "#9", diameter: 1.128 },
  { label: "#10", diameter: 1.27 },
  { label: "#11", diameter: 1.41 },
  { label: "#14", diameter: 1.693 },
  { label: "#18", diameter: 2.257 },
];

function rebarOptions(units: UnitSystem) {
  return units === "SI" ? METRIC_REBARS : US_REBARS;
}

function nearestRebarDiameter(value: number, units: UnitSystem) {
  return rebarOptions(units).reduce((best, option) =>
    Math.abs(option.diameter - value) < Math.abs(best.diameter - value)
      ? option
      : best
  ).diameter;
}

const LOAD_CASE_COLUMNS: Array<{
  key: LoadCaseColumn;
  label: string;
  unitType: "text" | "force" | "moment" | "factor";
}> = [
  { key: "name", label: "Load case", unitType: "text" },
  { key: "P", label: "P", unitType: "force" },
  { key: "Hx", label: "Hx", unitType: "force" },
  { key: "Hz", label: "Hz", unitType: "force" },
  { key: "Mx", label: "Mx", unitType: "moment" },
  { key: "Mz", label: "Mz", unitType: "moment" },
  { key: "T", label: "T", unitType: "moment" },
];

const STRENGTH_LOAD_CASE_COLUMNS: Array<{
  key: LoadCaseColumn;
  label: string;
  unitType: "text" | "force" | "moment" | "factor";
}> = [
  ...LOAD_CASE_COLUMNS,
  {
    key: "foundationDeadLoadFactor",
    label: "Foundation D factor",
    unitType: "factor",
  },
];

const DEFAULT_LOAD_CASES_SI: LoadCase[] = [
  {
    id: "load-1",
    name: "D",
    P: 600,
    Hx: 0,
    Hz: 0,
    Mx: 0,
    Mz: 0,
    T: 0,
    foundationDeadLoadFactor: 1,
  },
  {
    id: "load-2",
    name: "D + L",
    P: 750,
    Hx: 25,
    Hz: 25,
    Mx: 80,
    Mz: 80,
    T: 0,
    foundationDeadLoadFactor: 1,
  },
];

const DEFAULT_STRENGTH_LOAD_CASES_SI: LoadCase[] = [
  {
    id: "strength-load-1",
    name: "1.4D",
    P: 840,
    Hx: 0,
    Hz: 0,
    Mx: 0,
    Mz: 0,
    T: 0,
    foundationDeadLoadFactor: 1.4,
  },
  {
    id: "strength-load-2",
    name: "1.2D + 1.6L",
    P: 1200,
    Hx: 40,
    Hz: 40,
    Mx: 128,
    Mz: 128,
    T: 0,
    foundationDeadLoadFactor: 1.2,
  },
];

function blankLoadCase(id: string, foundationDeadLoadFactor = 1): LoadCase {
  return {
    id,
    name: "",
    P: 0,
    Hx: 0,
    Hz: 0,
    Mx: 0,
    Mz: 0,
    T: 0,
    foundationDeadLoadFactor,
  };
}

function isEmptyLoadCase(loadCase: LoadCase) {
  return (
    loadCase.name.trim() === "" &&
    loadCase.P === 0 &&
    loadCase.Hx === 0 &&
    loadCase.Hz === 0 &&
    loadCase.Mx === 0 &&
    loadCase.Mz === 0 &&
    loadCase.T === 0
  );
}

function nameUntitledLoadCases(loadCases: LoadCase[]) {
  return loadCases.map((loadCase, index) =>
    !isEmptyLoadCase(loadCase) && loadCase.name.trim() === ""
      ? { ...loadCase, name: `Untitled LC # ${index + 1}` }
      : loadCase
  );
}

function ensureTrailingBlank(loadCases: LoadCase[]) {
  const next = [...loadCases];
  while (next.length > 0 && isEmptyLoadCase(next[next.length - 1])) {
    next.pop();
  }
  const foundationDeadLoadFactor =
    next[next.length - 1]?.foundationDeadLoadFactor ?? 1;
  return [
    ...next,
    blankLoadCase(`load-blank-${Date.now()}`, foundationDeadLoadFactor),
  ];
}

function roundLength(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundMaterial(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundAutoCalculatedMaterial(value: number) {
  return Math.round(value);
}

function concreteElasticModulusFromStrength(
  concreteStrength: number,
  units: UnitSystem
) {
  const strength = Math.max(concreteStrength, 0);
  if (units === "SI") return roundAutoCalculatedMaterial(4700 * Math.sqrt(strength));
  return roundAutoCalculatedMaterial(1802.5 * Math.sqrt(strength));
}

function convertGeometry(
  geometry: FootingGeometry,
  from: UnitSystem,
  to: UnitSystem
): FootingGeometry {
  if (from === to) return geometry;
  const factor = from === "SI" ? M_TO_FT : 1 / M_TO_FT;
  return {
    footingLength: roundLength(geometry.footingLength * factor),
    footingWidth: roundLength(geometry.footingWidth * factor),
    footingThickness: roundLength(geometry.footingThickness * factor),
    soilCoverDepth: roundLength(geometry.soilCoverDepth * factor),
    frostDepth: roundLength(geometry.frostDepth * factor),
    groundwaterDepth: roundLength(geometry.groundwaterDepth * factor),
    pedestalLength: roundLength(geometry.pedestalLength * factor),
    pedestalWidth: roundLength(geometry.pedestalWidth * factor),
    pedestalHeight: roundLength(geometry.pedestalHeight * factor),
    pedestalOffsetX: roundLength(geometry.pedestalOffsetX * factor),
    pedestalOffsetZ: roundLength(geometry.pedestalOffsetZ * factor),
  };
}

function convertMaterials(
  materials: MaterialInputs,
  from: UnitSystem,
  to: UnitSystem
): MaterialInputs {
  if (from === to) return materials;
  const toUsc = from === "SI";
  return {
    concreteStrength: roundMaterial(
      materials.concreteStrength * (toUsc ? MPA_TO_KSI : 1 / MPA_TO_KSI)
    ),
    concreteElasticModulus: roundMaterial(
      materials.concreteElasticModulus *
        (toUsc ? MPA_TO_KSI : 1 / MPA_TO_KSI)
    ),
    rebarYield: roundMaterial(
      materials.rebarYield * (toUsc ? MPA_TO_KSI : 1 / MPA_TO_KSI)
    ),
    concreteUnitWeight: roundMaterial(
      materials.concreteUnitWeight * (toUsc ? KN_M3_TO_PCF : 1 / KN_M3_TO_PCF)
    ),
    soilUnitWeight: roundMaterial(
      materials.soilUnitWeight * (toUsc ? KN_M3_TO_PCF : 1 / KN_M3_TO_PCF)
    ),
    saturatedSoilUnitWeight: roundMaterial(
      materials.saturatedSoilUnitWeight *
        (toUsc ? KN_M3_TO_PCF : 1 / KN_M3_TO_PCF)
    ),
    waterUnitWeight: roundMaterial(
      materials.waterUnitWeight * (toUsc ? KN_M3_TO_PCF : 1 / KN_M3_TO_PCF)
    ),
    clearCover: roundMaterial(
      materials.clearCover * (toUsc ? MM_TO_IN : 1 / MM_TO_IN)
    ),
    allowableBearing: roundMaterial(
      materials.allowableBearing * (toUsc ? KPA_TO_KSF : 1 / KPA_TO_KSF)
    ),
    ultimateBearing: roundMaterial(
      materials.ultimateBearing * (toUsc ? KPA_TO_KSF : 1 / KPA_TO_KSF)
    ),
    subgradeReactionModulus: roundMaterial(
      materials.subgradeReactionModulus *
        (toUsc ? 1 / PCI_TO_KN_M3 : PCI_TO_KN_M3)
    ),
    soilFrictionCoefficient: materials.soilFrictionCoefficient,
    slidingSafetyFactor: materials.slidingSafetyFactor,
    overturningSafetyFactor: materials.overturningSafetyFactor,
    allowableSettlement: roundMaterial(
      materials.allowableSettlement * (toUsc ? MM_TO_IN : 1 / MM_TO_IN)
    ),
    allowableRotationX: materials.allowableRotationX,
    allowableRotationZ: materials.allowableRotationZ,
    minimumContactRatio: materials.minimumContactRatio,
  };
}

function convertReinforcement(
  reinforcement: ReinforcementInputs,
  from: UnitSystem,
  to: UnitSystem
): ReinforcementInputs {
  if (from === to) return reinforcement;
  const factor = from === "SI" ? MM_TO_IN : 1 / MM_TO_IN;
  return {
    barDiameterX: roundMaterial(reinforcement.barDiameterX * factor),
    barSpacingX: roundMaterial(reinforcement.barSpacingX * factor),
    barDiameterZ: roundMaterial(reinforcement.barDiameterZ * factor),
    barSpacingZ: roundMaterial(reinforcement.barSpacingZ * factor),
  };
}

function convertLoadCases(
  loads: LoadCase[],
  from: UnitSystem,
  to: UnitSystem
): LoadCase[] {
  if (from === to) return ensureTrailingBlank(loads);
  const toUsc = from === "SI";
  const forceFactor = toUsc ? KN_TO_KIP : 1 / KN_TO_KIP;
  const momentFactor = toUsc ? KN_M_TO_KIP_FT : 1 / KN_M_TO_KIP_FT;
  return ensureTrailingBlank(
    loads.map((load) => ({
      ...load,
      P: roundMaterial(load.P * forceFactor),
      Hx: roundMaterial(load.Hx * forceFactor),
      Hz: roundMaterial(load.Hz * forceFactor),
      Mx: roundMaterial(load.Mx * momentFactor),
      Mz: roundMaterial(load.Mz * momentFactor),
      T: roundMaterial(load.T * momentFactor),
    }))
  );
}

function defaultGeometry(units: UnitSystem): FootingGeometry {
  return units === "SI"
    ? DEFAULT_GEOMETRY_SI
    : convertGeometry(DEFAULT_GEOMETRY_SI, "SI", "USC");
}

function defaultMaterials(units: UnitSystem): MaterialInputs {
  return units === "SI"
    ? DEFAULT_MATERIALS_SI
    : convertMaterials(DEFAULT_MATERIALS_SI, "SI", "USC");
}

function defaultReinforcement(units: UnitSystem): ReinforcementInputs {
  return units === "SI"
    ? DEFAULT_REINFORCEMENT_SI
    : convertReinforcement(DEFAULT_REINFORCEMENT_SI, "SI", "USC");
}

function defaultLoadCases(units: UnitSystem): LoadCase[] {
  return units === "SI"
    ? ensureTrailingBlank(DEFAULT_LOAD_CASES_SI)
    : convertLoadCases(DEFAULT_LOAD_CASES_SI, "SI", "USC");
}

function defaultStrengthLoadCases(units: UnitSystem): LoadCase[] {
  return units === "SI"
    ? ensureTrailingBlank(DEFAULT_STRENGTH_LOAD_CASES_SI)
    : convertLoadCases(DEFAULT_STRENGTH_LOAD_CASES_SI, "SI", "USC");
}

function fmt(value: number, digits = 3) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function statusLabel(status: CheckStatus) {
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  if (status === "warning") return "Review";
  return "N/A";
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <CheckCircle2 className="size-3.5" />;
  if (status === "fail") return <XCircle className="size-3.5" />;
  if (status === "warning") return <AlertTriangle className="size-3.5" />;
  return <MinusCircle className="size-3.5" />;
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const className =
    status === "pass"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
      : status === "fail"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      : status === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
      : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300";

  return (
    <Badge variant="outline" className={className}>
      <StatusIcon status={status} />
      {statusLabel(status)}
    </Badge>
  );
}

function DenseRow({
  name,
  value,
  unit,
  reference,
  highlight,
}: {
  name: ReactNode;
  value: ReactNode;
  unit: string;
  reference: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 border-b py-1 transition-colors sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] " +
        (highlight
          ? "-mx-2 rounded bg-amber-50 px-2 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/35"
          : "hover:bg-slate-100 dark:hover:bg-slate-800/60")
      }
    >
      <span className={highlight ? "min-w-0 font-medium" : "min-w-0 text-muted-foreground"}>
        {name}
      </span>
      <span className="tabular-nums">{value}</span>
      <span className="w-16 text-right text-muted-foreground sm:w-24">{unit}</span>
      <span className="hidden w-24 text-right text-[10px] text-muted-foreground sm:block">
        {reference}
      </span>
    </div>
  );
}

function InlineMath({ tex }: { tex: string }) {
  return (
    <span
      className="mx-0.5 whitespace-nowrap align-baseline [&_.katex]:text-[1.04em]"
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(tex, {
          throwOnError: false,
          strict: false,
        }),
      }}
    />
  );
}

function MathUnit({ unit }: { unit: string }) {
  return <span>{unit}</span>;
}

function RebarSelect({
  id,
  label,
  value,
  units,
  onChange,
  tooltip,
}: {
  id: string;
  label: React.ReactNode;
  value: number;
  units: UnitSystem;
  onChange: (value: number) => void;
  tooltip?: React.ReactNode;
}) {
  const displayPrecision = useDisplayPrecision();
  const options = rebarOptions(units);
  const selected = nearestRebarDiameter(value, units);
  const unit = units === "SI" ? "mm" : "in";

  return (
    <div className="flex h-full flex-col space-y-1.5">
      <div className="flex flex-1 items-end gap-1.5">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info size={13} />
                </button>
              }
            />
            <TooltipContent className="max-w-md text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <Select value={String(selected)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger
          id={id}
          size="sm"
          className="mt-auto h-9 w-full justify-between px-3 text-sm"
          aria-label={typeof label === "string" ? label : id}
        >
          <SelectValue>
            {() => {
              const option = options.find((item) => item.diameter === selected);
              return option
                ? `${option.label} (${formatForUnit(option.diameter, unit, undefined, displayPrecision)} ${unit})`
                : `${formatForUnit(selected, unit, undefined, displayPrecision)} ${unit}`;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.label} value={String(option.diameter)}>
              {option.label} ({formatForUnit(option.diameter, unit, undefined, displayPrecision)} {unit})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MathValue({
  value,
  unit,
  digits,
}: {
  value: number | null;
  unit?: string;
  digits?: number;
}) {
  const displayPrecision = useDisplayPrecision();
  if (value === null) return <>N/A</>;
  if (!Number.isFinite(value)) return <InlineMath tex="\\infty" />;
  return (
    <>
      {formatForUnit(value, unit, digits, displayPrecision)}
      {unit ? ` ${unit}` : ""}
    </>
  );
}

function PlainEquationValue({
  symbol,
  value,
  unit,
  digits,
}: {
  symbol: string;
  value: number;
  unit: string;
  digits?: number;
}) {
  const displayPrecision = useDisplayPrecision();
  return (
    <>
      <FormulaValue tex={symbol} /> = {formatForUnit(value, unit, digits, displayPrecision)} {unit}
    </>
  );
}

function CheckValue({
  value,
  unit,
  units,
  digits,
}: {
  value: number | null;
  unit: CheckUnit;
  units: UnitSystem;
  digits?: number;
}) {
  if (value === null) return <>N/A</>;
  if (!Number.isFinite(value)) return <InlineMath tex="\\infty" />;
  const display = displayUnit(unit, units);
  return (
    <MathValue
      value={convertedValue(value, unit, units)}
      unit={display}
      digits={digits}
    />
  );
}

function FormulaValue({ tex }: { tex: string }) {
  return <InlineMath tex={tex} />;
}

function loadColumnLabel(column: { key: LoadCaseColumn; label: string }) {
  const labels: Partial<Record<LoadCaseColumn, string>> = {
    P: "P",
    Hx: "H_x",
    Hz: "H_z",
    Mx: "M_x",
    Mz: "M_z",
    T: "T",
    foundationDeadLoadFactor: "D_f",
  };
  const tex = labels[column.key];
  return tex ? <FormulaValue tex={tex} /> : column.label;
}

function MathText({ children }: { children: string }) {
  const displayPrecision = useDisplayPrecision();
  const segments: Array<string | { tex: string }> = [];
  let cursor = 0;

  while (cursor < children.length) {
    const remaining = children.slice(cursor);
    let nextMatch: RegExpMatchArray | null = null;
    let nextPattern: (typeof MATH_TEXT_PATTERNS)[number] | null = null;

    for (const pattern of MATH_TEXT_PATTERNS) {
      const match = remaining.match(pattern.pattern);
      if (match?.index === undefined) continue;
      if (
        !nextMatch ||
        match.index < nextMatch.index! ||
        (match.index === nextMatch.index! && match[0].length > nextMatch[0].length)
      ) {
        nextMatch = match;
        nextPattern = pattern;
      }
    }

    if (!nextMatch || !nextPattern || nextMatch.index === undefined) {
      segments.push(remaining);
      break;
    }

    if (nextMatch.index > 0) {
      segments.push(remaining.slice(0, nextMatch.index));
    }

    segments.push({ tex: nextPattern.tex(nextMatch, displayPrecision) });
    cursor += nextMatch.index + nextMatch[0].length;
  }

  return (
    <>
      {segments.map((segment, index) =>
        typeof segment === "string" ? (
          <span key={index}>{segment}</span>
        ) : (
          <InlineMath key={index} tex={segment.tex} />
        )
      )}
    </>
  );
}

function convertedValue(value: number, unit: CheckUnit, units: UnitSystem) {
  if (units === "SI") return value;
  if (unit === "kPa") return value * KPA_TO_KSF;
  if (unit === "kN") return value * KN_TO_KIP;
  if (unit === "kN-m") return value * KN_M_TO_KIP_FT;
  if (unit === "kN/m") return value * KN_PER_M_TO_KIP_PER_FT;
  if (unit === "kN-m/m") return value * KN_M_PER_M_TO_KIP_FT_PER_FT;
  if (unit === "MPa") return value * MPA_TO_KSI;
  if (unit === "mm") return value * MM_TO_IN;
  if (unit === "mm2/m") return value * MM2_PER_M_TO_IN2_PER_FT;
  return value;
}

function displayUnit(unit: CheckUnit, units: UnitSystem) {
  if (unit === "none") return "";
  if (unit === "ratio") return "";
  if (units === "SI") {
    if (unit === "mm2/m") return "mm²/m";
    if (unit === "kN-m") return "kN·m";
    if (unit === "kN-m/m") return "kN·m/m";
    return unit;
  }
  if (unit === "kPa") return "ksf";
  if (unit === "kN") return "kip";
  if (unit === "kN-m") return "kip·ft";
  if (unit === "kN/m") return "kip/ft";
  if (unit === "kN-m/m") return "kip·ft/ft";
  if (unit === "MPa") return "ksi";
  if (unit === "mm") return "in";
  if (unit === "mm2/m") return "in²/ft";
  return unit;
}

function utilizationText(check: DesignCheck) {
  if (check.utilization === null) return "N/A";
  if (!Number.isFinite(check.utilization)) return "inf";
  return fmt(check.utilization, 2);
}

const CONTACT_STATE_LABEL: Record<string, string> = {
  full: "Full",
  partial: "Partial",
  zero: "Uplift",
  failed: "Failed",
};

function parseNumericCell(value: string) {
  const parsed = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pedestalOffsetLimit(footingSize: number, pedestalSize: number) {
  return Math.max((footingSize - pedestalSize) / 2, 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function finiteNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clampPedestalOffsets(geometry: FootingGeometry): FootingGeometry {
  const limitX = pedestalOffsetLimit(
    geometry.footingLength,
    geometry.pedestalLength
  );
  const limitZ = pedestalOffsetLimit(
    geometry.footingWidth,
    geometry.pedestalWidth
  );

  return {
    ...geometry,
    pedestalOffsetX: clamp(
      finiteNumber(geometry.pedestalOffsetX),
      -limitX,
      limitX
    ),
    pedestalOffsetZ: clamp(
      finiteNumber(geometry.pedestalOffsetZ),
      -limitZ,
      limitZ
    ),
  };
}

function serializeLoadCases(
  loadCases: LoadCase[],
  columns: typeof LOAD_CASE_COLUMNS
) {
  const header = columns.map((column) => column.label).join("\t");
  const rows = loadCases.filter((loadCase) => !isEmptyLoadCase(loadCase)).map((loadCase) =>
    columns.map((column) =>
      column.key === "name" ? loadCase.name : String(loadCase[column.key])
    ).join("\t")
  );
  return [header, ...rows].join("\n");
}

function normalizedSelection(range: SelectionRange) {
  return {
    rowStart: Math.min(range.start.row, range.end.row),
    rowEnd: Math.max(range.start.row, range.end.row),
    columnStart: Math.min(range.start.column, range.end.column),
    columnEnd: Math.max(range.start.column, range.end.column),
  };
}

function isSameCell(a: CellPosition | null, b: CellPosition) {
  return a?.row === b.row && a.column === b.column;
}

function loadCaseCellSelector(position: CellPosition) {
  return `[data-load-cell="${position.row}-${position.column}"]`;
}

function serializeSelectedCells(
  loadCases: LoadCase[],
  columns: typeof LOAD_CASE_COLUMNS,
  range: SelectionRange
) {
  const { rowStart, rowEnd, columnStart, columnEnd } =
    normalizedSelection(range);
  const rows: string[] = [];
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    const loadCase = loadCases[rowIndex];
    if (!loadCase) continue;
    const cells: string[] = [];
    for (
      let columnIndex = columnStart;
      columnIndex <= columnEnd;
      columnIndex += 1
    ) {
      const column = columns[columnIndex];
      if (!column) continue;
      cells.push(
        column.key === "name" ? loadCase.name : String(loadCase[column.key])
      );
    }
    rows.push(cells.join("\t"));
  }
  return rows.join("\n");
}

export default function Home() {
  const [modelName, setModelName] = useState("Untitled footing");
  const [units, setUnits] = useState<UnitSystem>("SI");
  const [buildingCode, setBuildingCode] = useState<BuildingCode>("IBC-2018");
  const [loadStandard, setLoadStandard] =
    useState<LoadStandard>("ASCE 7-16");
  const [concreteStandard, setConcreteStandard] =
    useState<ConcreteStandard>("ACI 318-14");
  const [loadTableOpen, setLoadTableOpen] = useState(false);
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const [displayPrecision, setDisplayPrecision] = useState<DisplayPrecisionSpec>(
    DEFAULT_DISPLAY_PRECISION
  );
  const [loadCombinationType, setLoadCombinationType] =
    useState<LoadCombinationType>("service");
  const [soilTreatmentMode, setSoilTreatmentMode] =
    useState<SoilTreatmentMode>("service");
  const [isSelectingCells, setIsSelectingCells] = useState(false);
  const isSelectingCellsRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCells, setSelectedCells] = useState<SelectionRange | null>(
    null
  );
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editingCellValue, setEditingCellValue] = useState("");
  const [geometry, setGeometry] = useState<FootingGeometry>(
    defaultGeometry("SI")
  );
  const [materials, setMaterials] = useState<MaterialInputs>(
    defaultMaterials("SI")
  );
  const [concreteModulusOverridden, setConcreteModulusOverridden] =
    useState(false);
  const [reinforcement, setReinforcement] = useState<ReinforcementInputs>(
    defaultReinforcement("SI")
  );
  const [serviceLoadCases, setServiceLoadCases] = useState<LoadCase[]>(
    defaultLoadCases("SI")
  );
  const [strengthLoadCases, setStrengthLoadCases] = useState<LoadCase[]>(
    defaultStrengthLoadCases("SI")
  );
  const loadCases =
    loadCombinationType === "service" ? serviceLoadCases : strengthLoadCases;
  const loadCaseColumns =
    loadCombinationType === "service"
      ? LOAD_CASE_COLUMNS
      : STRENGTH_LOAD_CASE_COLUMNS;
  const loadCaseCount = loadCases.filter(
    (loadCase) => !isEmptyLoadCase(loadCase)
  ).length;
  const setCurrentLoadCases =
    loadCombinationType === "service"
      ? setServiceLoadCases
      : setStrengthLoadCases;
  const formatDisplay = (value: number, unit?: string, digits?: number) =>
    formatForUnit(value, unit, digits, displayPrecision);
  const texNumberDisplay = (value: number, unit: string) =>
    formatForUnit(value, unit, undefined, displayPrecision).replace(/,/g, "{,}");
  const updateDisplayPrecision = (
    key: keyof DisplayPrecisionSpec,
    value: number
  ) => {
    setDisplayPrecision((current) => ({
      ...current,
      [key]: clampDisplayDigits(value),
    }));
  };

  const lengthUnit = units === "SI" ? "m" : "ft";
  const strengthUnit = units === "SI" ? "MPa" : "ksi";
  const unitWeightUnit = units === "SI" ? "kN/m³" : "pcf";
  const coverUnit = units === "SI" ? "mm" : "in";
  const bearingUnit = units === "SI" ? "kPa" : "ksf";
  const subgradeReactionUnit = units === "SI" ? "(kN/m)/m²" : "pci";
  const forceUnit = units === "SI" ? "kN" : "kip";
  const momentUnit = units === "SI" ? "kN·m" : "kip·ft";
  const pedestalOffsetX = finiteNumber(geometry.pedestalOffsetX);
  const pedestalOffsetZ = finiteNumber(geometry.pedestalOffsetZ);
  const pedestalOffsetLimitX = pedestalOffsetLimit(
    geometry.footingLength,
    geometry.pedestalLength
  );
  const pedestalOffsetLimitZ = pedestalOffsetLimit(
    geometry.footingWidth,
    geometry.pedestalWidth
  );
  const concreteVolume = useMemo(
    () =>
      geometry.footingLength *
      geometry.footingWidth *
      geometry.footingThickness,
    [geometry]
  );
  const activeLoadCases = useMemo(
    () => serviceLoadCases.filter((loadCase) => !isEmptyLoadCase(loadCase)),
    [serviceLoadCases]
  );
  const activeStrengthLoadCases = useMemo(
    () => strengthLoadCases.filter((loadCase) => !isEmptyLoadCase(loadCase)),
    [strengthLoadCases]
  );
  const maxCompression = Math.max(
    0,
    ...activeLoadCases.map((loadCase) => loadCase.P)
  );
  const soilTreatmentLabel =
    SOIL_TREATMENT_OPTIONS.find((option) => option.value === soilTreatmentMode)
      ?.label ?? "Service / stability";
  const designResults = useMemo(() => {
    const siGeometry =
      units === "SI" ? geometry : convertGeometry(geometry, "USC", "SI");
    const siMaterials =
      units === "SI" ? materials : convertMaterials(materials, "USC", "SI");
    const siReinforcement =
      units === "SI"
        ? reinforcement
        : convertReinforcement(reinforcement, "USC", "SI");
    const siServiceLoads =
      units === "SI"
        ? activeLoadCases
        : convertLoadCases(activeLoadCases, "USC", "SI").filter(
            (loadCase) => !isEmptyLoadCase(loadCase)
          );
    const siStrengthLoads =
      units === "SI"
        ? activeStrengthLoadCases
        : convertLoadCases(activeStrengthLoadCases, "USC", "SI").filter(
            (loadCase) => !isEmptyLoadCase(loadCase)
          );

    return calculateFootingDesign({
      buildingCode,
      loadStandard,
      concreteStandard,
      soilTreatmentMode,
      geometry: siGeometry,
      materials: siMaterials,
      reinforcement: siReinforcement,
      serviceLoadCases: siServiceLoads,
      strengthLoadCases: siStrengthLoads,
    });
  }, [
    activeLoadCases,
    activeStrengthLoadCases,
    buildingCode,
    concreteStandard,
    geometry,
    loadStandard,
    materials,
    reinforcement,
    soilTreatmentMode,
    units,
  ]);
  const rigidityLimit = 1.75;
  const rigidityGoverningRatio =
    designResults.rigidity.ratioX === null ||
    designResults.rigidity.ratioZ === null
      ? null
      : Math.max(designResults.rigidity.ratioX, designResults.rigidity.ratioZ);
  const rigidityMaxProjection =
    designResults.rigidity.elasticLength === null
      ? null
      : (rigidityLimit * designResults.rigidity.elasticLength) / 4;
  const rigidityRatioPercent =
    rigidityGoverningRatio === null
      ? 0
      : Math.min(100, (rigidityGoverningRatio / rigidityLimit) * 100);
  const governingServiceBearing = designResults.serviceBearing.reduce<
    (typeof designResults.serviceBearing)[number] | null
  >(
    (governing, result) =>
      !governing || result.maxBearing > governing.maxBearing
        ? result
        : governing,
    null
  );
  // Unified list of selectable contact-plan cases (service + strength), each
  // flagged with whether it is the group's most critical for bearing (highest
  // peak soil pressure) or for uplift (least soil contact). The plan defaults to
  // the service case with the worst uplift; the user can pick any case.
  const contactPlanOptions = useMemo<ContactPlanOption[]>(() => {
    const toOption =
      (kind: ContactPlanOption["kind"]) =>
      (c: ContactPlanCase): ContactPlanOption => ({
        id: c.id,
        name: c.name,
        qx: c.qx,
        qz: c.qz,
        eccentricityX: c.eccentricityX,
        eccentricityZ: c.eccentricityZ,
        contactState: c.contactState,
        contactPercent: c.contactPercent,
        contactPolygon: c.contactPolygon,
        cornerPressures: c.cornerPressures,
        kind,
        key: `${kind}:${c.id}`,
        peak: Math.max(...c.cornerPressures, 0),
        bearingCritical: false,
        upliftCritical: false,
      });
    const service = designResults.serviceBearing.map(toOption("service"));
    const strength = designResults.strengthCases.map(toOption("strength"));
    for (const group of [service, strength]) {
      if (group.length === 0) continue;
      // Most critical for bearing: the highest peak soil pressure.
      let bearing = 0;
      group.forEach((o, i) => {
        if (o.peak > group[bearing].peak) bearing = i;
      });
      group[bearing].bearingCritical = true;
      // Most critical for uplift: the least soil contact — only meaningful when
      // some case actually lifts off (contact < 100%).
      if (group.some((o) => o.contactPercent < 100 - 1e-6)) {
        let uplift = 0;
        group.forEach((o, i) => {
          if (o.contactPercent < group[uplift].contactPercent) uplift = i;
        });
        group[uplift].upliftCritical = true;
      }
    }
    return [...service, ...strength];
  }, [designResults.serviceBearing, designResults.strengthCases]);

  // Default: the service case with the worst uplift, else worst service bearing.
  const defaultContactPlanKey = useMemo(() => {
    const service = contactPlanOptions.filter((o) => o.kind === "service");
    return (
      service.find((o) => o.upliftCritical)?.key ??
      service.find((o) => o.bearingCritical)?.key ??
      contactPlanOptions[0]?.key ??
      null
    );
  }, [contactPlanOptions]);

  const [selectedContactPlanKey, setSelectedContactPlanKey] = useState<
    string | null
  >(null);
  // Honor the user's pick while it still exists; otherwise fall back to default.
  const activeContactPlanKey =
    selectedContactPlanKey &&
    contactPlanOptions.some((o) => o.key === selectedContactPlanKey)
      ? selectedContactPlanKey
      : defaultContactPlanKey;
  const contactPlanCase =
    contactPlanOptions.find((o) => o.key === activeContactPlanKey) ?? null;
  const formatPressure = (kPa: number) =>
    `${formatDisplay(convertedValue(kPa, "kPa", units), bearingUnit)} ${bearingUnit}`;
  // The engine runs in SI, so the contact polygon and corner pressures are in
  // SI; the plan must use SI geometry to stay self-consistent (it's an unlabeled
  // shape, so the unit system itself is invisible).
  const siGeometryForPlan =
    units === "SI" ? geometry : convertGeometry(geometry, "USC", "SI");
  const governingStrengthCase = designResults.strengthCases.reduce<
    (typeof designResults.strengthCases)[number] | null
  >(
    (governing, result) =>
      !governing || result.maxNetPressure > governing.maxNetPressure
        ? result
        : governing,
    null
  );
  useEffect(() => {
    if (!isSelectingCells) return;
    const stopSelecting = () => {
      isSelectingCellsRef.current = false;
      setIsSelectingCells(false);
    };
    window.addEventListener("mouseup", stopSelecting);
    return () => window.removeEventListener("mouseup", stopSelecting);
  }, [isSelectingCells]);

  const updateGeometry = (key: keyof FootingGeometry, value: number) => {
    setGeometry((current) =>
      clampPedestalOffsets({ ...current, [key]: value })
    );
  };

  const updateMaterials = (key: keyof MaterialInputs, value: number) => {
    if (key === "concreteStrength") {
      setMaterials((current) => ({
        ...current,
        concreteStrength: value,
        concreteElasticModulus: concreteElasticModulusFromStrength(value, units),
      }));
      return;
    }

    if (key === "concreteElasticModulus") {
      setConcreteModulusOverridden(true);
    }

    setMaterials((current) => ({ ...current, [key]: value }));
  };

  const useCalculatedConcreteModulus = () => {
    setConcreteModulusOverridden(false);
    setMaterials((current) => ({
      ...current,
      concreteElasticModulus: concreteElasticModulusFromStrength(
        current.concreteStrength,
        units
      ),
    }));
  };

  const updateReinforcement = (
    key: keyof ReinforcementInputs,
    value: number
  ) => {
    setReinforcement((current) => ({ ...current, [key]: value }));
  };

  const updateLoadCase = (
    rowIndex: number,
    key: LoadCaseColumn,
    value: string
  ) => {
    setCurrentLoadCases((current) =>
      ensureTrailingBlank(
        current.map((loadCase, index) =>
          index === rowIndex
            ? {
                ...loadCase,
                [key]: key === "name" ? value : parseNumericCell(value),
              }
            : loadCase
        )
      )
    );
  };

  const removeLoadCase = (rowIndex: number) => {
    setCurrentLoadCases((current) =>
      ensureTrailingBlank(current.filter((_, index) => index !== rowIndex))
    );
  };

  const clearLoadCaseTable = () => {
    setCurrentLoadCases([blankLoadCase(`load-blank-${Date.now()}`)]);
    setSelectedCells(null);
    setEditingCell(null);
    setEditingCellValue("");
  };

  const closeLoadCaseTable = () => {
    setCurrentLoadCases((current) =>
      ensureTrailingBlank(nameUntitledLoadCases(current))
    );
    setLoadTableOpen(false);
  };

  const handleLoadCaseDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    if (event.target instanceof HTMLInputElement) return;
    event.preventDefault();
    closeLoadCaseTable();
  };


  const focusLoadCaseCell = (position: CellPosition) => {
    requestAnimationFrame(() => {
      const cell = document.querySelector<HTMLElement>(
        loadCaseCellSelector(position)
      );
      cell?.focus();
    });
  };

  useEffect(() => {
    if (!loadTableOpen || editingCell) return;
    const position = selectedCells?.end ?? { row: 0, column: 0 };
    focusLoadCaseCell(position);
  }, [editingCell, loadTableOpen, selectedCells]);

  const moveCellSelection = (row: number, column: number) => {
    const next = {
      row: Math.max(0, Math.min(row, loadCases.length - 1)),
      column: Math.max(0, Math.min(column, loadCaseColumns.length - 1)),
    };
    setSelectedCells({ start: next, end: next });
    setEditingCell(null);
    setEditingCellValue("");
    focusLoadCaseCell(next);
  };

  const extendSelectionWithKeyboard = (row: number, column: number) => {
    const next = {
      row: Math.max(0, Math.min(row, loadCases.length - 1)),
      column: Math.max(0, Math.min(column, loadCaseColumns.length - 1)),
    };
    setSelectedCells((current) => {
      const start = current?.start ?? { row: row, column: column };
      return { start, end: next };
    });
    setEditingCell(null);
    setEditingCellValue("");
    focusLoadCaseCell(next);
  };

  const moveOrExtendCellSelection = (
    event: KeyboardEvent<HTMLElement>,
    row: number,
    column: number
  ) => {
    if (event.shiftKey) extendSelectionWithKeyboard(row, column);
    else moveCellSelection(row, column);
  };

  const startCellSelection = (row: number, column: number) => {
    const position = { row, column };
    setSelectedCells({ start: position, end: position });
    isSelectingCellsRef.current = true;
    setIsSelectingCells(true);
    setEditingCell(null);
    setEditingCellValue("");
    focusLoadCaseCell(position);
  };

  const extendCellSelection = (row: number, column: number) => {
    if (!isSelectingCellsRef.current) return;
    setSelectedCells((current) =>
      current ? { ...current, end: { row, column } } : current
    );
  };

  const isCellSelected = (row: number, column: number) => {
    if (!selectedCells) return false;
    const { rowStart, rowEnd, columnStart, columnEnd } =
      normalizedSelection(selectedCells);
    return (
      row >= rowStart &&
      row <= rowEnd &&
      column >= columnStart &&
      column <= columnEnd
    );
  };

  const isSelectionCorner = (row: number, column: number) => {
    if (!selectedCells) return false;
    const { rowEnd, columnEnd } = normalizedSelection(selectedCells);
    return row === rowEnd && column === columnEnd;
  };

  const selectionEdges = (row: number, column: number) => {
    if (!selectedCells || !isCellSelected(row, column)) return null;
    const { rowStart, rowEnd, columnStart, columnEnd } =
      normalizedSelection(selectedCells);
    return {
      top: row === rowStart,
      bottom: row === rowEnd,
      left: column === columnStart,
      right: column === columnEnd,
    };
  };

  const clearSelectedCells = () => {
    if (!selectedCells) return;
    const { rowStart, rowEnd, columnStart, columnEnd } =
      normalizedSelection(selectedCells);

    setCurrentLoadCases((current) =>
      ensureTrailingBlank(
        current.map((loadCase, rowIndex) => {
          if (rowIndex < rowStart || rowIndex > rowEnd) return loadCase;
          const updated = { ...loadCase };
          for (
            let columnIndex = columnStart;
            columnIndex <= columnEnd;
            columnIndex += 1
          ) {
            const column = loadCaseColumns[columnIndex];
            if (!column) continue;
            if (column.key === "name") updated.name = "";
            else updated[column.key] = 0;
          }
          return updated;
        })
      )
    );
  };

  const editLoadCaseCell = (
    rowIndex: number,
    columnIndex: number,
    value: string,
    initialValue?: string
  ) => {
    const column = loadCaseColumns[columnIndex];
    if (!column) return;
    setEditingCell({ row: rowIndex, column: columnIndex });
    setEditingCellValue(initialValue ?? value);
  };

  const commitLoadCaseCell = (
    rowIndex: number,
    columnIndex: number,
    value: string
  ) => {
    const column = loadCaseColumns[columnIndex];
    if (!column) return;
    updateLoadCase(rowIndex, column.key, value);
    setEditingCell(null);
    setEditingCellValue("");
  };

  const commitAndMoveLoadCaseCell = (
    event: KeyboardEvent<HTMLElement>,
    rowIndex: number,
    columnIndex: number,
    value: string
  ) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      commitLoadCaseCell(rowIndex, columnIndex, value);
      moveOrExtendCellSelection(event, rowIndex - 1, columnIndex);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      commitLoadCaseCell(rowIndex, columnIndex, value);
      if (event.key === "ArrowDown") {
        moveOrExtendCellSelection(event, rowIndex + 1, columnIndex);
      } else {
        moveCellSelection(rowIndex + 1, columnIndex);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitLoadCaseCell(rowIndex, columnIndex, value);
      moveOrExtendCellSelection(event, rowIndex, columnIndex - 1);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "Tab") {
      event.preventDefault();
      commitLoadCaseCell(rowIndex, columnIndex, value);
      if (event.key === "ArrowRight") {
        moveOrExtendCellSelection(event, rowIndex, columnIndex + 1);
      } else {
        moveCellSelection(rowIndex, columnIndex + 1);
      }
    }
  };

  const pasteLoadCases = (
    event: ClipboardEvent<HTMLInputElement>,
    startRow: number,
    startColumn: number
  ) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();

    const rows = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((row) => row.length > 0)
      .map((row) => row.split("\t"));
    if (rows.length === 0) return;

    const firstCell = rows[0]?.[0]?.trim().toLowerCase();
    const dataRows = firstCell === "load case" ? rows.slice(1) : rows;

    setCurrentLoadCases((current) => {
      const next = [...current];
      dataRows.forEach((cells, rowOffset) => {
        const targetRow = startRow + rowOffset;
        while (targetRow >= next.length) {
          next.push(blankLoadCase(`load-${Date.now()}-${next.length}`));
        }

        const updated = { ...next[targetRow] };
        cells.forEach((cell, cellOffset) => {
          const column = loadCaseColumns[startColumn + cellOffset];
          if (!column) return;
          if (column.key === "name") updated.name = cell;
          else updated[column.key] = parseNumericCell(cell);
        });
        next[targetRow] = updated;
      });
      return ensureTrailingBlank(next);
    });
  };

  const pasteSelectedLoadCases = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!selectedCells) return;
    if (event.target instanceof HTMLInputElement) return;
    const { rowStart, columnStart } = normalizedSelection(selectedCells);
    pasteLoadCases(
      event as unknown as ClipboardEvent<HTMLInputElement>,
      rowStart,
      columnStart
    );
  };

  const handleLoadCaseCellKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ) => {
    const column = loadCaseColumns[columnIndex];
    if (!column) return;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveOrExtendCellSelection(event, rowIndex - 1, columnIndex);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      if (event.key === "ArrowDown") {
        moveOrExtendCellSelection(event, rowIndex + 1, columnIndex);
      } else {
        moveCellSelection(rowIndex + 1, columnIndex);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveOrExtendCellSelection(event, rowIndex, columnIndex - 1);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "Tab") {
      event.preventDefault();
      if (event.key === "ArrowRight") {
        moveOrExtendCellSelection(event, rowIndex, columnIndex + 1);
      } else {
        moveCellSelection(rowIndex, columnIndex + 1);
      }
      return;
    }

    if (event.key === "F2") {
      event.preventDefault();
      editLoadCaseCell(
        rowIndex,
        columnIndex,
        column.key === "name"
          ? loadCases[rowIndex]?.name ?? ""
          : String(loadCases[rowIndex]?.[column.key] ?? "")
      );
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      clearSelectedCells();
      focusLoadCaseCell({ row: rowIndex, column: columnIndex });
      return;
    }

    if (
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      editLoadCaseCell(
        rowIndex,
        columnIndex,
        column.key === "name"
          ? loadCases[rowIndex]?.name ?? ""
          : String(loadCases[rowIndex]?.[column.key] ?? ""),
        event.key
      );
    }
  };

  const copyLoadCases = async () => {
    const text = selectedCells
      ? serializeSelectedCells(loadCases, loadCaseColumns, selectedCells)
      : serializeLoadCases(loadCases, loadCaseColumns);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  const copySelectedCells = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!selectedCells) return;
    event.preventDefault();
    event.clipboardData.setData(
      "text/plain",
      serializeSelectedCells(loadCases, loadCaseColumns, selectedCells)
    );
  };

  const switchUnits = (nextUnits: UnitSystem) => {
    setGeometry((current) => convertGeometry(current, units, nextUnits));
    setMaterials((current) => convertMaterials(current, units, nextUnits));
    setReinforcement((current) => {
      const converted = convertReinforcement(current, units, nextUnits);
      return {
        ...converted,
        barDiameterX: nearestRebarDiameter(converted.barDiameterX, nextUnits),
        barDiameterZ: nearestRebarDiameter(converted.barDiameterZ, nextUnits),
      };
    });
    setServiceLoadCases((current) =>
      convertLoadCases(current, units, nextUnits)
    );
    setStrengthLoadCases((current) =>
      convertLoadCases(current, units, nextUnits)
    );
    setUnits(nextUnits);
  };

  const resetInputs = () => {
    setGeometry(defaultGeometry(units));
    setMaterials(defaultMaterials(units));
    setConcreteModulusOverridden(false);
    setReinforcement(defaultReinforcement(units));
    setSoilTreatmentMode("service");
    setServiceLoadCases(defaultLoadCases(units));
    setStrengthLoadCases(defaultStrengthLoadCases(units));
  };

  const exportProject = () => {
    const state: FootingProjectState = {
      modelName,
      units,
      buildingCode,
      loadStandard,
      concreteStandard,
      displayPrecision,
      loadCombinationType,
      soilTreatmentMode,
      concreteModulusOverridden,
      geometry,
      materials,
      reinforcement,
      serviceLoadCases,
      strengthLoadCases,
    };
    downloadProject(state);
  };

  // Values are stored verbatim in the file's own unit system, so we set `units`
  // and the raw inputs together without calling switchUnits (no double-convert).
  const importProject = async (file?: File | null) => {
    if (!file) return;
    try {
      const parsed = validateProject(JSON.parse(await file.text()));
      setModelName(parsed.modelName || "Untitled footing");
      setUnits(parsed.units);
      setBuildingCode(parsed.buildingCode);
      setLoadStandard(parsed.loadStandard);
      setConcreteStandard(parsed.concreteStandard);
      setDisplayPrecision(parsed.displayPrecision);
      setLoadCombinationType(parsed.loadCombinationType);
      setSoilTreatmentMode(parsed.soilTreatmentMode);
      setConcreteModulusOverridden(parsed.concreteModulusOverridden);
      setGeometry(parsed.geometry);
      // Merge over defaults so fields added in newer schemas (e.g.
      // minimumContactRatio) are present when importing an older file.
      setMaterials({ ...defaultMaterials(parsed.units), ...parsed.materials });
      setReinforcement(parsed.reinforcement);
      setServiceLoadCases(parsed.serviceLoadCases);
      setStrengthLoadCases(parsed.strengthLoadCases);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Invalid project file."
      );
    }
  };

  const updateBuildingCode = (nextBuildingCode: BuildingCode) => {
    const references = CODE_REFERENCES[nextBuildingCode];
    setBuildingCode(nextBuildingCode);
    setLoadStandard(references.loadStandard);
    setConcreteStandard(references.concreteStandard);
  };

  const openCalculationBrief = () => {
    const title = modelName.trim() || "Untitled footing";
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const siGeometry =
      units === "SI" ? geometry : convertGeometry(geometry, "USC", "SI");
    const siMaterials =
      units === "SI" ? materials : convertMaterials(materials, "USC", "SI");
    const siReinforcement =
      units === "SI"
        ? reinforcement
        : convertReinforcement(reinforcement, "USC", "SI");
    const siServiceLoads =
      units === "SI"
        ? activeLoadCases
        : convertLoadCases(activeLoadCases, "USC", "SI").filter(
            (loadCase) => !isEmptyLoadCase(loadCase)
          );
    const siStrengthLoads =
      units === "SI"
        ? activeStrengthLoadCases
        : convertLoadCases(activeStrengthLoadCases, "USC", "SI").filter(
            (loadCase) => !isEmptyLoadCase(loadCase)
          );

    const html = createFootingCalculationBriefHtml({
      title,
      units,
      buildingCode,
      loadStandard,
      concreteStandard,
      soilTreatmentMode,
      geometry: siGeometry,
      materials: siMaterials,
      reinforcement: siReinforcement,
      serviceLoadCases: siServiceLoads,
      strengthLoadCases: siStrengthLoads,
      results: designResults,
      displayPrecision,
    });

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.document.title = title;
    try {
      printWindow.history.replaceState(null, title, window.location.href);
    } catch {
      // Ignore browsers that do not allow replacing a generated report URL.
    }
    printWindow.focus();
  };

  return (
    <DisplayPrecisionContext.Provider value={displayPrecision}>
    <TooltipProvider delay={150}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <header className="border-b bg-white dark:bg-slate-900">
          <div className="mx-auto max-w-7xl space-y-4 px-6 py-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950">
                <Building2 className="size-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight">
                  Isolated Footing Design
                </h1>
                <p className="text-sm text-muted-foreground">
                  Concrete isolated footing design.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-transparent bg-slate-100/70 px-2 py-1 transition-colors hover:border-slate-200 focus-within:border-slate-300 dark:bg-slate-800/60 dark:hover:border-slate-700 dark:focus-within:border-slate-600">
                <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  onBlur={() => setModelName((name) => name.trim())}
                  placeholder="Untitled footing"
                  aria-label="Model name"
                  className="w-full min-w-0 bg-transparent text-sm font-medium text-slate-700 placeholder:font-normal placeholder:text-muted-foreground focus:outline-none dark:text-slate-200"
                />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={openCalculationBrief}
                >
                  <Calculator />
                  See calculation
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPrecisionOpen(true)}
                >
                  Precision
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={exportProject}
                  aria-label="Export project to a .footing file"
                  title="Export .footing"
                >
                  <Download />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Import a .footing project file"
                  title="Import .footing"
                >
                  <Upload />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".footing,.json,application/json"
                  className="hidden"
                  onChange={(event) => {
                    void importProject(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={resetInputs}
                  aria-label="Reset all inputs to defaults"
                  title="Reset inputs"
                >
                  <RotateCcw />
                </Button>
                <div
                  className="flex items-center gap-1.5"
                  role="group"
                  aria-label="Building code; load and concrete standards update automatically"
                >
                  <span className="text-xs text-muted-foreground">Code</span>
                  <Select
                    value={buildingCode}
                    onValueChange={(value) =>
                      updateBuildingCode(value as BuildingCode)
                    }
                  >
                    <SelectTrigger size="sm" aria-label="Building code">
                      <SelectValue>{(value) => value}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {BUILDING_CODE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {loadStandard === "none"
                      ? concreteStandard
                      : `${loadStandard} · ${concreteStandard}`}
                  </span>
                </div>
                <Select
                  value={units}
                  onValueChange={(value) => switchUnits(value as UnitSystem)}
                >
                  <SelectTrigger size="sm" aria-label="Unit system">
                    <SelectValue>
                      {(value) => (value === "USC" ? "USC" : "SI")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SI">SI</SelectItem>
                    <SelectItem value="USC">USC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </header>

        {loadTableOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
            role="presentation"
            onClick={() => setLoadTableOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="load-table-heading"
              className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg border bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleLoadCaseDialogKeyDown}
            >
              <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0 space-y-1">
                  <h2 id="load-table-heading" className="text-base font-semibold">
                    Load cases
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {loadCaseCount} total
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLoadTableOpen(false)}
                  aria-label="Close load table"
                >
                  <X />
                </Button>
              </div>

              <div
                className="min-h-0 flex-1 overflow-auto overscroll-contain p-5"
                onCopy={copySelectedCells}
                onPaste={pasteSelectedLoadCases}
              >
                <Tabs
                  value={loadCombinationType}
                  onValueChange={(value) => {
                    setLoadCombinationType(value as LoadCombinationType);
                    isSelectingCellsRef.current = false;
                    setSelectedCells(null);
                    setEditingCell(null);
                    setEditingCellValue("");
                  }}
                  className="gap-4"
                >
                  <TabsList>
                    <TabsTrigger value="service">Service / stability</TabsTrigger>
                    <TabsTrigger value="strength">Strength</TabsTrigger>
                  </TabsList>
                  <TabsContent value={loadCombinationType}>
                    <Table
                      className={`table-fixed border ${
                        loadCombinationType === "strength"
                          ? "min-w-[980px]"
                          : "min-w-[760px]"
                      }`}
                    >
                      <colgroup>
                        {loadCaseColumns.map((column) => (
                          <col
                            key={column.key}
                            className={
                              column.unitType === "text"
                                ? "w-36"
                                : column.unitType === "factor"
                                ? "w-32"
                                : "w-28"
                            }
                          />
                        ))}
                        <col className="w-12" />
                      </colgroup>
                      <TableHeader>
                        <TableRow>
                          {loadCaseColumns.map((column) => (
                            <TableHead key={column.key} className="border-r">
                              <div className="space-y-0.5">
	                                <div>{loadColumnLabel(column)}</div>
                                {column.unitType !== "text" &&
                                column.unitType !== "factor" ? (
                                  <div className="text-[10px] font-normal text-muted-foreground">
	                                    <MathUnit
	                                      unit={
	                                        column.unitType === "force"
	                                          ? forceUnit
	                                          : momentUnit
	                                      }
	                                    />
                                  </div>
                                ) : null}
                              </div>
                            </TableHead>
                          ))}
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadCases.map((loadCase, rowIndex) => (
                          <TableRow key={loadCase.id}>
                            {loadCaseColumns.map((column, columnIndex) => {
                              const isEmptyRow = isEmptyLoadCase(loadCase);
                              const position = {
                                row: rowIndex,
                                column: columnIndex,
                              };
                              const selected = isCellSelected(
                                rowIndex,
                                columnIndex
                              );
                              const editing = isSameCell(
                                editingCell,
                                position
                              );
                              const edges =
                                selected && !editing
                                  ? selectionEdges(rowIndex, columnIndex)
                                  : null;
                              const edgeShadow = edges
                                ? [
                                    edges.top
                                      ? "inset 0 1px 0 0 var(--selection-edge)"
                                      : null,
                                    edges.bottom
                                      ? "inset 0 -1px 0 0 var(--selection-edge)"
                                      : null,
                                    edges.left
                                      ? "inset 1px 0 0 0 var(--selection-edge)"
                                      : null,
                                    edges.right
                                      ? "inset -1px 0 0 0 var(--selection-edge)"
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(", ")
                                : undefined;
                              const value =
                                isEmptyRow
                                  ? ""
                                  : column.key === "name"
                                  ? loadCase.name
                                  : String(loadCase[column.key]);
                              return (
                                <TableCell
                                  key={column.key}
                                  style={
                                    edgeShadow
                                      ? {
                                          boxShadow: edgeShadow,
                                          ["--selection-edge" as string]:
                                            "rgb(5 150 105)",
                                        }
                                      : undefined
                                  }
                                  className={`relative h-9 border-r p-0 ${
                                    selected
                                      ? "bg-emerald-50 dark:bg-emerald-950/60"
                                      : "bg-white dark:bg-slate-900"
                                  }`}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    startCellSelection(rowIndex, columnIndex);
                                  }}
                                  onMouseEnter={() =>
                                    extendCellSelection(rowIndex, columnIndex)
                                  }
                                  onMouseMove={() =>
                                    extendCellSelection(rowIndex, columnIndex)
                                  }
                                >
                                  {editing ? (
                                    <input
                                      autoFocus
                                      aria-label={`${column.label} row ${
                                        rowIndex + 1
                                      }`}
                                      value={editingCellValue}
                                      inputMode={
                                        column.key === "name"
                                          ? "text"
                                          : "decimal"
                                      }
                                      onBlur={() =>
                                        commitLoadCaseCell(
                                          rowIndex,
                                          columnIndex,
                                          editingCellValue
                                        )
                                      }
                                      onChange={(event) =>
                                        setEditingCellValue(event.target.value)
                                      }
                                      onKeyDown={(event) => {
                                        commitAndMoveLoadCaseCell(
                                          event,
                                          rowIndex,
                                          columnIndex,
                                          editingCellValue
                                        );
                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          setEditingCell(null);
                                          setEditingCellValue("");
                                          focusLoadCaseCell(position);
                                        }
                                      }}
                                      onPaste={(event) =>
                                        pasteLoadCases(
                                          event,
                                          rowIndex,
                                          columnIndex
                                        )
                                      }
                                      className="h-9 w-full min-w-0 bg-white px-2 text-sm outline-2 outline-emerald-600 dark:bg-slate-900"
                                    />
                                  ) : (
                                    <div
                                      aria-label={`${column.label} row ${
                                        rowIndex + 1
                                      }`}
                                      data-load-cell={`${rowIndex}-${columnIndex}`}
                                      role="gridcell"
                                      tabIndex={0}
                                      onDoubleClick={() =>
                                        editLoadCaseCell(
                                          rowIndex,
                                          columnIndex,
                                          value
                                        )
                                      }
                                      onKeyDown={(event) =>
                                        handleLoadCaseCellKeyDown(
                                          event,
                                          rowIndex,
                                          columnIndex
                                        )
                                      }
                                      className="flex h-9 w-full cursor-cell items-center overflow-hidden px-2 text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-700"
                                    >
                                      <span className="truncate">{value}</span>
                                    </div>
                                  )}
                                  {isSelectionCorner(rowIndex, columnIndex) &&
                                  !editing ? (
                                    <span className="pointer-events-none absolute -bottom-1 -right-1 size-2 border border-white bg-emerald-700 dark:border-slate-900" />
                                  ) : null}
                                </TableCell>
                              );
                            })}
                            <TableCell className="p-1 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeLoadCase(rowIndex)}
                                disabled={isEmptyLoadCase(loadCase)}
                                aria-label={`Remove load case ${rowIndex + 1}`}
                              >
                                <Trash2 />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
                <p className="text-xs text-muted-foreground">
	                  Coordinates: <FormulaValue tex="x/z" /> are horizontal in
	                  plan; <FormulaValue tex="P" /> and{" "}
	                  <FormulaValue tex="T" /> act along or about the vertical axis
	                  at top of pedestal. The last row stays blank for new load cases.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearLoadCaseTable}
                  >
                    <Trash2 />
                    Clear table
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyLoadCases()}
                  >
                    <Copy />
                    {selectedCells ? "Copy selection" : "Copy table"}
                  </Button>
                  <Button type="button" onClick={closeLoadCaseTable}>
                    Done
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {precisionOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
            role="presentation"
            onClick={() => setPrecisionOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="precision-heading"
              className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0">
                  <h2 id="precision-heading" className="text-base font-semibold">
                    Display precision
                  </h2>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setPrecisionOpen(false)}
                  aria-label="Close display precision"
                >
                  <X />
                </Button>
              </div>
              <div className="overflow-auto px-5 py-4">
                <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-x-4 gap-y-2">
                  {DISPLAY_PRECISION_ROWS.map((row) => (
                    <label
                      key={row.key}
                      className="contents text-sm"
                      htmlFor={`precision-${row.key}`}
                    >
                      <span className="self-center text-muted-foreground">
                        {row.label} ({units === "USC" ? row.uscUnit : row.key})
                      </span>
                      <input
                        id={`precision-${row.key}`}
                        type="number"
                        min={0}
                        max={6}
                        step={1}
                        value={displayPrecision[row.key]}
                        onChange={(event) =>
                          updateDisplayPrecision(
                            row.key,
                            Number(event.target.value)
                          )
                        }
                        className="h-9 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-between gap-2 border-t px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDisplayPrecision(DEFAULT_DISPLAY_PRECISION)}
                >
                  Reset
                </Button>
                <Button type="button" onClick={() => setPrecisionOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <main className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-4 px-6 py-5 xl:grid-cols-[12rem_minmax(0,1fr)_22rem]">
          <aside className="hidden xl:sticky xl:top-4 xl:block">
            <TableOfContents />
          </aside>

          <div className="space-y-4">
            <Card id="card-geometry">
              <CardHeader>
                <CardTitle>Geometry</CardTitle>
                <CardDescription>
                  Footing and pedestal footprint dimensions.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumField
                  id="footingLength"
                  label="Footing length"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={geometry.footingLength}
                  min={0.05}
                  onChange={(value) => updateGeometry("footingLength", value)}
                  tooltip="Plan dimension of footing in model X direction."
                />
                <NumField
                  id="footingWidth"
                  label="Footing width"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={geometry.footingWidth}
                  min={0.05}
                  onChange={(value) => updateGeometry("footingWidth", value)}
                  tooltip="Plan dimension of footing in model Z direction."
                />
                <NumField
                  id="footingThickness"
                  label="Footing thickness"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={geometry.footingThickness}
                  min={0.05}
                  onChange={(value) =>
                    updateGeometry("footingThickness", value)
                  }
                  tooltip="Concrete slab thickness."
                />
                <NumField
                  id="soilCoverDepth"
                  label="Footing top depth"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={geometry.soilCoverDepth}
                  min={0}
                  onChange={(value) => updateGeometry("soilCoverDepth", value)}
                  tooltip="Depth from finished grade to the top of footing. Soil over the pedestal footprint is excluded from overburden."
                />
                <NumField
                  id="frostDepth"
                  label="Frost depth"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={geometry.frostDepth}
                  min={0}
                  onChange={(value) => updateGeometry("frostDepth", value)}
                  tooltip="Local frost depth used for the footing bottom depth check."
                />
                <NumField
                  id="groundwaterDepth"
                  label="Groundwater depth"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={geometry.groundwaterDepth}
                  min={0}
                  onChange={(value) => updateGeometry("groundwaterDepth", value)}
                  tooltip="Depth from finished grade to groundwater. Concrete and soil weights below this depth use buoyant unit weights."
                />
                <NumField
                  id="pedestalLength"
                  label="Pedestal footprint length"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={geometry.pedestalLength}
                  min={0.05}
                  onChange={(value) => updateGeometry("pedestalLength", value)}
                  tooltip="Pedestal dimension parallel to footing length."
                />
                <NumField
                  id="pedestalWidth"
                  label="Pedestal footprint width"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={geometry.pedestalWidth}
                  min={0.05}
                  onChange={(value) => updateGeometry("pedestalWidth", value)}
                  tooltip="Pedestal dimension parallel to footing width."
                />
                <NumField
                  id="pedestalHeight"
                  label="Pedestal height"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={geometry.pedestalHeight}
                  min={0.05}
                  onChange={(value) => updateGeometry("pedestalHeight", value)}
                  tooltip="Height from footing top to load application. Pedestal design is outside this footing-only scope."
                />
                <NumField
                  id="pedestalOffsetX"
                  label="Pedestal offset X"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={pedestalOffsetX}
                  min={-pedestalOffsetLimitX}
                  max={pedestalOffsetLimitX}
                  onChange={(value) => updateGeometry("pedestalOffsetX", value)}
                  tooltip="Offset from footing center. Positive X follows the red plan axis."
                />
                <NumField
                  id="pedestalOffsetZ"
                  label="Pedestal offset Z"
                  unit={<MathUnit unit={lengthUnit} />}
                  value={pedestalOffsetZ}
                  min={-pedestalOffsetLimitZ}
                  max={pedestalOffsetLimitZ}
                  onChange={(value) => updateGeometry("pedestalOffsetZ", value)}
                  tooltip="Offset from footing center. Positive Z follows the blue plan axis."
                />
              </CardContent>
            </Card>

            <Card id="card-materials">
              <CardHeader>
                <CardTitle>Materials</CardTitle>
                <CardDescription>
                  Footing concrete, reinforcing steel, cover, and bearing inputs.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumField
                  id="concreteStrength"
                  label="Concrete strength"
                  unit={<MathUnit unit={strengthUnit} />}
                  value={materials.concreteStrength}
                  min={0}
                  onChange={(value) =>
                    updateMaterials("concreteStrength", value)
                  }
                  tooltip="Specified compressive strength for footing concrete."
                />
                <div className="space-y-1.5">
                  <NumField
                    id="concreteElasticModulus"
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        Concrete modulus
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {concreteModulusOverridden ? "Override" : "Auto"}
                        </Badge>
                      </span>
                    }
                    unit={<MathUnit unit={strengthUnit} />}
                    value={materials.concreteElasticModulus}
                    min={0}
                    onChange={(value) =>
                      updateMaterials("concreteElasticModulus", value)
                    }
                    tooltip={
                      <div className="space-y-1">
                        <div>
                          Elastic modulus <FormulaValue tex="E_c" /> used only
                          for the adapted ACI 336.2R isolated-footing rigidity advisory.
                        </div>
                        <div className="whitespace-nowrap">
                          SI: <FormulaValue tex={`E_c = 4700\\sqrt{f'_c}`} /> MPa.
                        </div>
                        <div className="whitespace-nowrap">
                          USC:{" "}
                          <FormulaValue tex={`E_c = 1802.5\\sqrt{f'_c}`} /> ksi.
                        </div>
                        <div>Auto value is rounded to 0 decimals.</div>
                      </div>
                    }
                  />
                  {concreteModulusOverridden ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={useCalculatedConcreteModulus}
                    >
                      <RotateCcw size={13} />
                      Use calculated
                    </Button>
                  ) : null}
                </div>
                <NumField
                  id="rebarYield"
                  label="Rebar yield"
                  unit={<MathUnit unit={strengthUnit} />}
                  value={materials.rebarYield}
                  min={0}
                  onChange={(value) => updateMaterials("rebarYield", value)}
                  tooltip="Specified yield strength for footing reinforcement."
                />
                <NumField
                  id="concreteUnitWeight"
                  label="Concrete unit weight"
                  unit={<MathUnit unit={unitWeightUnit} />}
                  value={materials.concreteUnitWeight}
                  min={0}
                  onChange={(value) =>
                    updateMaterials("concreteUnitWeight", value)
                  }
                  tooltip="Normalweight concrete density used for footing self-weight."
                />
                <NumField
                  id="soilUnitWeight"
                  label="Soil unit weight"
                  unit={<MathUnit unit={unitWeightUnit} />}
                  value={materials.soilUnitWeight}
                  min={0}
                  onChange={(value) => updateMaterials("soilUnitWeight", value)}
                  tooltip="Soil unit weight used for overburden above the footing outside the pedestal footprint."
                />
                <NumField
                  id="saturatedSoilUnitWeight"
                  label="Saturated soil unit weight"
                  unit={<MathUnit unit={unitWeightUnit} />}
                  value={materials.saturatedSoilUnitWeight}
                  min={0}
                  onChange={(value) =>
                    updateMaterials("saturatedSoilUnitWeight", value)
                  }
                  tooltip="Saturated soil unit weight below the groundwater table."
                />
                <NumField
                  id="waterUnitWeight"
                  label="Water unit weight"
                  unit={<MathUnit unit={unitWeightUnit} />}
                  value={materials.waterUnitWeight}
                  min={0}
                  onChange={(value) => updateMaterials("waterUnitWeight", value)}
                  tooltip="Water unit weight subtracted from saturated weights below groundwater."
                />
                <NumField
                  id="clearCover"
                  label="Concrete cover"
                  unit={<MathUnit unit={coverUnit} />}
                  value={materials.clearCover}
                  min={0}
                  onChange={(value) => updateMaterials("clearCover", value)}
                  tooltip="Clear cover to footing reinforcement."
                />
                <NumField
                  id="allowableBearing"
                  label="Allowable bearing"
                  unit={<MathUnit unit={bearingUnit} />}
                  value={materials.allowableBearing}
                  min={0}
                  onChange={(value) =>
                    updateMaterials("allowableBearing", value)
                  }
                  tooltip="Service-level allowable soil bearing pressure for footing checks."
                />
                <NumField
                  id="ultimateBearing"
                  label="Ultimate bearing"
                  unit={<MathUnit unit={bearingUnit} />}
                  value={materials.ultimateBearing}
                  min={0}
                  onChange={(value) =>
                    updateMaterials("ultimateBearing", value)
                  }
                  tooltip="Strength-level ultimate soil bearing pressure for factored bearing checks."
                />
                <NumField
                  id="subgradeReactionModulus"
                  label="Subgrade reaction"
                  unit={<MathUnit unit={subgradeReactionUnit} />}
                  value={materials.subgradeReactionModulus}
                  min={0}
                  step={1}
                  onChange={(value) =>
                    updateMaterials("subgradeReactionModulus", value)
                  }
                  tooltip={
                    <div className="space-y-1">
                      <div>
                        Vertical modulus of subgrade reaction <FormulaValue tex="k_s" /> used
                        for the adapted ACI 336.2R isolated-footing rigidity advisory.
                      </div>
                      <div>
                        The advisory uses <FormulaValue tex="L_e=(E_c h^3/3k_s)^{1/4}" /> and
                        compares <FormulaValue tex="L_{eff}=4a" /> to <FormulaValue tex="1.75L_e" />,
                        where <FormulaValue tex="a" /> is the footing projection beyond the pedestal.
                      </div>
                    </div>
                  }
                />
                <NumField
                  id="soilFrictionCoefficient"
                  label="Soil friction coefficient"
                  value={materials.soilFrictionCoefficient}
                  min={0}
                  max={2}
                  step={0.01}
                  onChange={(value) =>
                    updateMaterials("soilFrictionCoefficient", value)
                  }
                  tooltip="Coefficient used for friction-only service sliding check. Passive resistance is not included."
                />
                <NumField
                  id="slidingSafetyFactor"
                  label="Minimum sliding safety factor"
                  value={materials.slidingSafetyFactor}
                  min={0.01}
                  step={0.01}
                  onChange={(value) =>
                    updateMaterials("slidingSafetyFactor", value)
                  }
                  tooltip="Required service sliding safety factor applied to horizontal load."
                />
                <NumField
                  id="overturningSafetyFactor"
                  label="Minimum overturning safety factor"
                  value={materials.overturningSafetyFactor}
                  min={0.01}
                  step={0.01}
                  onChange={(value) =>
                    updateMaterials("overturningSafetyFactor", value)
                  }
                  tooltip="Required service overturning safety factor applied to footing moments."
                />
                <NumField
                  id="allowableSettlement"
                  label="Allowable settlement"
                  unit={<MathUnit unit={coverUnit} />}
                  value={materials.allowableSettlement}
                  min={0}
                  onChange={(value) =>
                    updateMaterials("allowableSettlement", value)
                  }
                  tooltip="Serviceability settlement limit for the rigid-footing Winkler check."
                />
                <NumField
                  id="allowableRotationX"
                  label="Allowable rotation X"
                  unit={<MathUnit unit="rad" />}
                  value={materials.allowableRotationX}
                  min={0}
                  step={0.0001}
                  onChange={(value) =>
                    updateMaterials("allowableRotationX", value)
                  }
                  tooltip="Serviceability rotation limit about the footing X axis."
                />
                <NumField
                  id="allowableRotationZ"
                  label="Allowable rotation Z"
                  unit={<MathUnit unit="rad" />}
                  value={materials.allowableRotationZ}
                  min={0}
                  step={0.0001}
                  onChange={(value) =>
                    updateMaterials("allowableRotationZ", value)
                  }
                  tooltip="Serviceability rotation limit about the footing Z axis."
                />
                <NumField
                  id="minimumContactRatio"
                  label="Min. soil contact"
                  unit={<MathUnit unit="%" />}
                  value={materials.minimumContactRatio}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(value) =>
                    updateMaterials("minimumContactRatio", value)
                  }
                  tooltip="Minimum soil-contact area as a percent of the footing base. 0 allows any partial contact (warning only); 100 requires full contact (resultant in the kern). Partial contact below this value fails the soil-contact check."
                />
              </CardContent>
            </Card>

            <Card id="card-reinforcement">
              <CardHeader>
                <CardTitle>Reinforcement</CardTitle>
                <CardDescription>
                  Bottom mat used for flexure and minimum steel checks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <RebarSelect
                    id="barDiameterX"
                    label="X bar diameter"
                    units={units}
                    value={reinforcement.barDiameterX}
                    onChange={(value) =>
                      updateReinforcement("barDiameterX", value)
                    }
                    tooltip="Bars parallel to X. Used for footing projection beyond pedestal side faces in X."
                  />
                  <NumField
                    id="barSpacingX"
                    label="X bar spacing"
                    unit={<MathUnit unit={coverUnit} />}
                    value={reinforcement.barSpacingX}
                    min={0.1}
                    onChange={(value) =>
                      updateReinforcement("barSpacingX", value)
                    }
                    tooltip="Center-to-center spacing of bottom bars parallel to X."
                  />
                  <RebarSelect
                    id="barDiameterZ"
                    label="Z bar diameter"
                    units={units}
                    value={reinforcement.barDiameterZ}
                    onChange={(value) =>
                      updateReinforcement("barDiameterZ", value)
                    }
                    tooltip="Bars parallel to Z. Used for footing projection beyond pedestal side faces in Z."
                  />
                  <NumField
                    id="barSpacingZ"
                    label="Z bar spacing"
                    unit={<MathUnit unit={coverUnit} />}
                    value={reinforcement.barSpacingZ}
                    min={0.1}
                    onChange={(value) =>
                      updateReinforcement("barSpacingZ", value)
                    }
                    tooltip="Center-to-center spacing of bottom bars parallel to Z."
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Provided reinforcement: X ={" "}
                  <span className="font-medium text-foreground">
                    {formatDisplay(designResults.summary.providedAsX, "mm²/m")} mm²/m
                  </span>
                  ; Z ={" "}
                  <span className="font-medium text-foreground">
                    {formatDisplay(designResults.summary.providedAsZ, "mm²/m")} mm²/m
                  </span>
                  .
                </p>
              </CardContent>
            </Card>

            <Card id="card-loads">
              <CardHeader>
                <div className="flex items-center gap-1.5">
                  <CardTitle>Loads</CardTitle>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="How foundation weight is considered"
                        >
                          <Info size={14} />
                        </button>
                      }
                    />
                    <TooltipContent className="max-w-sm text-xs">
                      Foundation weight is computed from footing concrete volume
                      plus soil overburden outside the pedestal footprint.
                      Soil treatment controls where overburden is applied.
                      Strength combinations use the per-row Foundation D factor.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <CardDescription>
                  Load cases applied at the top of the pedestal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="inline-flex items-baseline gap-1.5 rounded-md bg-muted px-2.5 py-1">
                      <span className="font-semibold tabular-nums">
                        {activeLoadCases.length}
                      </span>
                      <span className="text-muted-foreground">service</span>
                    </span>
                    <span className="inline-flex items-baseline gap-1.5 rounded-md bg-muted px-2.5 py-1">
                      <span className="font-semibold tabular-nums">
                        {activeStrengthLoadCases.length}
                      </span>
                      <span className="text-muted-foreground">strength</span>
                    </span>
                  </div>
                  <Button type="button" onClick={() => setLoadTableOpen(true)}>
                    Edit load table
                  </Button>
                </div>
                <div className="grid gap-1.5 sm:max-w-xs">
                  <Label htmlFor="soilTreatmentMode">Soil treatment</Label>
                  <Select
                    value={soilTreatmentMode}
                    onValueChange={(value) =>
                      setSoilTreatmentMode(value as SoilTreatmentMode)
                    }
                  >
                    <SelectTrigger
                      id="soilTreatmentMode"
                      aria-label="Soil treatment"
                    >
                      <SelectValue>
                        {(value) =>
                          SOIL_TREATMENT_OPTIONS.find(
                            (option) => option.value === value
                          )?.label
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SOIL_TREATMENT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    Footing self-weight
                  </span>
	                  <span className="text-right font-medium">
	                    <CheckValue
	                      value={designResults.summary.footingSelfWeight}
	                      unit="kN"
	                      units={units}
	                    />
	                  </span>
                  <span className="text-muted-foreground">
                    Soil overburden
                  </span>
	                  <span className="text-right font-medium">
	                    <CheckValue
	                      value={designResults.summary.soilOverburdenWeight}
	                      unit="kN"
	                      units={units}
	                    />
                  </span>
                  <span className="text-muted-foreground">
                    Applied service foundation weight
                  </span>
	                  <span className="text-right font-medium">
	                    <CheckValue
	                      value={
                          designResults.summary.appliedServiceFoundationWeight
                        }
	                      unit="kN"
	                      units={units}
	                    />
	                  </span>
                  <span className="text-muted-foreground">
                    Max service bearing
                  </span>
	                  <span className="text-right font-medium">
	                    <CheckValue
	                      value={governingServiceBearing?.maxBearing ?? null}
	                      unit="kPa"
	                      units={units}
	                    />
	                  </span>
                  <span className="text-muted-foreground">
                    Min service bearing
                  </span>
	                  <span className="text-right font-medium">
	                    <CheckValue
	                      value={governingServiceBearing?.minBearing ?? null}
	                      unit="kPa"
	                      units={units}
	                    />
	                  </span>
                  <span className="text-muted-foreground">
                    Max strength net pressure
                  </span>
	                  <span className="text-right font-medium">
	                    <CheckValue
	                      value={governingStrengthCase?.maxNetPressure ?? null}
	                      unit="kPa"
	                      units={units}
	                    />
	                  </span>
                </div>
              </CardContent>
            </Card>

            <Card id="card-design-checks">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Design checks</CardTitle>
                  <StatusBadge status={designResults.summary.overallStatus} />
                </div>
                <CardDescription>
                  {buildingCode} with {loadStandard === "none" ? "NBCC load combinations" : loadStandard} and{" "}
                  {concreteStandard}. Results below expose basis, demand,
                  capacity, utilization, and governing case.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
	                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
	                  <div className="rounded-md border bg-slate-50 p-3 dark:bg-slate-900">
	                    <div className="text-xs text-muted-foreground">
	                      Effective depth <FormulaValue tex="d_x / d_z" />
	                    </div>
	                    <div className="mt-1 space-y-0.5 font-medium">
	                      <div>
	                        <PlainEquationValue
	                          symbol="d_x"
	                          value={convertedValue(
	                            designResults.summary.effectiveDepthX,
	                            "mm",
	                            units
	                          )}
	                          unit={displayUnit("mm", units)}
	                        />
	                      </div>
	                      <div>
	                        <PlainEquationValue
	                          symbol="d_z"
	                          value={convertedValue(
	                            designResults.summary.effectiveDepthZ,
	                            "mm",
	                            units
	                          )}
	                          unit={displayUnit("mm", units)}
	                        />
	                      </div>
	                    </div>
	                  </div>
	                  <div className="rounded-md border bg-slate-50 p-3 dark:bg-slate-900">
	                    <div className="text-xs text-muted-foreground">
	                      Provided <FormulaValue tex="A_s" />
	                    </div>
	                    <div className="mt-1 space-y-0.5 font-medium">
	                      <div>
	                        <PlainEquationValue
	                          symbol="A_{s,x}"
	                          value={convertedValue(
	                            designResults.summary.providedAsX,
	                            "mm2/m",
	                            units
	                          )}
	                          unit={displayUnit("mm2/m", units)}
	                          digits={0}
	                        />
	                      </div>
	                      <div>
	                        <PlainEquationValue
	                          symbol="A_{s,z}"
	                          value={convertedValue(
	                            designResults.summary.providedAsZ,
	                            "mm2/m",
	                            units
	                          )}
	                          unit={displayUnit("mm2/m", units)}
	                          digits={0}
	                        />
	                      </div>
	                    </div>
	                  </div>
	                  <div className="rounded-md border bg-slate-50 p-3 dark:bg-slate-900">
	                    <div className="text-xs text-muted-foreground">
	                      Minimum <FormulaValue tex="A_s" />
	                    </div>
	                    <div className="mt-1 space-y-0.5 font-medium">
	                      <div>
	                        <PlainEquationValue
	                          symbol="A_{s,min,x}"
	                          value={convertedValue(
	                            designResults.summary.minimumAsX,
	                            "mm2/m",
	                            units
	                          )}
	                          unit={displayUnit("mm2/m", units)}
	                          digits={0}
	                        />
	                      </div>
	                      <div>
	                        <PlainEquationValue
	                          symbol="A_{s,min,z}"
	                          value={convertedValue(
	                            designResults.summary.minimumAsZ,
	                            "mm2/m",
	                            units
	                          )}
	                          unit={displayUnit("mm2/m", units)}
	                          digits={0}
	                        />
	                      </div>
	                    </div>
	                  </div>
	                  <div className="rounded-md border bg-slate-50 p-3 dark:bg-slate-900">
	                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
	                      Adapted ACI 336.2R rigidity advice
	                      <Tooltip>
	                        <TooltipTrigger
	                          render={
	                            <button
	                              type="button"
	                              className="text-muted-foreground hover:text-foreground"
	                              aria-label="Adapted ACI 336.2R rigidity basis"
	                            >
	                              <Info size={13} />
	                            </button>
	                          }
	                        />
	                        <TooltipContent className="max-w-xl text-sm">
	                          <div className="w-[34rem] max-w-[calc(100vw-2rem)] space-y-2 text-left leading-relaxed [&_.katex]:text-[1.05em]">
	                            <div>
	                              <MathText>{designResults.rigidity.basis}</MathText>
	                            </div>
	                            {designResults.rigidity.details.map((detail) => (
	                              <div key={detail}>
	                                <MathText>{detail}</MathText>
	                              </div>
	                            ))}
	                          </div>
	                        </TooltipContent>
	                      </Tooltip>
	                    </div>
	                    <div className="mt-1 flex items-center gap-2 font-medium">
	                      <Badge
	                        variant={
	                          designResults.rigidity.status === "rigid"
	                            ? "default"
	                            : designResults.rigidity.status === "flexible"
	                            ? "destructive"
	                            : "outline"
	                        }
	                      >
	                        {designResults.rigidity.status === "unknown"
	                          ? "Needs ks"
	                          : designResults.rigidity.status === "rigid"
	                          ? "Rigid"
	                          : "Flexible"}
	                      </Badge>
	                    </div>
		                    <div className="mt-2 text-xs text-muted-foreground">
		                      {rigidityGoverningRatio === null ||
		                      rigidityMaxProjection === null ||
		                      designResults.rigidity.governingProjection === null ? (
		                        <span>Enter <FormulaValue tex="k_s" /> to classify.</span>
		                      ) : (
		                        <div className="space-y-1.5">
		                          <div className="flex items-baseline justify-between gap-3">
		                            <span>
		                              <FormulaValue tex="L_{eff}/L_e" />
		                            </span>
		                            <span className="font-medium text-foreground">
		                              {formatDisplay(rigidityGoverningRatio, "ratio", 3)} / {formatDisplay(rigidityLimit, "ratio", 2)}
		                            </span>
		                          </div>
		                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
		                            <div
		                              className={
		                                designResults.rigidity.status === "rigid"
		                                  ? "h-full rounded-full bg-blue-600"
		                                  : "h-full rounded-full bg-red-600"
		                              }
		                              style={{ width: `${rigidityRatioPercent}%` }}
		                            />
		                          </div>
		                          <div className="flex items-baseline justify-between gap-3">
		                            <span>Projection <FormulaValue tex="a" /></span>
		                            <span className="font-medium text-foreground">
		                              {formatDisplay(
		                                units === "SI"
		                                  ? designResults.rigidity.governingProjection
		                                  : designResults.rigidity.governingProjection * M_TO_FT,
		                                lengthUnit
		                              )}{" "}
		                              /{" "}
		                              {formatDisplay(
		                                units === "SI"
		                                  ? rigidityMaxProjection
		                                  : rigidityMaxProjection * M_TO_FT,
		                                lengthUnit
		                              )}{" "}
		                              {lengthUnit}
		                            </span>
		                          </div>
		                          <div className="text-[11px]">
		                            current max from pedestal face / max before flexible advisory
		                          </div>
		                        </div>
		                      )}
		                    </div>
	                  </div>
	                </div>

	                <div className="space-y-2">
                  {designResults.checks.map((item) => {
                    const contact = item.contact;
                    return (
                    <div
                      key={item.id}
                      className="relative rounded-md border bg-white p-3 dark:bg-slate-950"
                    >
                      <div className="pr-24">
                        <div className="min-w-0">
                          <div className="font-medium">{item.label}</div>
                          <div className="mt-1 text-[11px]/relaxed text-muted-foreground">
                            <MathText>{item.basis}</MathText>
                          </div>
                        </div>
                      </div>
                      <div className="absolute right-3 top-3">
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <div>
	                          <div className="text-muted-foreground">
                              {contact ? "Contact" : "Demand"}
                            </div>
	                          <div className="font-medium">
	                            {contact ? (
	                              `${fmt(contact.percent, 1)}%`
	                            ) : (
	                              <CheckValue
	                                value={item.demand}
	                                unit={item.unit}
	                                units={units}
	                              />
	                            )}
	                          </div>
	                        </div>
	                        <div>
	                          <div className="text-muted-foreground">
                              {contact ? "State" : "Capacity"}
                            </div>
	                          <div className="font-medium">
                              {contact ? (
                                <span>
                                  {CONTACT_STATE_LABEL[contact.state] ??
                                    contact.state}
                                </span>
                              ) : (
                                <CheckValue
                                  value={item.capacity}
                                  unit={item.unit}
                                  units={units}
                                />
                              )}
	                          </div>
	                        </div>
                        <div>
                          <div className="text-muted-foreground">
                            {contact ? "Min required" : "D/C"}
                          </div>
                          <div className="font-medium">
                            {contact
                              ? contact.minRequired > 0
                                ? `${fmt(contact.minRequired, 1)}%`
                                : "—"
                              : utilizationText(item)}
                          </div>
                        </div>
	                        <div>
	                          <div className="text-muted-foreground">
	                            Governing Load Case
	                          </div>
	                          <div className="font-medium">
	                            <MathText>{item.governingCase}</MathText>
	                          </div>
                        </div>
                      </div>
                      {item.details.length > 0 ? (
                        <div className="mt-2 space-y-0.5 text-[11px]/relaxed text-muted-foreground">
                          {item.details.map((detail) => (
                            <div key={detail}>
                              <MathText>{detail}</MathText>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {item.notes.length > 0 ? (
                        <div className="mt-2 space-y-0.5 text-[11px]/relaxed text-amber-700 dark:text-amber-300">
                          {item.notes.map((note) => (
                            <div key={note}>
                              <MathText>{note}</MathText>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    );
                  })}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Service bearing by case
                    </div>
                    <Table className="border">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="border-r">Case</TableHead>
	                          <TableHead className="border-r text-right">
	                            <FormulaValue tex="q_{max}" />
	                          </TableHead>
	                          <TableHead className="border-r text-right">
	                            <FormulaValue tex="q_{min}" />
	                          </TableHead>
	                          <TableHead className="text-right">
	                            <FormulaValue tex="N" />
	                          </TableHead>
                          <TableHead className="border-l text-right">Contact</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {designResults.serviceBearing.length > 0 ? (
                          designResults.serviceBearing.map((row) => (
                            <TableRow key={row.id}>
	                              <TableCell className="border-r">
	                                <MathText>{row.name}</MathText>
	                              </TableCell>
	                              <TableCell className="border-r text-right">
	                                <CheckValue
	                                  value={row.maxBearing}
	                                  unit="kPa"
	                                  units={units}
	                                />
	                              </TableCell>
	                              <TableCell className="border-r text-right">
	                                <CheckValue
	                                  value={row.minBearing}
	                                  unit="kPa"
	                                  units={units}
	                                />
	                              </TableCell>
	                              <TableCell className="text-right">
	                                <CheckValue
	                                  value={row.axial}
	                                  unit="kN"
	                                  units={units}
	                                />
	                              </TableCell>
                              <TableCell className="border-l text-right text-xs text-muted-foreground">
                                {row.contactState === "full"
                                  ? "Full"
                                  : `${row.contactPercent.toFixed(0)}% (${row.contactState})`}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-muted-foreground">
                              No service cases.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Strength actions by case
                    </div>
                    <Table className="border">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="border-r">Case</TableHead>
	                          <TableHead className="border-r text-right">
	                            <FormulaValue tex="q_{net,max}" />
	                          </TableHead>
	                          <TableHead className="border-r text-right">
	                            Punching <FormulaValue tex="v_u" />
	                          </TableHead>
	                          <TableHead className="text-right">
	                            Flex <FormulaValue tex="M_x / M_z" />
	                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {designResults.strengthCases.length > 0 ? (
                          designResults.strengthCases.map((row) => (
                            <TableRow key={row.id}>
	                              <TableCell className="border-r">
	                                <MathText>{row.name}</MathText>
	                              </TableCell>
	                              <TableCell className="border-r text-right">
	                                <CheckValue
	                                  value={row.maxNetPressure}
	                                  unit="kPa"
	                                  units={units}
	                                />
	                              </TableCell>
	                              <TableCell className="border-r text-right">
	                                <CheckValue
	                                  value={row.punchingStress}
	                                  unit="MPa"
	                                  units={units}
	                                />
	                              </TableCell>
	                              <TableCell className="text-right">
	                                <CheckValue
	                                  value={row.flexureX}
	                                  unit="kN-m/m"
	                                  units={units}
	                                />{" "}
	                                /{" "}
	                                <CheckValue
	                                  value={row.flexureZ}
	                                  unit="kN-m/m"
	                                  units={units}
	                                />
	                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-muted-foreground">
                              No strength cases.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card id="card-values">
              <CardHeader className="pb-2">
                <CardTitle>Values</CardTitle>
                <CardDescription>
                  Current input and computed values for this footing model.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Inputs
                  </div>
                  <div className="text-xs">
                    {[
                      {
                        k: "A-delta-allow",
                        name: (
                          <>
                            <FormulaValue tex="s_{allow}" /> - allowable settlement
                          </>
                        ),
                        value: formatDisplay(materials.allowableSettlement, coverUnit),
                        unit: coverUnit,
                        reference: null,
                      },
                      {
                        k: "A-qa",
                        name: (
                          <>
                            <FormulaValue tex="q_a" /> - allowable bearing
                          </>
                        ),
                        value: formatDisplay(materials.allowableBearing, bearingUnit),
                        unit: bearingUnit,
                        reference: null,
                      },
                      {
                        k: "B-qu",
                        name: (
                          <>
                            <FormulaValue tex="q_u" /> - ultimate bearing
                          </>
                        ),
                        value: formatDisplay(materials.ultimateBearing, bearingUnit),
                        unit: bearingUnit,
                        reference: null,
                      },
                      {
                        k: "C-cover",
                        name: (
                          <>
                            <FormulaValue tex="c_c" /> - clear cover
                          </>
                        ),
                        value: formatDisplay(materials.clearCover, coverUnit),
                        unit: coverUnit,
                        reference: null,
                      },
                      {
                        k: "E-Ec",
                        name: (
                          <>
                            <FormulaValue tex="E_c" /> - concrete modulus
                          </>
                        ),
                        value: formatDisplay(materials.concreteElasticModulus, strengthUnit),
                        unit: strengthUnit,
                        reference: null,
                      },
                      {
                        k: "F-fc",
                        name: (
                          <>
                            <FormulaValue tex="f'_c" /> - concrete strength
                          </>
                        ),
                        value: formatDisplay(materials.concreteStrength, strengthUnit),
                        unit: strengthUnit,
                        reference: null,
                      },
                      {
                        k: "F-fy",
                        name: (
                          <>
                            <FormulaValue tex="f_y" /> - rebar yield
                          </>
                        ),
                        value: formatDisplay(materials.rebarYield, strengthUnit),
                        unit: strengthUnit,
                        reference: null,
                      },
                      {
                        k: "F-footing-plan",
                        name: <>Footing plan</>,
                        value: (
                          <FormulaValue
                            tex={`${texNumberDisplay(
                              geometry.footingLength,
                              lengthUnit
                            )} \\times ${texNumberDisplay(
                              geometry.footingWidth,
                              lengthUnit
                            )}`}
                          />
                        ),
                        unit: lengthUnit,
                        reference: null,
                      },
                      {
                        k: "G-gamma-c",
                        name: (
                          <>
                            <FormulaValue tex={"\\gamma_c"} /> - concrete unit weight
                          </>
                        ),
                        value: formatDisplay(materials.concreteUnitWeight, unitWeightUnit),
                        unit: unitWeightUnit,
                        reference: null,
                      },
                      {
                        k: "D-df",
                        name: (
                          <>
                            <FormulaValue tex="D_f" /> - frost depth
                          </>
                        ),
                        value: formatDisplay(geometry.frostDepth, lengthUnit),
                        unit: lengthUnit,
                        reference: null,
                      },
                      {
                        k: "D-dt",
                        name: (
                          <>
                            <FormulaValue tex="D_t" /> - footing top depth
                          </>
                        ),
                        value: formatDisplay(geometry.soilCoverDepth, lengthUnit),
                        unit: lengthUnit,
                        reference: null,
                      },
                      {
                        k: "D-dw",
                        name: (
                          <>
                            <FormulaValue tex="D_w" /> - groundwater depth
                          </>
                        ),
                        value: formatDisplay(geometry.groundwaterDepth, lengthUnit),
                        unit: lengthUnit,
                        reference: null,
                      },
                      {
                        k: "K-ks",
                        name: (
                          <>
                            <FormulaValue tex="k_s" /> - subgrade reaction modulus
                          </>
                        ),
                        value: formatDisplay(materials.subgradeReactionModulus, subgradeReactionUnit),
                        unit: subgradeReactionUnit,
                        reference: null,
                      },
                      {
                        k: "L-load-cases",
                        name: <>Load cases</>,
                        value: `${activeLoadCases.length} / ${activeStrengthLoadCases.length}`,
                        unit: "svc/str",
                        reference: null,
                      },
                      {
                        k: "M-FS-ot",
                        name: (
                          <>
                            <FormulaValue tex="FS_{OT}" /> - overturning safety factor
                          </>
                        ),
                        value: fmt(materials.overturningSafetyFactor, 2),
                        unit: "",
                        reference: null,
                      },
                      {
                        k: "M-FS-sliding",
                        name: (
                          <>
                            <FormulaValue tex="FS_{sliding}" /> - sliding safety factor
                          </>
                        ),
                        value: fmt(materials.slidingSafetyFactor, 2),
                        unit: "",
                        reference: null,
                      },
                      {
                        k: "M-model-name",
                        name: <>Model name</>,
                        value: modelName || "Untitled",
                        unit: "",
                        reference: null,
                      },
                      {
                        k: "zz-mu",
                        name: (
                          <>
                            <FormulaValue tex={"\\mu"} /> - friction coefficient
                          </>
                        ),
                        value: fmt(materials.soilFrictionCoefficient, 2),
                        unit: "",
                        reference: null,
                      },
                      {
                        k: "zz-theta-x",
                        name: (
                          <>
                            <FormulaValue tex="\\theta_{x,allow}" /> - allowable rotation X
                          </>
                        ),
                        value: fmt(materials.allowableRotationX, 4),
                        unit: "rad",
                        reference: null,
                      },
                      {
                        k: "zz-theta-z",
                        name: (
                          <>
                            <FormulaValue tex="\\theta_{z,allow}" /> - allowable rotation Z
                          </>
                        ),
                        value: fmt(materials.allowableRotationZ, 4),
                        unit: "rad",
                        reference: null,
                      },
                      {
                        k: "S-soil-treatment",
                        name: <>Soil treatment</>,
                        value: soilTreatmentLabel,
                        unit: "",
                        reference: null,
                      },
                      {
                        k: "zz-gamma-s",
                        name: (
                          <>
                            <FormulaValue tex={"\\gamma_s"} /> - soil unit weight
                          </>
                        ),
                        value: formatDisplay(materials.soilUnitWeight, unitWeightUnit),
                        unit: unitWeightUnit,
                        reference: null,
                      },
                      {
                        k: "zz-gamma-sat",
                        name: (
                          <>
                            <FormulaValue tex={"\\gamma_{sat}"} /> - saturated soil unit weight
                          </>
                        ),
                        value: formatDisplay(materials.saturatedSoilUnitWeight, unitWeightUnit),
                        unit: unitWeightUnit,
                        reference: null,
                      },
                      {
                        k: "zz-gamma-w",
                        name: (
                          <>
                            <FormulaValue tex={"\\gamma_w"} /> - water unit weight
                          </>
                        ),
                        value: formatDisplay(materials.waterUnitWeight, unitWeightUnit),
                        unit: unitWeightUnit,
                        reference: null,
                      },
                      {
                        k: "P-pedestal-footprint",
                        name: <>Pedestal footprint</>,
                        value: (
                          <FormulaValue
                            tex={`${texNumberDisplay(
                              geometry.pedestalLength,
                              lengthUnit
                            )} \\times ${texNumberDisplay(
                              geometry.pedestalWidth,
                              lengthUnit
                            )}`}
                          />
                        ),
                        unit: lengthUnit,
                        reference: null,
                      },
                      {
                        k: "P-pedestal-offset",
                        name: <>Pedestal offset</>,
                        value: (
                          <FormulaValue
                            tex={`x=${texNumberDisplay(
                              pedestalOffsetX,
                              lengthUnit
                            )},\\ z=${texNumberDisplay(
                              pedestalOffsetZ,
                              lengthUnit
                            )}`}
                          />
                        ),
                        unit: lengthUnit,
                        reference: null,
                      },
                      {
                        k: "T-thickness",
                        name: (
                          <>
                            <FormulaValue tex="h" /> - footing thickness
                          </>
                        ),
                        value: formatDisplay(geometry.footingThickness, lengthUnit),
                        unit: lengthUnit,
                        reference: null,
                      },
                      {
                        k: "X-rebar",
                        name: <>X reinforcement</>,
                        value: (
                          <FormulaValue
                            tex={`${texNumberDisplay(
                              reinforcement.barDiameterX,
                              coverUnit
                            )}@${texNumberDisplay(reinforcement.barSpacingX, coverUnit)}`}
                          />
                        ),
                        unit: coverUnit,
                        reference: null,
                      },
                      {
                        k: "Z-rebar",
                        name: <>Z reinforcement</>,
                        value: (
                          <FormulaValue
                            tex={`${texNumberDisplay(
                              reinforcement.barDiameterZ,
                              coverUnit
                            )}@${texNumberDisplay(reinforcement.barSpacingZ, coverUnit)}`}
                          />
                        ),
                        unit: coverUnit,
                        reference: null,
                      },
                    ]
                      .sort((a, b) => a.k.localeCompare(b.k))
                      .map((row) => (
                        <DenseRow
                          key={row.k}
                          name={row.name}
                          value={row.value}
                          unit={row.unit}
                          reference={row.reference}
                        />
                      ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Computed
                  </div>
                  <div className="text-xs">
                    {[
                      {
                        k: "A-As-min-x",
                        name: (
                          <>
                            <FormulaValue tex="A_{s,min,x}" /> - minimum X steel
                          </>
                        ),
                        value: formatDisplay(
                          convertedValue(designResults.summary.minimumAsX, "mm2/m", units),
                          units === "SI" ? "mm²/m" : "in²/ft"
                        ),
                        unit: units === "SI" ? "mm²/m" : "in²/ft",
                        reference: null,
                      },
                      {
                        k: "A-As-min-z",
                        name: (
                          <>
                            <FormulaValue tex="A_{s,min,z}" /> - minimum Z steel
                          </>
                        ),
                        value: formatDisplay(
                          convertedValue(designResults.summary.minimumAsZ, "mm2/m", units),
                          units === "SI" ? "mm²/m" : "in²/ft"
                        ),
                        unit: units === "SI" ? "mm²/m" : "in²/ft",
                        reference: null,
                      },
                      {
                        k: "A-As-x",
                        name: (
                          <>
                            <FormulaValue tex="A_{s,x}" /> - provided X steel
                          </>
                        ),
                        value: formatDisplay(
                          convertedValue(designResults.summary.providedAsX, "mm2/m", units),
                          units === "SI" ? "mm²/m" : "in²/ft"
                        ),
                        unit: units === "SI" ? "mm²/m" : "in²/ft",
                        reference: null,
                      },
                      {
                        k: "A-As-z",
                        name: (
                          <>
                            <FormulaValue tex="A_{s,z}" /> - provided Z steel
                          </>
                        ),
                        value: formatDisplay(
                          convertedValue(designResults.summary.providedAsZ, "mm2/m", units),
                          units === "SI" ? "mm²/m" : "in²/ft"
                        ),
                        unit: units === "SI" ? "mm²/m" : "in²/ft",
                        reference: null,
                      },
                      {
                        k: "D-dx",
                        name: (
                          <>
                            <FormulaValue tex="d_x" /> - effective depth X
                          </>
                        ),
                        value: formatDisplay(
                          convertedValue(designResults.summary.effectiveDepthX, "mm", units),
                          coverUnit
                        ),
                        unit: coverUnit,
                        reference: null,
                      },
                      {
                        k: "D-dz",
                        name: (
                          <>
                            <FormulaValue tex="d_z" /> - effective depth Z
                          </>
                        ),
                        value: formatDisplay(
                          convertedValue(designResults.summary.effectiveDepthZ, "mm", units),
                          coverUnit
                        ),
                        unit: coverUnit,
                        reference: null,
                      },
                      {
                        k: "P-Pmax",
                        name: (
                          <>
                            <FormulaValue tex="P_{max}" /> - max compression
                          </>
                        ),
                        value: formatDisplay(maxCompression, forceUnit),
                        unit: forceUnit,
                        reference: null,
                      },
                      {
                        k: "Q-qmax",
                        name: (
                          <>
                            <FormulaValue tex="q_{max}" /> - max service bearing
                          </>
                        ),
                        value:
                          governingServiceBearing === null
                            ? "N/A"
                            : formatDisplay(
                                convertedValue(governingServiceBearing.maxBearing, "kPa", units),
                                bearingUnit
                              ),
                        unit: bearingUnit,
                        reference: null,
                        highlight: true,
                      },
                      {
                        k: "S-status",
                        name: <>Overall status</>,
                        value: statusLabel(designResults.summary.overallStatus),
                        unit: "",
                        reference: null,
                        highlight: designResults.summary.overallStatus !== "pass",
                      },
                      {
                        k: "V-volume",
                        name: (
                          <>
                            <FormulaValue tex="V_c" /> - concrete volume
                          </>
                        ),
                        value: formatDisplay(concreteVolume, `${lengthUnit}³`),
                        unit: `${lengthUnit}³`,
                        reference: null,
                      },
                      {
                        k: "W-self",
                        name: (
                          <>
                            <FormulaValue tex="W_f" /> - footing self weight
                          </>
                        ),
                        value: formatDisplay(
                          convertedValue(designResults.summary.footingSelfWeight, "kN", units),
                          forceUnit
                        ),
                        unit: forceUnit,
                        reference: null,
                      },
                      {
                        k: "W-soil",
                        name: (
                          <>
                            <FormulaValue tex="W_s" /> - soil overburden
                          </>
                        ),
                        value: formatDisplay(
                          convertedValue(designResults.summary.soilOverburdenWeight, "kN", units),
                          forceUnit
                        ),
                        unit: forceUnit,
                        reference: null,
                      },
                      {
                        k: "W-total",
                        name: (
                          <>
                            <FormulaValue tex="W_{svc}" /> - applied service foundation weight
                          </>
                        ),
                        value: formatDisplay(
                          convertedValue(
                            designResults.summary.appliedServiceFoundationWeight,
                            "kN",
                            units
                          ),
                          forceUnit
                        ),
                        unit: forceUnit,
                        reference: null,
                      },
                    ]
                      .sort((a, b) => a.k.localeCompare(b.k))
                      .map((row) => (
                        <DenseRow
                          key={row.k}
                          name={row.name}
                          value={row.value}
                          unit={row.unit}
                          reference={row.reference}
                          highlight={row.highlight}
                        />
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="xl:sticky xl:top-4">
            <Card
              id="card-3d-model"
              size="sm"
              className="xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto"
            >
              <CardHeader className="gap-0.5">
                <CardTitle>3D model</CardTitle>
              </CardHeader>
              <CardContent>
                <FootingModel3d geometry={geometry} />
              </CardContent>
            </Card>

            <Card id="card-contact-plan" size="sm" className="mt-4">
              <CardHeader className="gap-0.5">
                <CardTitle>Soil-contact plan</CardTitle>
                <CardDescription className="text-[11px]/snug">
                  Load case
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {contactPlanOptions.length > 0 && (
                  <Select
                    value={activeContactPlanKey ?? undefined}
                    onValueChange={setSelectedContactPlanKey}
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-8 w-full justify-between px-2 text-xs"
                      aria-label="Soil-contact plan load case"
                    >
                      <SelectValue>
                        {() => {
                          const o = contactPlanOptions.find(
                            (it) => it.key === activeContactPlanKey
                          );
                          return o ? (
                            <span className="flex items-center gap-1.5">
                              <span>{o.name}</span>
                              <span className="text-muted-foreground">
                                · {o.kind}
                              </span>
                            </span>
                          ) : (
                            "Select load case"
                          );
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(["service", "strength"] as const).map((kind) => {
                        const group = contactPlanOptions.filter(
                          (o) => o.kind === kind
                        );
                        if (group.length === 0) return null;
                        return (
                          <SelectGroup key={kind}>
                            <SelectLabel className="capitalize">
                              {kind}
                            </SelectLabel>
                            {group.map((o) => (
                              <SelectItem key={o.key} value={o.key}>
                                <span className="flex-1">{o.name}</span>
                                {o.bearingCritical && (
                                  <span
                                    title="Most critical for bearing"
                                    className="shrink-0 rounded-sm bg-amber-400/20 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-300"
                                  >
                                    bearing
                                  </span>
                                )}
                                {o.upliftCritical && (
                                  <span
                                    title="Most critical for uplift"
                                    className="shrink-0 rounded-sm bg-sky-400/20 px-1 text-[9px] font-semibold uppercase tracking-wide text-sky-300"
                                  >
                                    uplift
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
                <ContactPlan
                  geometry={siGeometryForPlan}
                  planCase={contactPlanCase}
                  formatPressure={formatPressure}
                />
              </CardContent>
            </Card>
          </aside>
        </main>

        <footer className="mx-auto max-w-7xl space-y-1 px-6 py-6 text-xs text-muted-foreground">
          <span>
            Isolated Footing Design · calculation engine active · verify load
            combinations against selected code.
          </span>
          <div>
            {APP_DATE} · V.{APP_VERSION}
          </div>
        </footer>
      </div>
    </TooltipProvider>
    </DisplayPrecisionContext.Provider>
  );
}
