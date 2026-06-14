"use client";

import dynamic from "next/dynamic";
import { Building2, Pencil, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
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

const DEFAULT_GEOMETRY_SI: FootingGeometry = {
  footingLength: 2.4,
  footingWidth: 2.4,
  footingThickness: 0.6,
  pedestalLength: 0.6,
  pedestalWidth: 0.6,
  pedestalHeight: 0.8,
};

function roundLength(value: number) {
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

function defaultGeometry(units: UnitSystem): FootingGeometry {
  return units === "SI"
    ? DEFAULT_GEOMETRY_SI
    : convertGeometry(DEFAULT_GEOMETRY_SI, "SI", "USC");
}

function fmt(value: number, digits = 3) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

export default function Home() {
  const [modelName, setModelName] = useState("Untitled footing");
  const [units, setUnits] = useState<UnitSystem>("SI");
  const [geometry, setGeometry] = useState<FootingGeometry>(
    defaultGeometry("SI")
  );

  const lengthUnit = units === "SI" ? "m" : "ft";
  const concreteVolume = useMemo(
    () =>
      geometry.footingLength *
      geometry.footingWidth *
      geometry.footingThickness,
    [geometry]
  );
  const pedestalVolume = useMemo(
    () =>
      geometry.pedestalLength *
      geometry.pedestalWidth *
      geometry.pedestalHeight,
    [geometry]
  );

  const updateGeometry = (key: keyof FootingGeometry, value: number) => {
    setGeometry((current) => ({ ...current, [key]: value }));
  };

  const switchUnits = (nextUnits: UnitSystem) => {
    setGeometry((current) => convertGeometry(current, units, nextUnits));
    setUnits(nextUnits);
  };

  const resetInputs = () => {
    setGeometry(defaultGeometry(units));
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
                  Concrete isolated footing and pedestal design workspace.
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

        <main className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-4 px-6 py-5 xl:grid-cols-[12rem_minmax(0,1fr)_22rem]">
          <aside className="hidden xl:sticky xl:top-4 xl:block">
            <TableOfContents />
          </aside>

          <div className="space-y-4">
            <Card id="card-geometry">
              <CardHeader>
                <CardTitle>Geometry</CardTitle>
                <CardDescription>
                  Footing slab and centered concrete pedestal dimensions.
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
                  label="Pedestal length"
                  unit={lengthUnit}
                  value={geometry.pedestalLength}
                  min={0.05}
                  onChange={(value) => updateGeometry("pedestalLength", value)}
                  tooltip="Pedestal dimension parallel to footing length."
                />
                <NumField
                  id="pedestalWidth"
                  label="Pedestal width"
                  unit={lengthUnit}
                  value={geometry.pedestalWidth}
                  min={0.05}
                  onChange={(value) => updateGeometry("pedestalWidth", value)}
                  tooltip="Pedestal dimension parallel to footing width."
                />
                <NumField
                  id="pedestalHeight"
                  label="Pedestal height"
                  unit={lengthUnit}
                  value={geometry.pedestalHeight}
                  min={0.05}
                  onChange={(value) => updateGeometry("pedestalHeight", value)}
                  tooltip="Pedestal height above the footing top surface."
                />
              </CardContent>
            </Card>

            <Card id="card-materials">
              <CardHeader>
                <CardTitle>Materials</CardTitle>
                <CardDescription>
                  Concrete, reinforcing steel, and soil properties will be added
                  with the design checks.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Placeholder for material strengths, cover, unit weights, and
                  bearing assumptions.
                </p>
              </CardContent>
            </Card>

            <Card id="card-loads">
              <CardHeader>
                <CardTitle>Loads</CardTitle>
                <CardDescription>
                  Pedestal reactions and load combinations will be added after
                  UI framing.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Placeholder for axial load, moments, shears, and service/load
                  combination controls.
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
                  flexure, reinforcement, and pedestal interface.
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
                    Pedestal concrete volume
                  </span>
                  <span className="font-medium">
                    {fmt(pedestalVolume)} {lengthUnit}
                    <sup>3</sup>
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
                  Rotatable footing slab with centered concrete pedestal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FootingModel3d geometry={geometry} unit={lengthUnit} />
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
