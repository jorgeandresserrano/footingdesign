export type DisplayPrecisionKey =
  | "m"
  | "m²"
  | "m³"
  | "mm"
  | "mm²"
  | "mm²/m"
  | "kPa"
  | "kN"
  | "kN/m"
  | "kN·m"
  | "kN·m/m"
  | "MPa"
  | "kN/m³"
  | "(kN/m)/m²";

export type DisplayPrecisionSpec = Record<DisplayPrecisionKey, number>;

export const DISPLAY_PRECISION_ROWS: Array<{
  key: DisplayPrecisionKey;
  label: string;
  uscUnit: string;
}> = [
  { key: "m", label: "Length", uscUnit: "ft" },
  { key: "m²", label: "Area", uscUnit: "ft²" },
  { key: "m³", label: "Volume", uscUnit: "ft³" },
  { key: "mm", label: "Cover / depth", uscUnit: "in" },
  { key: "mm²", label: "Steel area", uscUnit: "in²" },
  { key: "mm²/m", label: "Steel per width", uscUnit: "in²/ft" },
  { key: "kPa", label: "Pressure", uscUnit: "ksf" },
  { key: "kN", label: "Force", uscUnit: "kip" },
  { key: "kN/m", label: "Line force", uscUnit: "kip/ft" },
  { key: "kN·m", label: "Moment", uscUnit: "kip·ft" },
  { key: "kN·m/m", label: "Moment per width", uscUnit: "kip·ft/ft" },
  { key: "MPa", label: "Stress", uscUnit: "ksi" },
  { key: "kN/m³", label: "Unit weight", uscUnit: "pcf" },
  { key: "(kN/m)/m²", label: "Subgrade reaction", uscUnit: "pci" },
];

export const DEFAULT_DISPLAY_PRECISION: DisplayPrecisionSpec = {
  m: 3,
  "m²": 3,
  "m³": 3,
  mm: 0,
  "mm²": 0,
  "mm²/m": 0,
  kPa: 0,
  kN: 0,
  "kN/m": 0,
  "kN·m": 0,
  "kN·m/m": 0,
  MPa: 3,
  "kN/m³": 3,
  "(kN/m)/m²": 3,
};

// USC values typically read with one decimal where SI uses whole/three, so the
// keys (shared across both unit systems) carry a different default set.
export const USC_DISPLAY_PRECISION: DisplayPrecisionSpec = {
  m: 1,
  "m²": 1,
  "m³": 1,
  mm: 0,
  "mm²": 0,
  "mm²/m": 1,
  kPa: 1,
  kN: 1,
  "kN/m": 1,
  "kN·m": 1,
  "kN·m/m": 1,
  MPa: 1,
  "kN/m³": 1,
  "(kN/m)/m²": 0,
};

export function defaultDisplayPrecision(
  units: "SI" | "USC"
): DisplayPrecisionSpec {
  return units === "USC" ? USC_DISPLAY_PRECISION : DEFAULT_DISPLAY_PRECISION;
}

export function normalizeDisplayUnit(unit?: string): DisplayPrecisionKey | null {
  if (!unit) return null;
  const normalized = unit
    .trim()
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³")
    .replace(/mm2/g, "mm²")
    .replace(/in2/g, "in²")
    .replace(/m2/g, "m²")
    .replace(/m3/g, "m³")
    .replace(/\*/g, "·")
    .replace(/-/g, "·")
    .replace(/\s+/g, " ");

  if (normalized === "m" || normalized === "ft") return "m";
  if (normalized === "m²" || normalized === "ft²") return "m²";
  if (normalized === "m³" || normalized === "ft³") return "m³";
  if (normalized === "mm" || normalized === "in") return "mm";
  if (normalized === "mm²" || normalized === "in²") return "mm²";
  if (normalized === "mm²/m" || normalized === "in²/ft") return "mm²/m";
  if (normalized === "kPa" || normalized === "ksf") return "kPa";
  if (normalized === "kN" || normalized === "kip") return "kN";
  if (normalized === "kN/m" || normalized === "kip/ft") return "kN/m";
  if (
    normalized === "kN·m" ||
    normalized === "kN m" ||
    normalized === "kNm" ||
    normalized === "kip·ft" ||
    normalized === "kip ft"
  ) {
    return "kN·m";
  }
  if (
    normalized === "kN·m/m" ||
    normalized === "kN m/m" ||
    normalized === "kNm/m" ||
    normalized === "kip·ft/ft" ||
    normalized === "kip ft/ft"
  ) {
    return "kN·m/m";
  }
  if (normalized === "MPa" || normalized === "ksi") return "MPa";
  if (normalized === "kN/m³" || normalized === "pcf") return "kN/m³";
  if (normalized === "(kN/m)/m²" || normalized === "pci") {
    return "(kN/m)/m²";
  }
  return null;
}

export function displayDigitsForUnit(
  unit?: string,
  precision: DisplayPrecisionSpec = DEFAULT_DISPLAY_PRECISION
) {
  const key = normalizeDisplayUnit(unit);
  return key ? precision[key] : 3;
}

export function clampDisplayDigits(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), 6);
}
