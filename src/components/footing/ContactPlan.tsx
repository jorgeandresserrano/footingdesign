"use client";

import type { BearingCaseResult } from "@/lib/footingEngine";
import type { FootingGeometry } from "@/components/footing/FootingModel3d";

interface Props {
  geometry: FootingGeometry;
  bearingCase: BearingCaseResult | null;
  formatPressure: (kPa: number) => string;
}

const PAD = 26;
const DRAW = 210;

// Soil-contact pressure plan for a single service load case. Shows the footing
// in plan with the compression-only contact patch shaded by a true linear
// pressure gradient, the lifted region hatched, and the load resultant marked.
export function ContactPlan({ geometry, bearingCase, formatPressure }: Props) {
  const L = Math.max(geometry.footingLength, 1e-6);
  const B = Math.max(geometry.footingWidth, 1e-6);
  const scale = DRAW / Math.max(L, B);
  const w = L * scale;
  const h = B * scale;
  const vbW = w + PAD * 2;
  const vbH = h + PAD * 2;
  const sx = (x: number) => PAD + (x + L / 2) * scale;
  const sy = (z: number) => PAD + (z + B / 2) * scale;

  if (!bearingCase) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Add a service load case to view its soil-contact plan.
      </p>
    );
  }

  const { contactState, contactPercent, contactPolygon, cornerPressures, qx, qz } =
    bearingCase;

  // Footing corners and their plane ordinate (qx*x + qz*z) to orient the gradient.
  const corners: [number, number][] = [
    [-L / 2, -B / 2],
    [L / 2, -B / 2],
    [L / 2, B / 2],
    [-L / 2, B / 2],
  ];
  const ordinate = corners.map(([x, z]) => qx * x + qz * z);
  let lo = 0;
  let hi = 0;
  ordinate.forEach((v, i) => {
    if (v < ordinate[lo]) lo = i;
    if (v > ordinate[hi]) hi = i;
  });
  const uniform = Math.abs(ordinate[hi] - ordinate[lo]) < 1e-9;

  const polygonPoints = contactPolygon
    .map(([x, z]) => `${sx(x).toFixed(2)},${sy(z).toFixed(2)}`)
    .join(" ");
  const hasContact = contactPolygon.length >= 3;
  const peak = Math.max(...cornerPressures, 0);
  const minP = Math.min(...cornerPressures);

  const gradId = `contact-grad-${bearingCase.id}`;
  const hatchId = `lift-hatch-${bearingCase.id}`;

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${vbW.toFixed(1)} ${vbH.toFixed(1)}`}
        className="w-full"
        role="img"
        aria-label={`Soil-contact pressure plan for ${bearingCase.name}`}
      >
        <defs>
          <linearGradient
            id={gradId}
            gradientUnits="userSpaceOnUse"
            x1={sx(corners[lo][0])}
            y1={sy(corners[lo][1])}
            x2={sx(corners[hi][0])}
            y2={sy(corners[hi][1])}
          >
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <pattern
            id={hatchId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="#f1f5f9" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#cbd5e1" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Footing extent: lifted/no-contact base shown hatched. */}
        <rect
          x={sx(-L / 2)}
          y={sy(-B / 2)}
          width={w}
          height={h}
          fill={`url(#${hatchId})`}
          stroke="#0f172a"
          strokeWidth="1.5"
        />

        {/* Contact patch shaded by linear pressure. */}
        {hasContact ? (
          <polygon
            points={polygonPoints}
            fill={uniform ? "#3b82f6" : `url(#${gradId})`}
            fillOpacity={0.9}
            stroke="#1e3a8a"
            strokeWidth="1"
          />
        ) : null}

        {/* Pedestal footprint. */}
        <rect
          x={sx(geometry.pedestalOffsetX - geometry.pedestalLength / 2)}
          y={sy(geometry.pedestalOffsetZ - geometry.pedestalWidth / 2)}
          width={geometry.pedestalLength * scale}
          height={geometry.pedestalWidth * scale}
          fill="none"
          stroke="#0f172a"
          strokeWidth="1"
          strokeDasharray="4 3"
        />

        {/* Load resultant location (eccentricity from footing center). */}
        {bearingCase.eccentricityX !== null && bearingCase.eccentricityZ !== null ? (
          <g>
            <circle
              cx={sx(bearingCase.eccentricityX)}
              cy={sy(bearingCase.eccentricityZ)}
              r="3.2"
              fill="#b91c1c"
              stroke="#fff"
              strokeWidth="1"
            />
          </g>
        ) : null}

        {/* Peak-pressure corner marker. */}
        {hasContact && !uniform ? (
          <circle
            cx={sx(corners[hi][0])}
            cy={sy(corners[hi][1])}
            r="2.5"
            fill="#1d4ed8"
            stroke="#fff"
            strokeWidth="1"
          />
        ) : null}
      </svg>

      <div className="space-y-1 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="font-medium text-foreground">{bearingCase.name}</span>
          <span className="capitalize">contact: {contactState}</span>
          <span>{contactPercent.toFixed(1)}% of base</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span>
            q<sub>max</sub> {formatPressure(peak)}
          </span>
          <span>
            q<sub>min</sub> {formatPressure(Math.max(minP, 0))}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-[#b91c1c]" />
            resultant
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-[#3b82f6]" />
            contact
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm border border-[#cbd5e1] bg-[#f1f5f9]" />
            lifted
          </span>
        </div>
      </div>
    </div>
  );
}
