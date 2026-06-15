"use client";

import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Copy,
  Info,
  MinusCircle,
  Pencil,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ClipboardEvent,
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
import {
  Select,
  SelectContent,
  SelectItem,
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
import type { FootingGeometry } from "@/components/footing/FootingModel3d";
import {
  calculateFootingDesign,
  type CheckStatus,
  type CheckUnit,
  type DesignCheck,
  type ReinforcementInputs as EngineReinforcementInputs,
} from "@/lib/footingEngine";

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

type UnitSystem = "SI" | "USC";
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

const BUILDING_CODE_OPTIONS: BuildingCode[] = [
  "IBC-2018",
  "IBC-2024",
  "NBCC-2015",
  "NBCC-2020",
  "NBCC-2025",
];

const LOAD_STANDARD_OPTIONS: Array<{ value: LoadStandard; label: string }> = [
  { value: "ASCE 7-16", label: "ASCE 7-16" },
  { value: "ASCE 7-22", label: "ASCE 7-22" },
  { value: "none", label: "Not used" },
];

const CONCRETE_STANDARD_OPTIONS: ConcreteStandard[] = [
  "ACI 318-14",
  "ACI 318-19",
  "CSA A23.3-14",
  "CSA A23.3-19",
  "CSA A23.3-24",
];

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

interface MaterialInputs {
  concreteStrength: number;
  rebarYield: number;
  concreteUnitWeight: number;
  clearCover: number;
  allowableBearing: number;
  soilFrictionCoefficient: number;
}

interface LoadCase {
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

type LoadCombinationType = "service" | "strength";
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

const DEFAULT_GEOMETRY_SI: FootingGeometry = {
  footingLength: 2.4,
  footingWidth: 2.4,
  footingThickness: 0.6,
  pedestalLength: 0.6,
  pedestalWidth: 0.6,
  pedestalHeight: 0.8,
  pedestalOffsetX: 0,
  pedestalOffsetZ: 0,
};

const DEFAULT_MATERIALS_SI: MaterialInputs = {
  concreteStrength: 30,
  rebarYield: 420,
  concreteUnitWeight: 24,
  clearCover: 75,
  allowableBearing: 200,
  soilFrictionCoefficient: 0.45,
};

const DEFAULT_REINFORCEMENT_SI: ReinforcementInputs = {
  barDiameterX: 20,
  barSpacingX: 200,
  barDiameterZ: 20,
  barSpacingZ: 200,
};

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
    rebarYield: roundMaterial(
      materials.rebarYield * (toUsc ? MPA_TO_KSI : 1 / MPA_TO_KSI)
    ),
    concreteUnitWeight: roundMaterial(
      materials.concreteUnitWeight * (toUsc ? KN_M3_TO_PCF : 1 / KN_M3_TO_PCF)
    ),
    clearCover: roundMaterial(
      materials.clearCover * (toUsc ? MM_TO_IN : 1 / MM_TO_IN)
    ),
    allowableBearing: roundMaterial(
      materials.allowableBearing * (toUsc ? KPA_TO_KSF : 1 / KPA_TO_KSF)
    ),
    soilFrictionCoefficient: materials.soilFrictionCoefficient,
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

function convertedValue(value: number, unit: CheckUnit, units: UnitSystem) {
  if (units === "SI") return value;
  if (unit === "kPa") return value * KPA_TO_KSF;
  if (unit === "kN") return value * KN_TO_KIP;
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
    if (unit === "kN-m/m") return "kN·m/m";
    return unit;
  }
  if (unit === "kPa") return "ksf";
  if (unit === "kN") return "kip";
  if (unit === "kN/m") return "kip/ft";
  if (unit === "kN-m/m") return "kip·ft/ft";
  if (unit === "MPa") return "ksi";
  if (unit === "mm") return "in";
  if (unit === "mm2/m") return "in²/ft";
  return unit;
}

function displayCheckValue(
  value: number | null,
  unit: CheckUnit,
  units: UnitSystem,
  digits = 3
) {
  if (value === null) return "N/A";
  if (!Number.isFinite(value)) return "inf";
  const nextValue = convertedValue(value, unit, units);
  const nextUnit = displayUnit(unit, units);
  return `${fmt(nextValue, digits)}${nextUnit ? ` ${nextUnit}` : ""}`;
}

function utilizationText(check: DesignCheck) {
  if (check.utilization === null) return "N/A";
  if (!Number.isFinite(check.utilization)) return "inf";
  return fmt(check.utilization, 2);
}

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
  const [loadCombinationType, setLoadCombinationType] =
    useState<LoadCombinationType>("service");
  const [isSelectingCells, setIsSelectingCells] = useState(false);
  const [selectedCells, setSelectedCells] = useState<SelectionRange | null>(
    null
  );
  const [geometry, setGeometry] = useState<FootingGeometry>(
    defaultGeometry("SI")
  );
  const [materials, setMaterials] = useState<MaterialInputs>(
    defaultMaterials("SI")
  );
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
  const setCurrentLoadCases =
    loadCombinationType === "service"
      ? setServiceLoadCases
      : setStrengthLoadCases;

  const lengthUnit = units === "SI" ? "m" : "ft";
  const strengthUnit = units === "SI" ? "MPa" : "ksi";
  const unitWeightUnit = units === "SI" ? "kN/m³" : "pcf";
  const coverUnit = units === "SI" ? "mm" : "in";
  const bearingUnit = units === "SI" ? "kPa" : "ksf";
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
  const maxStrengthCompression = Math.max(
    0,
    ...activeStrengthLoadCases.map((loadCase) => loadCase.P)
  );
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
    units,
  ]);
  const governingServiceBearing = designResults.serviceBearing.reduce<
    (typeof designResults.serviceBearing)[number] | null
  >(
    (governing, result) =>
      !governing || result.maxBearing > governing.maxBearing
        ? result
        : governing,
    null
  );
  const governingStrengthCase = designResults.strengthCases.reduce<
    (typeof designResults.strengthCases)[number] | null
  >(
    (governing, result) =>
      !governing || result.maxNetPressure > governing.maxNetPressure
        ? result
        : governing,
    null
  );
  const governingLoadCase =
    activeLoadCases.find((loadCase) => loadCase.P === maxCompression)?.name ||
    "None";

  useEffect(() => {
    if (!isSelectingCells) return;
    const stopSelecting = () => setIsSelectingCells(false);
    window.addEventListener("mouseup", stopSelecting);
    return () => window.removeEventListener("mouseup", stopSelecting);
  }, [isSelectingCells]);

  const updateGeometry = (key: keyof FootingGeometry, value: number) => {
    setGeometry((current) =>
      clampPedestalOffsets({ ...current, [key]: value })
    );
  };

  const updateMaterials = (key: keyof MaterialInputs, value: number) => {
    setMaterials((current) => ({ ...current, [key]: value }));
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

  const startCellSelection = (row: number, column: number) => {
    const position = { row, column };
    setSelectedCells({ start: position, end: position });
    setIsSelectingCells(true);
  };

  const extendCellSelection = (row: number, column: number) => {
    if (!isSelectingCells) return;
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
    setReinforcement((current) =>
      convertReinforcement(current, units, nextUnits)
    );
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
    setReinforcement(defaultReinforcement(units));
    setServiceLoadCases(defaultLoadCases(units));
    setStrengthLoadCases(defaultStrengthLoadCases(units));
  };

  const updateBuildingCode = (nextBuildingCode: BuildingCode) => {
    const references = CODE_REFERENCES[nextBuildingCode];
    setBuildingCode(nextBuildingCode);
    setLoadStandard(references.loadStandard);
    setConcreteStandard(references.concreteStandard);
  };

  return (
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
                  Concrete isolated footing design workspace.
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
                  size="icon"
                  onClick={resetInputs}
                  aria-label="Reset all inputs to defaults"
                >
                  <RotateCcw />
                </Button>
                <div className="flex items-center gap-1.5">
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
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Loads</span>
                  <Select
                    value={loadStandard}
                    onValueChange={(value) => {
                      const nextLoadStandard = value as LoadStandard;
                      if (
                        nextLoadStandard ===
                        CODE_REFERENCES[buildingCode].loadStandard
                      ) {
                        setLoadStandard(nextLoadStandard);
                      }
                    }}
                  >
                    <SelectTrigger size="sm" aria-label="Load standard">
                      <SelectValue>
                        {(value) =>
                          LOAD_STANDARD_OPTIONS.find(
                            (option) => option.value === value
                          )?.label
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LOAD_STANDARD_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          disabled={
                            option.value !==
                            CODE_REFERENCES[buildingCode].loadStandard
                          }
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    Concrete
                  </span>
                  <Select
                    value={concreteStandard}
                    onValueChange={(value) => {
                      const nextConcreteStandard = value as ConcreteStandard;
                      if (
                        nextConcreteStandard ===
                        CODE_REFERENCES[buildingCode].concreteStandard
                      ) {
                        setConcreteStandard(nextConcreteStandard);
                      }
                    }}
                  >
                    <SelectTrigger size="sm" aria-label="Concrete code">
                      <SelectValue>{(value) => value}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CONCRETE_STANDARD_OPTIONS.map((option) => (
                        <SelectItem
                          key={option}
                          value={option}
                          disabled={
                            option !==
                            CODE_REFERENCES[buildingCode].concreteStandard
                          }
                        >
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            >
              <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0">
                  <h2 id="load-table-heading" className="text-base font-semibold">
                    Load cases
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Paste tab-delimited cells from Excel. P, Hx, and Hz use{" "}
                    {forceUnit}; Mx, Mz, and T use {momentUnit}. Drag across
                    cells to select.
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
                className="min-h-0 flex-1 overflow-auto p-5"
                onCopy={copySelectedCells}
              >
                <Tabs
                  value={loadCombinationType}
                  onValueChange={(value) => {
                    setLoadCombinationType(value as LoadCombinationType);
                    setSelectedCells(null);
                  }}
                  className="gap-4"
                >
                  <TabsList>
                    <TabsTrigger value="service">Service / stability</TabsTrigger>
                    <TabsTrigger value="strength">Strength</TabsTrigger>
                  </TabsList>
                  <TabsContent value={loadCombinationType}>
                    <Table
                      className={`border ${
                        loadCombinationType === "strength"
                          ? "min-w-[980px]"
                          : "min-w-[760px]"
                      }`}
                    >
                      <TableHeader>
                        <TableRow>
                          {loadCaseColumns.map((column) => (
                            <TableHead key={column.key} className="border-r">
                              <div className="space-y-0.5">
                                <div>{column.label}</div>
                                {column.unitType !== "text" &&
                                column.unitType !== "factor" ? (
                                  <div className="text-[10px] font-normal text-muted-foreground">
                                    {column.unitType === "force"
                                      ? forceUnit
                                      : momentUnit}
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
                              const selected = isCellSelected(
                                rowIndex,
                                columnIndex
                              );
                              const value =
                                isEmptyRow
                                  ? ""
                                  : column.key === "name"
                                  ? loadCase.name
                                  : String(loadCase[column.key]);
                              return (
                                <TableCell
                                  key={column.key}
                                  className={`border-r p-0 ${
                                    selected
                                      ? "bg-blue-100 ring-1 ring-inset ring-blue-500 dark:bg-blue-950"
                                      : ""
                                  }`}
                                  onMouseDown={() =>
                                    startCellSelection(rowIndex, columnIndex)
                                  }
                                  onMouseEnter={() =>
                                    extendCellSelection(rowIndex, columnIndex)
                                  }
                                >
                                  <input
                                    aria-label={`${column.label} row ${
                                      rowIndex + 1
                                    }`}
                                    value={value}
                                    inputMode={
                                      column.key === "name"
                                        ? "text"
                                        : "decimal"
                                    }
                                    onChange={(event) =>
                                      updateLoadCase(
                                        rowIndex,
                                        column.key,
                                        event.target.value
                                      )
                                    }
                                    onPaste={(event) =>
                                      pasteLoadCases(
                                        event,
                                        rowIndex,
                                        columnIndex
                                      )
                                    }
                                    className="h-9 w-full min-w-0 bg-transparent px-2 text-sm outline-none focus:bg-blue-50 dark:focus:bg-slate-800"
                                  />
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
                  Coordinates: X/Z are horizontal in plan; P and T act along or
                  about the vertical axis at top of pedestal. The last row stays
                  blank for new load cases.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyLoadCases()}
                  >
                    <Copy />
                    {selectedCells ? "Copy selection" : "Copy table"}
                  </Button>
                  <Button type="button" onClick={() => setLoadTableOpen(false)}>
                    Done
                  </Button>
                </div>
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
                  Footing slab and pedestal footprint dimensions.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumField
                  id="footingLength"
                  label="Footing length"
                  unit={lengthUnit}
                  value={geometry.footingLength}
                  min={0.05}
                  onChange={(value) => updateGeometry("footingLength", value)}
                  tooltip="Plan dimension of footing in model X direction."
                />
                <NumField
                  id="footingWidth"
                  label="Footing width"
                  unit={lengthUnit}
                  value={geometry.footingWidth}
                  min={0.05}
                  onChange={(value) => updateGeometry("footingWidth", value)}
                  tooltip="Plan dimension of footing in model Z direction."
                />
                <NumField
                  id="footingThickness"
                  label="Footing thickness"
                  unit={lengthUnit}
                  value={geometry.footingThickness}
                  min={0.05}
                  onChange={(value) =>
                    updateGeometry("footingThickness", value)
                  }
                  tooltip="Concrete slab thickness."
                />
                <NumField
                  id="pedestalLength"
                  label="Pedestal footprint length"
                  unit={lengthUnit}
                  value={geometry.pedestalLength}
                  min={0.05}
                  onChange={(value) => updateGeometry("pedestalLength", value)}
                  tooltip="Pedestal dimension parallel to footing length."
                />
                <NumField
                  id="pedestalWidth"
                  label="Pedestal footprint width"
                  unit={lengthUnit}
                  value={geometry.pedestalWidth}
                  min={0.05}
                  onChange={(value) => updateGeometry("pedestalWidth", value)}
                  tooltip="Pedestal dimension parallel to footing width."
                />
                <NumField
                  id="pedestalHeight"
                  label="Pedestal visual height"
                  unit={lengthUnit}
                  value={geometry.pedestalHeight}
                  min={0.05}
                  onChange={(value) => updateGeometry("pedestalHeight", value)}
                  tooltip="Height from footing top to load application. Pedestal design is outside this footing-only scope."
                />
                <NumField
                  id="pedestalOffsetX"
                  label="Pedestal offset X"
                  unit={lengthUnit}
                  value={pedestalOffsetX}
                  min={-pedestalOffsetLimitX}
                  max={pedestalOffsetLimitX}
                  onChange={(value) => updateGeometry("pedestalOffsetX", value)}
                  tooltip="Offset from footing center. Positive X follows the red plan axis."
                />
                <NumField
                  id="pedestalOffsetZ"
                  label="Pedestal offset Z"
                  unit={lengthUnit}
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
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <NumField
                  id="concreteStrength"
                  label="Concrete strength"
                  unit={strengthUnit}
                  value={materials.concreteStrength}
                  min={0}
                  onChange={(value) =>
                    updateMaterials("concreteStrength", value)
                  }
                  tooltip="Specified compressive strength for footing concrete."
                />
                <NumField
                  id="rebarYield"
                  label="Rebar yield"
                  unit={strengthUnit}
                  value={materials.rebarYield}
                  min={0}
                  onChange={(value) => updateMaterials("rebarYield", value)}
                  tooltip="Specified yield strength for footing reinforcement."
                />
                <NumField
                  id="concreteUnitWeight"
                  label="Concrete unit weight"
                  unit={unitWeightUnit}
                  value={materials.concreteUnitWeight}
                  min={0}
                  onChange={(value) =>
                    updateMaterials("concreteUnitWeight", value)
                  }
                  tooltip="Normalweight concrete density used for footing self-weight."
                />
                <NumField
                  id="clearCover"
                  label="Clear cover"
                  unit={coverUnit}
                  value={materials.clearCover}
                  min={0}
                  onChange={(value) => updateMaterials("clearCover", value)}
                  tooltip="Clear cover to footing reinforcement."
                />
                <NumField
                  id="allowableBearing"
                  label="Allowable bearing"
                  unit={bearingUnit}
                  value={materials.allowableBearing}
                  min={0}
                  onChange={(value) =>
                    updateMaterials("allowableBearing", value)
                  }
                  tooltip="Service-level allowable soil bearing pressure for footing checks."
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
              </CardContent>
            </Card>

            <Card id="card-reinforcement">
              <CardHeader>
                <CardTitle>Reinforcement</CardTitle>
                <CardDescription>
                  Bottom mat used for flexure and minimum steel checks.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumField
                  id="barDiameterX"
                  label="X bar diameter"
                  unit={coverUnit}
                  value={reinforcement.barDiameterX}
                  min={0.1}
                  onChange={(value) =>
                    updateReinforcement("barDiameterX", value)
                  }
                  tooltip="Bars parallel to X. Used for footing projection beyond pedestal side faces in X."
                />
                <NumField
                  id="barSpacingX"
                  label="X bar spacing"
                  unit={coverUnit}
                  value={reinforcement.barSpacingX}
                  min={0.1}
                  onChange={(value) =>
                    updateReinforcement("barSpacingX", value)
                  }
                  tooltip="Center-to-center spacing of bottom bars parallel to X."
                />
                <NumField
                  id="barDiameterZ"
                  label="Z bar diameter"
                  unit={coverUnit}
                  value={reinforcement.barDiameterZ}
                  min={0.1}
                  onChange={(value) =>
                    updateReinforcement("barDiameterZ", value)
                  }
                  tooltip="Bars parallel to Z. Used for footing projection beyond pedestal side faces in Z."
                />
                <NumField
                  id="barSpacingZ"
                  label="Z bar spacing"
                  unit={coverUnit}
                  value={reinforcement.barSpacingZ}
                  min={0.1}
                  onChange={(value) =>
                    updateReinforcement("barSpacingZ", value)
                  }
                  tooltip="Center-to-center spacing of bottom bars parallel to Z."
                />
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
                      and concrete unit weight. Service/stability combinations
                      use a 1.0 dead-load factor. Strength combinations use the
                      per-row Foundation D factor.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <CardDescription>
                  Load cases applied at the top of the pedestal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:min-w-80">
                    <span className="text-muted-foreground">
                      Service combos
                    </span>
                    <span className="text-right font-medium">
                      {activeLoadCases.length}
                    </span>
                    <span className="text-muted-foreground">
                      Strength combos
                    </span>
                    <span className="text-right font-medium">
                      {activeStrengthLoadCases.length}
                    </span>
                    <span className="text-muted-foreground">
                      Max compression
                    </span>
                    <span className="text-right font-medium">
                      {fmt(maxCompression)} {forceUnit}
                    </span>
                    <span className="text-muted-foreground">
                      Max strength P
                    </span>
                    <span className="text-right font-medium">
                      {fmt(maxStrengthCompression)} {forceUnit}
                    </span>
                    <span className="text-muted-foreground">
                      Governing case
                    </span>
                    <span className="text-right font-medium">
                      {governingLoadCase}
                    </span>
                    <span className="text-muted-foreground">
                      Bearing case
                    </span>
                    <span className="text-right font-medium">
                      {governingServiceBearing?.name || "None"}
                    </span>
                  </div>
                  <Button type="button" onClick={() => setLoadTableOpen(true)}>
                    Edit load table
                  </Button>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    Footing self-weight
                  </span>
                  <span className="text-right font-medium">
                    {displayCheckValue(
                      designResults.summary.footingSelfWeight,
                      "kN",
                      units
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    Max service bearing
                  </span>
                  <span className="text-right font-medium">
                    {displayCheckValue(
                      governingServiceBearing?.maxBearing ?? null,
                      "kPa",
                      units
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    Min service bearing
                  </span>
                  <span className="text-right font-medium">
                    {displayCheckValue(
                      governingServiceBearing?.minBearing ?? null,
                      "kPa",
                      units
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    Max strength net pressure
                  </span>
                  <span className="text-right font-medium">
                    {displayCheckValue(
                      governingStrengthCase?.maxNetPressure ?? null,
                      "kPa",
                      units
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Table columns are Load case, P, Hx, Hz, Mx, Mz, and T. Values
                  are at top of pedestal. Selected code controls concrete
                  factors; load combinations must match {loadStandard}.
                </p>
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
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md border bg-slate-50 p-3 dark:bg-slate-900">
                    <div className="text-xs text-muted-foreground">
                      Effective depth X / Z
                    </div>
                    <div className="mt-1 space-y-0.5 font-medium">
                      <div>
                        X{" "}
                        {displayCheckValue(
                          designResults.summary.effectiveDepthX,
                          "mm",
                          units
                        )}
                      </div>
                      <div>
                        Z{" "}
                        {displayCheckValue(
                          designResults.summary.effectiveDepthZ,
                          "mm",
                          units
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border bg-slate-50 p-3 dark:bg-slate-900">
                    <div className="text-xs text-muted-foreground">
                      Provided As X / Z
                    </div>
                    <div className="mt-1 space-y-0.5 font-medium">
                      <div>
                        X{" "}
                        {displayCheckValue(
                          designResults.summary.providedAsX,
                          "mm2/m",
                          units,
                          0
                        )}
                      </div>
                      <div>
                        Z{" "}
                        {displayCheckValue(
                          designResults.summary.providedAsZ,
                          "mm2/m",
                          units,
                          0
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border bg-slate-50 p-3 dark:bg-slate-900">
                    <div className="text-xs text-muted-foreground">
                      Minimum As X / Z
                    </div>
                    <div className="mt-1 space-y-0.5 font-medium">
                      <div>
                        X{" "}
                        {displayCheckValue(
                          designResults.summary.minimumAsX,
                          "mm2/m",
                          units,
                          0
                        )}
                      </div>
                      <div>
                        Z{" "}
                        {displayCheckValue(
                          designResults.summary.minimumAsZ,
                          "mm2/m",
                          units,
                          0
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border bg-slate-50 p-3 dark:bg-slate-900">
                    <div className="text-xs text-muted-foreground">
                      Concrete design family
                    </div>
                    <div className="mt-1 font-medium">
                      {designResults.codeBasis.concreteFamily}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 text-xs text-muted-foreground lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="font-medium text-foreground">
                      Code basis
                    </div>
                    {designResults.codeBasis.references.map((reference) => (
                      <div key={reference}>{reference}</div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <div className="font-medium text-foreground">
                      Analysis assumptions
                    </div>
                    {designResults.codeBasis.assumptions.map((assumption) => (
                      <div key={assumption}>{assumption}</div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {designResults.checks.map((item) => (
                    <div
                      key={item.id}
                      className="relative rounded-md border bg-white p-3 dark:bg-slate-950"
                    >
                      <div className="pr-24">
                        <div className="min-w-0">
                          <div className="font-medium">{item.label}</div>
                          <div className="mt-1 text-[11px]/relaxed text-muted-foreground">
                            {item.basis}
                          </div>
                        </div>
                      </div>
                      <div className="absolute right-3 top-3">
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <div>
                          <div className="text-muted-foreground">Demand</div>
                          <div className="font-medium">
                            {displayCheckValue(item.demand, item.unit, units)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Capacity</div>
                          <div className="font-medium">
                            {displayCheckValue(item.capacity, item.unit, units)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">D/C</div>
                          <div className="font-medium">
                            {utilizationText(item)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">
                            Governing
                          </div>
                          <div className="font-medium">
                            {item.governingCase}
                          </div>
                        </div>
                      </div>
                      {item.details.length > 0 ? (
                        <div className="mt-2 space-y-0.5 text-[11px]/relaxed text-muted-foreground">
                          {item.details.map((detail) => (
                            <div key={detail}>{detail}</div>
                          ))}
                        </div>
                      ) : null}
                      {item.notes.length > 0 ? (
                        <div className="mt-2 space-y-0.5 text-[11px]/relaxed text-amber-700 dark:text-amber-300">
                          {item.notes.map((note) => (
                            <div key={note}>{note}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Service bearing by case
                    </div>
                    <Table className="border">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="border-r">Case</TableHead>
                          <TableHead className="border-r text-right">
                            qmax
                          </TableHead>
                          <TableHead className="border-r text-right">
                            qmin
                          </TableHead>
                          <TableHead className="text-right">N</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {designResults.serviceBearing.length > 0 ? (
                          designResults.serviceBearing.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="border-r">
                                {row.name}
                              </TableCell>
                              <TableCell className="border-r text-right">
                                {displayCheckValue(row.maxBearing, "kPa", units)}
                              </TableCell>
                              <TableCell className="border-r text-right">
                                {displayCheckValue(row.minBearing, "kPa", units)}
                              </TableCell>
                              <TableCell className="text-right">
                                {displayCheckValue(row.axial, "kN", units)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-muted-foreground">
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
                            qnet max
                          </TableHead>
                          <TableHead className="border-r text-right">
                            Punching vu
                          </TableHead>
                          <TableHead className="text-right">Flex X/Z</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {designResults.strengthCases.length > 0 ? (
                          designResults.strengthCases.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="border-r">
                                {row.name}
                              </TableCell>
                              <TableCell className="border-r text-right">
                                {displayCheckValue(
                                  row.maxNetPressure,
                                  "kPa",
                                  units
                                )}
                              </TableCell>
                              <TableCell className="border-r text-right">
                                {displayCheckValue(
                                  row.punchingStress,
                                  "MPa",
                                  units
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {displayCheckValue(
                                  row.flexureX,
                                  "kN-m/m",
                                  units,
                                  2
                                )}{" "}
                                /{" "}
                                {displayCheckValue(
                                  row.flexureZ,
                                  "kN-m/m",
                                  units,
                                  2
                                )}
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
                  Current model values from geometry inputs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">Model name</span>
                  <span className="font-medium">{modelName || "Untitled"}</span>
                  <span className="text-muted-foreground">Footing plan</span>
                  <span className="font-medium">
                    {fmt(geometry.footingLength)} x {fmt(geometry.footingWidth)}{" "}
                    {lengthUnit}
                  </span>
                  <span className="text-muted-foreground">
                    Footing concrete volume
                  </span>
                  <span className="font-medium">
                    {fmt(concreteVolume)} {lengthUnit}
                    <sup>3</sup>
                  </span>
                  <span className="text-muted-foreground">
                    Pedestal footprint
                  </span>
                  <span className="font-medium">
                    {fmt(geometry.pedestalLength)} x{" "}
                    {fmt(geometry.pedestalWidth)} {lengthUnit}
                  </span>
                  <span className="text-muted-foreground">
                    Pedestal offset
                  </span>
                  <span className="font-medium">
                    X {fmt(pedestalOffsetX)}, Z {fmt(pedestalOffsetZ)}{" "}
                    {lengthUnit}
                  </span>
                  <span className="text-muted-foreground">
                    Concrete strength
                  </span>
                  <span className="font-medium">
                    {fmt(materials.concreteStrength)} {strengthUnit}
                  </span>
                  <span className="text-muted-foreground">Rebar yield</span>
                  <span className="font-medium">
                    {fmt(materials.rebarYield)} {strengthUnit}
                  </span>
                  <span className="text-muted-foreground">Clear cover</span>
                  <span className="font-medium">
                    {fmt(materials.clearCover)} {coverUnit}
                  </span>
                  <span className="text-muted-foreground">
                    Allowable bearing
                  </span>
                  <span className="font-medium">
                    {fmt(materials.allowableBearing)} {bearingUnit}
                  </span>
                  <span className="text-muted-foreground">X reinforcement</span>
                  <span className="font-medium">
                    {fmt(reinforcement.barDiameterX)} {coverUnit} @{" "}
                    {fmt(reinforcement.barSpacingX)} {coverUnit}
                  </span>
                  <span className="text-muted-foreground">Z reinforcement</span>
                  <span className="font-medium">
                    {fmt(reinforcement.barDiameterZ)} {coverUnit} @{" "}
                    {fmt(reinforcement.barSpacingZ)} {coverUnit}
                  </span>
                  <span className="text-muted-foreground">
                    Load cases
                  </span>
                  <span className="font-medium">
                    {activeLoadCases.length} service /{" "}
                    {activeStrengthLoadCases.length} strength
                  </span>
                  <span className="text-muted-foreground">Max compression</span>
                  <span className="font-medium">
                    {fmt(maxCompression)} {forceUnit}
                  </span>
                  <span className="text-muted-foreground">Governing case</span>
                  <span className="font-medium">
                    {governingLoadCase}
                  </span>
                  <span className="text-muted-foreground">
                    Max service bearing
                  </span>
                  <span className="font-medium">
                    {displayCheckValue(
                      governingServiceBearing?.maxBearing ?? null,
                      "kPa",
                      units
                    )}
                  </span>
                  <span className="text-muted-foreground">Overall status</span>
                  <span className="font-medium">
                    {statusLabel(designResults.summary.overallStatus)}
                  </span>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Values feed the calculation engine shown in Design checks.
                  Service/stability and strength cases are separate by design.
                </p>
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
                <CardDescription className="text-[11px]/snug">
                  Rotatable footing slab with pedestal footprint.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FootingModel3d geometry={geometry} />
              </CardContent>
            </Card>
          </aside>
        </main>

        <footer className="mx-auto max-w-7xl px-6 py-6 text-xs text-muted-foreground">
          Isolated Footing Design · calculation engine active · verify load
          combinations against selected code.
        </footer>
      </div>
    </TooltipProvider>
  );
}
