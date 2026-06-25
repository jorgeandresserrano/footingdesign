// Compression-only biaxial soil-contact solver.
//
// Ported from the isolatedfooting app. A rigid footing on a compression-only
// (no-tension) soil reaction can lose contact over part of its base when the
// load resultant leaves the kern. This solver finds the linear pressure plane
// q = a + b*x + c*z that satisfies vertical-force and biaxial-moment
// equilibrium while the reaction is clipped to the region where q >= 0.
//
// Coordinates are the footing-centroid frame used by footingEngine: x along the
// footing length, z along the width, corners at +/-L/2, +/-B/2.

export type Point = [number, number];

export type ContactState = "full" | "partial" | "zero" | "failed";

export interface Integrals {
  A: number;
  x: number;
  z: number;
  xx: number;
  zz: number;
  xz: number;
}

export interface ContactResult {
  state: ContactState;
  area: number;
  percent: number;
  peak: number;
  corners: number[];
  polygon: Point[];
  resultantX: number;
  resultantZ: number;
  forceResidual: number;
  momentResidual: number;
  coefficients: [number, number, number];
  iterations: number;
}

// Clip a polygon by the half-plane q = a + b*x + c*z >= 0 (Sutherland-Hodgman).
export function clip(points: Point[], a: number, b: number, c: number): Point[] {
  const output: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const s = points[i];
    const e = points[(i + 1) % points.length];
    const qs = a + b * s[0] + c * s[1];
    const qe = a + b * e[0] + c * e[1];
    if (qs >= 0) output.push(s);
    if (qs >= 0 !== qe >= 0) {
      const t = qs / (qs - qe);
      output.push([s[0] + t * (e[0] - s[0]), s[1] + t * (e[1] - s[1])]);
    }
  }
  return output;
}

function triangleIntegrals(p0: Point, p1: Point, p2: Point): Integrals {
  const cross =
    (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  const A = Math.abs(cross) / 2;
  const xs = [p0[0], p1[0], p2[0]];
  const zs = [p0[1], p1[1], p2[1]];
  const sx = xs[0] + xs[1] + xs[2];
  const sz = zs[0] + zs[1] + zs[2];
  const sx2 = xs[0] ** 2 + xs[1] ** 2 + xs[2] ** 2;
  const sz2 = zs[0] ** 2 + zs[1] ** 2 + zs[2] ** 2;
  const sxz = xs[0] * zs[0] + xs[1] * zs[1] + xs[2] * zs[2];
  return {
    A,
    x: (A * sx) / 3,
    z: (A * sz) / 3,
    xx: (A * (sx * sx + sx2)) / 12,
    zz: (A * (sz * sz + sz2)) / 12,
    xz: (A * (sx * sz + sxz)) / 12,
  };
}

// Area and first/second area moments of a simple polygon (fan triangulation).
export function integrate(poly: Point[]): Integrals {
  const out: Integrals = { A: 0, x: 0, z: 0, xx: 0, zz: 0, xz: 0 };
  for (let i = 1; i < poly.length - 1; i++) {
    const t = triangleIntegrals(poly[0], poly[i], poly[i + 1]);
    for (const key of Object.keys(out) as (keyof Integrals)[]) out[key] += t[key];
  }
  return out;
}

function solve3(matrix: number[][], rhs: number[]): number[] | null {
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let j = i + 1; j < 3; j++)
      if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    [a[i], a[pivot]] = [a[pivot], a[i]];
    if (Math.abs(a[i][i]) < 1e-14) return null;
    for (let j = i + 1; j < 3; j++) {
      const f = a[j][i] / a[i][i];
      for (let k = i; k < 4; k++) a[j][k] -= f * a[i][k];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--)
    x[i] =
      (a[i][3] -
        a[i].slice(i + 1, 3).reduce((s, v, j) => s + v * x[i + 1 + j], 0)) /
      a[i][i];
  return x;
}

export function solveContact(
  P: number,
  Mx: number,
  Mz: number,
  length: number,
  width: number
): ContactResult {
  const rectangle: Point[] = [
    [-length / 2, -width / 2],
    [length / 2, -width / 2],
    [length / 2, width / 2],
    [-length / 2, width / 2],
  ];
  const zero: ContactResult = {
    state: "zero",
    area: 0,
    percent: 0,
    peak: 0,
    corners: [0, 0, 0, 0],
    polygon: [],
    resultantX: 0,
    resultantZ: 0,
    forceResidual: 0,
    momentResidual: 0,
    coefficients: [0, 0, 0],
    iterations: 0,
  };
  if (P <= 0 || length <= 0 || width <= 0) return zero;

  const A = length * width;
  let coeff: [number, number, number] = [
    P / A,
    -Mz / ((width * length ** 3) / 12),
    Mx / ((length * width ** 3) / 12),
  ];
  let iterations = 0;
  for (; iterations < 40; iterations++) {
    const poly = clip(rectangle, ...coeff);
    if (poly.length < 3) break;
    const I = integrate(poly);
    const [a, b, c] = coeff;
    const force = a * I.A + b * I.x + c * I.z;
    const rx = a * I.x + b * I.xx + c * I.xz;
    const rz = a * I.z + b * I.xz + c * I.zz;
    const residual = [P - force, -Mz - rx, Mx - rz];
    if (
      Math.max(
        Math.abs(residual[0]) / Math.max(P, 1),
        Math.abs(residual[1]) / Math.max(P * length, 1),
        Math.abs(residual[2]) / Math.max(P * width, 1)
      ) < 1e-9
    )
      break;
    const delta = solve3(
      [
        [I.A, I.x, I.z],
        [I.x, I.xx, I.xz],
        [I.z, I.xz, I.zz],
      ],
      residual
    );
    if (!delta) break;
    coeff = [a + delta[0], b + delta[1], c + delta[2]];
  }

  const polygon = clip(rectangle, ...coeff);
  if (polygon.length < 3) return { ...zero, state: "failed", iterations };
  const I = integrate(polygon);
  const [a, b, c] = coeff;
  const force = a * I.A + b * I.x + c * I.z;
  const rx = a * I.x + b * I.xx + c * I.xz;
  const rz = a * I.z + b * I.xz + c * I.zz;
  const corners = rectangle.map(([x, z]) => Math.max(0, a + b * x + c * z));
  const forceResidual = force - P;
  const momentResidual = Math.hypot(rx + Mz, rz - Mx);
  return {
    state:
      iterations >= 40 || Math.abs(forceResidual) > Math.max(P, 1) * 1e-6
        ? "failed"
        : I.A > A * (1 - 1e-8)
          ? "full"
          : "partial",
    area: I.A,
    percent: (100 * I.A) / A,
    peak: Math.max(...corners),
    corners,
    polygon,
    resultantX: force ? rx / force : 0,
    resultantZ: force ? rz / force : 0,
    forceResidual,
    momentResidual,
    coefficients: coeff,
    iterations,
  };
}

// Intersect a convex polygon with an axis-aligned rectangle by clipping against
// each of the four rect edges as a half-plane (x>=xMin, x<=xMax, z>=zMin, z<=zMax).
export function clipPolygonToRect(
  polygon: Point[],
  rect: { xMin: number; xMax: number; zMin: number; zMax: number }
): Point[] {
  let poly = polygon;
  poly = clip(poly, -rect.xMin, 1, 0); // x - xMin >= 0
  if (poly.length < 3) return [];
  poly = clip(poly, rect.xMax, -1, 0); // xMax - x >= 0
  if (poly.length < 3) return [];
  poly = clip(poly, -rect.zMin, 0, 1); // z - zMin >= 0
  if (poly.length < 3) return [];
  poly = clip(poly, rect.zMax, 0, -1); // zMax - z >= 0
  return poly.length < 3 ? [] : poly;
}

// Area and first/second area moments of a polygon — the quantities needed to
// integrate a linear pressure plane q = a + b*x + c*z over an arbitrary region:
//   force                = a*A + b*x + c*z
//   moment about x=planeX = a*(x - planeX*A) + b*(xx - planeX*x) + c*(xz - planeX*z)
//   moment about z=planeZ = a*(z - planeZ*A) + b*(xz - planeZ*x) + c*(zz - planeZ*z)
export function planeIntegrals(polygon: Point[]): Integrals {
  if (polygon.length < 3) return { A: 0, x: 0, z: 0, xx: 0, zz: 0, xz: 0 };
  return integrate(polygon);
}
