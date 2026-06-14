"use client";

import dynamic from "next/dynamic";
import { Building2, Copy, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ClipboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { NumField } from "@/components/footing/NumField";
import { TableOfContents } from "@/components/footing/TableOfContents";
import type { FootingGeometry } from "@/components/footing/FootingModel3d";

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

const M_TO_FT = 3.28084;
const MPA_TO_KSI = 0.1450377377;
const KN_M3_TO_PCF = 6.365880986;
const MM_TO_IN = 0.0393700787;
const KPA_TO_KSF = 0.0208854342;
const KN_TO_KIP = 0.2248089431;
const KN_M_TO_KIP_FT = 0.7375621493;

interface MaterialInputs {
  concreteStrength: number;
  rebarYield: number;
  concreteUnitWeight: number;
  clearCover: number;
  allowableBearing: number;
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
}

type LoadCaseColumn = "name" | "P" | "Hx" | "Hz" | "Mx" | "Mz" | "T";
type CellPosition = { row: number; column: number };
type SelectionRange = { start: CellPosition; end: CellPosition };

const DEFAULT_GEOMETRY_SI: FootingGeometry = {
  footingLength: 2.4,
  footingWidth: 2.4,
  footingThickness: 0.6,
  pedestalLength: 0.6,
  pedestalWidth: 0.6,
  pedestalHeight: 0.8,
};

const DEFAULT_MATERIALS_SI: MaterialInputs = {
  concreteStrength: 30,
  rebarYield: 420,
  concreteUnitWeight: 24,
  clearCover: 75,
  allowableBearing: 200,
};

const LOAD_CASE_COLUMNS: Array<{
  key: LoadCaseColumn;
  label: string;
  unitType: "text" | "force" | "moment";
}> = [
  { key: "name", label: "Load case", unitType: "text" },
  { key: "P", label: "P", unitType: "force" },
  { key: "Hx", label: "Hx", unitType: "force" },
  { key: "Hz", label: "Hz", unitType: "force" },
  { key: "Mx", label: "Mx", unitType: "moment" },
  { key: "Mz", label: "Mz", unitType: "moment" },
  { key: "T", label: "T", unitType: "moment" },
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
  },
];

function blankLoadCase(id: string): LoadCase {
  return {
    id,
    name: "",
    P: 0,
    Hx: 0,
    Hz: 0,
    Mx: 0,
    Mz: 0,
    T: 0,
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
  return [...next, blankLoadCase(`load-blank-${Date.now()}`)];
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

function defaultLoadCases(units: UnitSystem): LoadCase[] {
  return units === "SI"
    ? ensureTrailingBlank(DEFAULT_LOAD_CASES_SI)
    : convertLoadCases(DEFAULT_LOAD_CASES_SI, "SI", "USC");
}

function fmt(value: number, digits = 3) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function parseNumericCell(value: string) {
  const parsed = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function serializeLoadCases(loadCases: LoadCase[]) {
  const header = LOAD_CASE_COLUMNS.map((column) => column.label).join("\t");
  const rows = loadCases.filter((loadCase) => !isEmptyLoadCase(loadCase)).map((loadCase) =>
    LOAD_CASE_COLUMNS.map((column) =>
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

function serializeSelectedCells(loadCases: LoadCase[], range: SelectionRange) {
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
      const column = LOAD_CASE_COLUMNS[columnIndex];
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
  const [loadTableOpen, setLoadTableOpen] = useState(false);
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
  const [loadCases, setLoadCases] = useState<LoadCase[]>(
    defaultLoadCases("SI")
  );

  const lengthUnit = units === "SI" ? "m" : "ft";
  const strengthUnit = units === "SI" ? "MPa" : "ksi";
  const unitWeightUnit = units === "SI" ? "kN/m³" : "pcf";
  const coverUnit = units === "SI" ? "mm" : "in";
  const bearingUnit = units === "SI" ? "kPa" : "ksf";
  const forceUnit = units === "SI" ? "kN" : "kip";
  const momentUnit = units === "SI" ? "kN·m" : "kip·ft";
  const concreteVolume = useMemo(
    () =>
      geometry.footingLength *
      geometry.footingWidth *
      geometry.footingThickness,
    [geometry]
  );
  const activeLoadCases = useMemo(
    () => loadCases.filter((loadCase) => !isEmptyLoadCase(loadCase)),
    [loadCases]
  );
  const maxCompression = Math.max(
    0,
    ...activeLoadCases.map((loadCase) => loadCase.P)
  );
  const maxDirectBearing =
    maxCompression /
    Math.max(geometry.footingLength * geometry.footingWidth, 1e-6);
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
    setGeometry((current) => ({ ...current, [key]: value }));
  };

  const updateMaterials = (key: keyof MaterialInputs, value: number) => {
    setMaterials((current) => ({ ...current, [key]: value }));
  };

  const updateLoadCase = (
    rowIndex: number,
    key: LoadCaseColumn,
    value: string
  ) => {
    setLoadCases((current) =>
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
    setLoadCases((current) =>
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

    setLoadCases((current) => {
      const next = [...current];
      dataRows.forEach((cells, rowOffset) => {
        const targetRow = startRow + rowOffset;
        while (targetRow >= next.length) {
          next.push(blankLoadCase(`load-${Date.now()}-${next.length}`));
        }

        const updated = { ...next[targetRow] };
        cells.forEach((cell, cellOffset) => {
          const column = LOAD_CASE_COLUMNS[startColumn + cellOffset];
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
      ? serializeSelectedCells(loadCases, selectedCells)
      : serializeLoadCases(loadCases);
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
      serializeSelectedCells(loadCases, selectedCells)
    );
  };

  const switchUnits = (nextUnits: UnitSystem) => {
    setGeometry((current) => convertGeometry(current, units, nextUnits));
    setMaterials((current) => convertMaterials(current, units, nextUnits));
    setLoadCases((current) => convertLoadCases(current, units, nextUnits));
    setUnits(nextUnits);
  };

  const resetInputs = () => {
    setGeometry(defaultGeometry(units));
    setMaterials(defaultMaterials(units));
    setLoadCases(defaultLoadCases(units));
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
                <Table className="min-w-[760px] border">
                  <TableHeader>
                    <TableRow>
                      {LOAD_CASE_COLUMNS.map((column) => (
                        <TableHead key={column.key} className="border-r">
                          <div className="space-y-0.5">
                            <div>{column.label}</div>
                            {column.unitType !== "text" ? (
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
                        {LOAD_CASE_COLUMNS.map((column, columnIndex) => {
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
                                  column.key === "name" ? "text" : "decimal"
                                }
                                onChange={(event) =>
                                  updateLoadCase(
                                    rowIndex,
                                    column.key,
                                    event.target.value
                                  )
                                }
                                onPaste={(event) =>
                                  pasteLoadCases(event, rowIndex, columnIndex)
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
                  Footing slab and centered pedestal footprint dimensions.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                  tooltip="Plan dimension of footing in model Y direction."
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
                  tooltip="Visual height only. Pedestal design is outside this footing-only scope."
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
              </CardContent>
            </Card>

            <Card id="card-loads">
              <CardHeader>
                <CardTitle>Loads</CardTitle>
                <CardDescription>
                  Load cases applied at the top of the pedestal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:min-w-80">
                    <span className="text-muted-foreground">Load cases</span>
                    <span className="text-right font-medium">
                      {activeLoadCases.length}
                    </span>
                    <span className="text-muted-foreground">
                      Max compression
                    </span>
                    <span className="text-right font-medium">
                      {fmt(maxCompression)} {forceUnit}
                    </span>
                    <span className="text-muted-foreground">
                      Governing case
                    </span>
                    <span className="text-right font-medium">
                      {governingLoadCase}
                    </span>
                  </div>
                  <Button type="button" onClick={() => setLoadTableOpen(true)}>
                    Edit load table
                  </Button>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    Direct bearing from max P
                  </span>
                  <span className="text-right font-medium">
                    {fmt(maxDirectBearing)} {bearingUnit}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Table columns are Load case, P, Hx, Hz, Mx, Mz, and T. Values
                  are at top of pedestal and can be pasted from Excel.
                </p>
              </CardContent>
            </Card>

            <Card id="card-design-checks" className="bg-[#d8f3e5]">
              <CardHeader>
                <CardTitle>Design checks</CardTitle>
                <CardDescription>
                  Code checks are intentionally not implemented in this first UI
                  pass.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Future checks: bearing pressure, one-way shear, punching shear,
                  flexure, and footing reinforcement.
                </p>
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
                  <span className="text-muted-foreground">
                    Load cases
                  </span>
                  <span className="font-medium">
                    {activeLoadCases.length}
                  </span>
                  <span className="text-muted-foreground">Max compression</span>
                  <span className="font-medium">
                    {fmt(maxCompression)} {forceUnit}
                  </span>
                  <span className="text-muted-foreground">Governing case</span>
                  <span className="font-medium">
                    {governingLoadCase}
                  </span>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Values are geometric only. Structural design checks are not
                  active yet.
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
                  Rotatable footing slab with centered pedestal footprint.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FootingModel3d geometry={geometry} />
              </CardContent>
            </Card>
          </aside>
        </main>

        <footer className="mx-auto max-w-7xl px-6 py-6 text-xs text-muted-foreground">
          Isolated Footing Design · UI preview only · Design checks to follow.
        </footer>
      </div>
    </TooltipProvider>
  );
}
