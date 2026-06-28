import {
  clipPolygonToRect,
  planeIntegrals,
  solveContact,
  type ContactState,
  type Point,
} from "./contact";

export type BuildingCode =
  | "IBC-2018"
  | "IBC-2024"
  | "NBCC-2015"
  | "NBCC-2020"
  | "NBCC-2025";

export type LoadStandard = "ASCE 7-16" | "ASCE 7-22" | "none";

export type ConcreteStandard =
  | "ACI 318-14"
  | "ACI 318-19"
  | "CSA A23.3-14"
  | "CSA A23.3-19"
  | "CSA A23.3-24";

export type SoilTreatmentMode = "ignored" | "service" | "full";

export interface EngineGeometry {
  footingLength: number;
  footingWidth: number;
  footingThickness: number;
  soilCoverDepth: number;
  frostDepth: number;
  groundwaterDepth: number;
  pedestalLength: number;
  pedestalWidth: number;
  pedestalHeight: number;
  pedestalOffsetX: number;
  pedestalOffsetZ: number;
}

export interface EngineMaterials {
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
  // Minimum acceptable soil-contact area as a percent of the footing base
  // (0 = allow any partial contact as a warning; 100 = require full contact /
  // resultant in the kern). Partial contact below this fails the contact check.
  minimumContactRatio: number;
}

export interface ReinforcementInputs {
  barDiameterX: number;
  barSpacingX: number;
  barDiameterZ: number;
  barSpacingZ: number;
}

export interface EngineLoadCase {
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

export type CheckStatus = "pass" | "fail" | "warning" | "not-applicable";

export type CheckUnit =
  | "kPa"
  | "kN"
  | "kN-m"
  | "kN/m"
  | "kN-m/m"
  | "MPa"
  | "mm"
  | "mm2/m"
  | "rad"
  | "ratio"
  | "none";

export interface DesignCheck {
  id: string;
  label: string;
  status: CheckStatus;
  demand: number | null;
  capacity: number | null;
  unit: CheckUnit;
  utilization: number | null;
  governingCase: string;
  basis: string;
  details: string[];
  notes: string[];
  /** Present only on the soil-contact check; drives its custom metric row. */
  contact?: {
    state: ContactState;
    percent: number;
    minRequired: number;
  };
}

// The subset of a load-case result needed to draw the soil-contact plan. Both
// BearingCaseResult (service) and StructuralCaseResult (strength) satisfy it, so
// the plan can render either. Pressures and the plane are the gross soil
// reaction (what bears on and lifts off the soil), in SI units.
export interface ContactPlanCase {
  id: string;
  name: string;
  qx: number;
  qz: number;
  eccentricityX: number | null;
  eccentricityZ: number | null;
  contactState: ContactState;
  contactPercent: number;
  contactPolygon: [number, number][];
  cornerPressures: number[];
}

export interface BearingCaseResult {
  id: string;
  name: string;
  maxBearing: number;
  minBearing: number;
  axial: number;
  mx: number;
  mz: number;
  qx: number;
  qz: number;
  settlement: number;
  rotationX: number;
  rotationZ: number;
  eccentricityX: number | null;
  eccentricityZ: number | null;
  resultantWithinKern: boolean;
  contactState: ContactState;
  contactPercent: number;
  contactArea: number;
  contactPolygon: [number, number][];
  // Soil pressure at the four footing corners, clamped to >= 0 for compression
  // only, ordered [-x-z, +x-z, +x+z, -x+z]. Used to render the pressure plan.
  cornerPressures: number[];
  forceResidual: number;
  momentResidual: number;
  iterations: number;
}

export interface StructuralCaseResult {
  id: string;
  name: string;
  maxNetPressure: number;
  minNetPressure: number;
  maxGrossBearing: number;
  minGrossBearing: number;
  oneWayShearX: number;
  oneWayShearZ: number;
  flexureX: number;
  flexureZ: number;
  punchingStress: number;
  punchingCapacity: number;
  contactState: ContactState;
  contactPercent: number;
  // Gross soil-contact-plan data (mirrors BearingCaseResult) so the plan can
  // draw strength cases too. Based on the factored gross soil reaction.
  qx: number;
  qz: number;
  eccentricityX: number | null;
  eccentricityZ: number | null;
  contactPolygon: [number, number][];
  cornerPressures: number[];
  forceResidual: number;
  momentResidual: number;
  iterations: number;
}

export interface FootingDesignResult {
  codeBasis: {
    buildingCode: BuildingCode;
    loadStandard: LoadStandard;
    concreteStandard: ConcreteStandard;
    concreteFamily: "ACI" | "CSA";
    references: string[];
    assumptions: string[];
  };
  summary: {
    overallStatus: CheckStatus;
    footingSelfWeight: number;
    soilOverburdenWeight: number;
    appliedServiceFoundationWeight: number;
    effectiveDepthX: number;
    effectiveDepthZ: number;
    averageShearDepth: number;
    providedAsX: number;
    providedAsZ: number;
    minimumAsX: number;
    minimumAsZ: number;
    maxServiceCompression: number;
    maxStrengthCompression: number;
  };
  rigidity: {
    status: "rigid" | "flexible" | "unknown";
    ratioX: number | null;
    ratioZ: number | null;
    elasticLength: number | null;
    governingProjection: number | null;
    basis: string;
    details: string[];
  };
  checks: DesignCheck[];
  serviceBearing: BearingCaseResult[];
  strengthCases: StructuralCaseResult[];
}

interface Rect {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

interface ContactDiagnostics {
  state: ContactState;
  percent: number;
  area: number;
  peak: number;
  forceResidual: number;
  momentResidual: number;
  iterations: number;
}

interface PressureField {
  axial: number;
  mx: number;
  mz: number;
  q0: number;
  qx: number;
  qz: number;
  max: number;
  min: number;
  // Region over which the soil reaction acts. For full contact this is the
  // whole footing rectangle; under partial contact it is the compression-only
  // contact polygon and q0/qx/qz are the re-solved plane coefficients.
  polygon: Point[];
  contact: ContactDiagnostics;
}

interface SoilOverburden {
  weight: number;
  pressure: number;
  centroidX: number;
  centroidZ: number;
  rects: Rect[];
}

interface StructuralPressureField extends PressureField {
  grossAxial: number;
  grossMx: number;
  grossMz: number;
  grossMax: number;
  grossMin: number;
  concretePressure: number;
  soilPressure: number;
  soilRects: Rect[];
  foundationDeadLoadFactor: number;
}

interface CodeParameters {
  family: "ACI" | "CSA";
  phiFlexure: number;
  phiShear: number;
  phiConcrete: number;
  phiSteel: number;
  flexureBasis: string;
  oneWayShearBasis: string;
  punchingBasis: string;
  minSteelBasis: string;
  minDepthBasis: string;
}

const EPS = 1e-9;
const DEFAULT_SERVICE_SLIDING_SAFETY_FACTOR = 1.5;
const DEFAULT_SERVICE_OVERTURNING_SAFETY_FACTOR = 1.5;
const CONCRETE_SHEAR_STRENGTH_LIMIT_ACI = 8.3;
const CONCRETE_SHEAR_STRENGTH_LIMIT_CSA = 8;

function isAci(standard: ConcreteStandard) {
  return standard.startsWith("ACI");
}

function codeParameters(standard: ConcreteStandard): CodeParameters {
  if (isAci(standard)) {
    return {
      family: "ACI",
      phiFlexure: 0.9,
      phiShear: 0.75,
      phiConcrete: 1,
      phiSteel: 1,
      flexureBasis:
        `${standard}: tension-controlled flexure with phi = 0.90.`,
      oneWayShearBasis:
        `${standard} 22.5.5.1: phi Vc = 0.75 x 0.17 lambda sqrt(fc') bw d.`,
      punchingBasis:
        `${standard} 22.6.5.2: phi vc = 0.75 x least concrete two-way shear stress.`,
      minSteelBasis:
        `${standard} Table 8.6.1.1: minimum two-way slab reinforcement.`,
      minDepthBasis:
        `${standard} 13.3.1.2: bottom reinforcement effective depth at least 150 mm.`,
    };
  }

  return {
    family: "CSA",
    phiFlexure: 1,
    phiShear: 1,
    phiConcrete: 0.65,
    phiSteel: 0.85,
    flexureBasis:
      `${standard}: factored flexure using phi_c = 0.65 and phi_s = 0.85.`,
    oneWayShearBasis:
      `${standard} Clause 11/15: simplified concrete one-way shear without shear reinforcement.`,
    punchingBasis:
      `${standard} 13.3 and 15.5: two-way shear stress with CSA size effect.`,
    minSteelBasis:
      `${standard} 7.8: minimum slab/footing reinforcement = 0.002Ag each direction.`,
    minDepthBasis:
      `${standard} 15.7: depth above bottom reinforcement at least 150 mm.`,
  };
}

function codeReferences(
  buildingCode: BuildingCode,
  loadStandard: LoadStandard,
  concreteStandard: ConcreteStandard
) {
  if (buildingCode.startsWith("IBC")) {
    return [
      `${buildingCode} Chapter 16 / Section 1605 for load combinations.`,
      `${buildingCode} Chapter 19 / Section 1901 for ACI 318 concrete design.`,
      `${loadStandard} combinations are expected in the service and strength load tables.`,
      `${concreteStandard} controls footing flexure, shear, and minimum reinforcement checks.`,
      "ACI 336.2R guides the adapted isolated-footing rigidity advisory.",
    ];
  }

  return [
    `${buildingCode} Part 4 for structural loads and limit states.`,
    `${concreteStandard} controls footing flexure, shear, and minimum reinforcement checks.`,
    "NBCC load combinations are expected in the service and strength load tables.",
    "ACI 336.2R guides the adapted isolated-footing rigidity advisory.",
  ];
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value: number, fallback = EPS) {
  return Math.max(finite(value, fallback), fallback);
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function loadCaseName(loadCase: EngineLoadCase) {
  return loadCase.name.trim() || "Unnamed";
}

function footingWeight(
  geometry: EngineGeometry,
  materials: EngineMaterials
) {
  const area = positive(geometry.footingLength) * positive(geometry.footingWidth);
  const yTop = Math.max(finite(geometry.soilCoverDepth), 0);
  const yBottom = yTop + positive(geometry.footingThickness);
  const adjusted = waterAdjustedWeight(
    Math.max(materials.concreteUnitWeight, 0),
    Math.max(materials.concreteUnitWeight, 0),
    Math.max(materials.waterUnitWeight, 0),
    area,
    yTop,
    yBottom,
    Math.max(finite(geometry.groundwaterDepth, Number.POSITIVE_INFINITY), 0)
  );
  return (
    adjusted.weight
  );
}

function waterAdjustedWeight(
  dryUnitWeight: number,
  saturatedUnitWeight: number,
  waterUnitWeight: number,
  area: number,
  yTop: number,
  yBottom: number,
  groundwaterDepth: number
) {
  const height = Math.max(yBottom - yTop, 0);
  const dryHeight = Math.max(0, Math.min(yBottom, groundwaterDepth) - yTop);
  const wetHeight = Math.max(0, height - dryHeight);
  const buoyantUnitWeight = Math.max(saturatedUnitWeight - waterUnitWeight, 0);

  return {
    dryHeight,
    wetHeight,
    weight: area * (dryHeight * dryUnitWeight + wetHeight * buoyantUnitWeight),
    pressure: dryHeight * dryUnitWeight + wetHeight * buoyantUnitWeight,
  };
}

function clippedPedestalRect(geometry: EngineGeometry) {
  const { footing, pedestal } = footingRects(geometry);
  return normalizeRect({
    xMin: Math.max(footing.xMin, pedestal.xMin),
    xMax: Math.min(footing.xMax, pedestal.xMax),
    zMin: Math.max(footing.zMin, pedestal.zMin),
    zMax: Math.min(footing.zMax, pedestal.zMax),
  });
}

function soilOverburdenRects(geometry: EngineGeometry) {
  const { footing } = footingRects(geometry);
  const pedestal = clippedPedestalRect(geometry);
  if (!pedestal) return [footing];

  return [
    { xMin: footing.xMin, xMax: pedestal.xMin, zMin: footing.zMin, zMax: footing.zMax },
    { xMin: pedestal.xMax, xMax: footing.xMax, zMin: footing.zMin, zMax: footing.zMax },
    { xMin: pedestal.xMin, xMax: pedestal.xMax, zMin: footing.zMin, zMax: pedestal.zMin },
    { xMin: pedestal.xMin, xMax: pedestal.xMax, zMin: pedestal.zMax, zMax: footing.zMax },
  ]
    .map(normalizeRect)
    .filter((rect): rect is Rect => Boolean(rect));
}

function soilOverburden(
  geometry: EngineGeometry,
  materials: EngineMaterials
): SoilOverburden {
  const rects = soilOverburdenRects(geometry);
  const soilCoverDepth = Math.max(finite(geometry.soilCoverDepth), 0);
  const soilUnitWeight = Math.max(finite(materials.soilUnitWeight), 0);
  const saturatedSoilUnitWeight = Math.max(finite(materials.saturatedSoilUnitWeight), 0);
  const waterUnitWeight = Math.max(finite(materials.waterUnitWeight), 0);
  const groundwaterDepth = Math.max(
    finite(geometry.groundwaterDepth, Number.POSITIVE_INFINITY),
    0
  );
  let area = 0;
  let firstMomentX = 0;
  let firstMomentZ = 0;

  rects.forEach((rect) => {
    const integrals = rectIntegrals(rect);
    if (!integrals) return;
    area += integrals.area;
    firstMomentX += integrals.ix1;
    firstMomentZ += integrals.iz1;
  });

  const adjusted = waterAdjustedWeight(
    soilUnitWeight,
    saturatedSoilUnitWeight,
    waterUnitWeight,
    area,
    0,
    soilCoverDepth,
    groundwaterDepth
  );

  return {
    weight: adjusted.weight,
    pressure: adjusted.pressure,
    centroidX: area > EPS ? firstMomentX / area : 0,
    centroidZ: area > EPS ? firstMomentZ / area : 0,
    rects,
  };
}

export function addSoilWeightMoments(
  moments: Pick<PressureField, "mx" | "mz">,
  soil: Pick<SoilOverburden, "weight" | "centroidX" | "centroidZ">,
  factor = 1
) {
  const factoredSoilWeight = factor * soil.weight;
  return {
    mx: moments.mx + factoredSoilWeight * soil.centroidZ,
    mz: moments.mz + factoredSoilWeight * soil.centroidX,
  };
}

function soilTreatmentLabel(mode: SoilTreatmentMode) {
  if (mode === "ignored") return "Ignored";
  if (mode === "full") return "Full including strength";
  return "Service/stability";
}

function soilTreatmentFactors(mode: SoilTreatmentMode) {
  return {
    service: mode === "ignored" ? 0 : 1,
    strength: mode === "full" ? 1 : 0,
  };
}

export function loadMomentsAtFootingCenter(
  loadCase: EngineLoadCase,
  geometry: EngineGeometry
) {
  const pedestalHeight = finite(geometry.pedestalHeight);
  const pedestalOffsetX = finite(geometry.pedestalOffsetX);
  const pedestalOffsetZ = finite(geometry.pedestalOffsetZ);

  return {
    mx: loadCase.Mx + loadCase.Hz * pedestalHeight + loadCase.P * pedestalOffsetZ,
    mz: loadCase.Mz + loadCase.Hx * pedestalHeight + loadCase.P * pedestalOffsetX,
  };
}

function pressureField(
  axial: number,
  mx: number,
  mz: number,
  geometry: EngineGeometry
): PressureField {
  const length = positive(geometry.footingLength);
  const width = positive(geometry.footingWidth);
  const area = length * width;
  const ix = (length * width ** 3) / 12;
  const iz = (width * length ** 3) / 12;
  const q0 = axial / area;
  const qx = mz / Math.max(iz, EPS);
  const qz = mx / Math.max(ix, EPS);
  const corners = [
    pressureAt({ q0, qx, qz }, -length / 2, -width / 2),
    pressureAt({ q0, qx, qz }, length / 2, -width / 2),
    pressureAt({ q0, qx, qz }, -length / 2, width / 2),
    pressureAt({ q0, qx, qz }, length / 2, width / 2),
  ];
  const min = Math.min(...corners);
  const max = Math.max(...corners);
  const fullPolygon: Point[] = [
    [-length / 2, -width / 2],
    [length / 2, -width / 2],
    [length / 2, width / 2],
    [-length / 2, width / 2],
  ];

  // Full contact: the linear plane is non-negative across the whole base.
  // Keep q0/qx/qz, max/min, and the footing rectangle unchanged so every
  // full-contact result is numerically identical to before.
  if (min >= -EPS) {
    return {
      axial,
      mx,
      mz,
      q0,
      qx,
      qz,
      max,
      min,
      polygon: fullPolygon,
      contact: {
        state: "full",
        percent: 100,
        area,
        peak: max,
        forceResidual: 0,
        momentResidual: 0,
        iterations: 0,
      },
    };
  }

  // Partial contact / uplift: the linear field implies tension, which a soil
  // reaction cannot carry. Re-solve a compression-only plane clipped to the
  // contact polygon. solveContact uses the convention int(q*x)=-Mz, int(q*z)=Mx,
  // so we pass (Mx=mx, Mz=-mz) to land on this engine's int(q*x)=mz, int(q*z)=mx.
  const result = solveContact(axial, mx, -mz, length, width);
  const [a, b, c] = result.coefficients;
  return {
    axial,
    mx,
    mz,
    q0: a,
    qx: b,
    qz: c,
    max: result.peak,
    min: 0,
    polygon: result.polygon,
    contact: {
      state: result.state,
      percent: result.percent,
      area: result.area,
      peak: result.peak,
      forceResidual: result.forceResidual,
      momentResidual: result.momentResidual,
      iterations: result.iterations,
    },
  };
}

function pressureAt(
  field: Pick<PressureField, "q0" | "qx" | "qz">,
  x: number,
  z: number
) {
  return field.q0 + field.qx * x + field.qz * z;
}

// Soil reaction at a point, honoring compression-only contact: outside the
// contact polygon the plane is <= 0, so clamping at zero yields the true field.
function grossSoilPressureAt(field: PressureField, x: number, z: number) {
  const q = pressureAt(field, x, z);
  return field.contact.state === "full" ? q : Math.max(0, q);
}

function netPressureExtremes(
  grossField: PressureField,
  geometry: EngineGeometry,
  concretePressure: number,
  soilPressure: number,
  soilRects: Rect[]
) {
  const pedestal = clippedPedestalRect(geometry);
  const regions = [
    ...soilRects.map((rect) => ({ rect, hasSoil: true })),
    ...(pedestal ? [{ rect: pedestal, hasSoil: false }] : []),
  ];
  const values = regions.flatMap(({ rect, hasSoil }) =>
    [
      [rect.xMin, rect.zMin],
      [rect.xMin, rect.zMax],
      [rect.xMax, rect.zMin],
      [rect.xMax, rect.zMax],
    ].map(([x, z]) =>
      grossSoilPressureAt(grossField, x, z) -
      concretePressure -
      (hasSoil ? soilPressure : 0)
    )
  );

  if (values.length === 0) {
    return {
      max: grossField.max - concretePressure,
      min: grossField.min - concretePressure,
    };
  }

  return {
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

function strengthPressureField(
  loadCase: EngineLoadCase,
  moments: Pick<PressureField, "mx" | "mz">,
  geometry: EngineGeometry,
  materials: EngineMaterials,
  footingSelfWeight: number,
  soil: SoilOverburden,
  soilWeightFactor: number
): StructuralPressureField {
  const foundationDeadLoadFactor = Math.max(
    finite(loadCase.foundationDeadLoadFactor, 0),
    0
  );
  const grossMoments = addSoilWeightMoments(
    moments,
    soil,
    foundationDeadLoadFactor * soilWeightFactor
  );
  const grossAxial =
    loadCase.P +
    foundationDeadLoadFactor * (footingSelfWeight + soilWeightFactor * soil.weight);
  const grossField = pressureField(
    grossAxial,
    grossMoments.mx,
    grossMoments.mz,
    geometry
  );
  const footingTopDepth = Math.max(finite(geometry.soilCoverDepth), 0);
  const groundwaterDepth = Math.max(
    finite(geometry.groundwaterDepth, Number.POSITIVE_INFINITY),
    0
  );
  const concretePressure =
    foundationDeadLoadFactor *
    waterAdjustedWeight(
      Math.max(finite(materials.concreteUnitWeight), 0),
      Math.max(finite(materials.concreteUnitWeight), 0),
      Math.max(finite(materials.waterUnitWeight), 0),
      1,
      footingTopDepth,
      footingTopDepth + Math.max(finite(geometry.footingThickness), 0),
      groundwaterDepth
    ).pressure;
  const soilPressure = foundationDeadLoadFactor * soilWeightFactor * soil.pressure;
  const net = netPressureExtremes(
    grossField,
    geometry,
    concretePressure,
    soilPressure,
    soil.rects
  );

  return {
    ...grossField,
    axial: loadCase.P,
    mx: moments.mx,
    mz: moments.mz,
    max: net.max,
    min: net.min,
    grossAxial,
    grossMx: grossMoments.mx,
    grossMz: grossMoments.mz,
    grossMax: grossField.max,
    grossMin: grossField.min,
    concretePressure,
    soilPressure,
    soilRects: soil.rects,
    foundationDeadLoadFactor,
  };
}

function rigidityAdvice(
  geometry: EngineGeometry,
  materials: EngineMaterials
): FootingDesignResult["rigidity"] {
  const ec = positive(materials.concreteElasticModulus);
  const ks = positive(materials.subgradeReactionModulus);
  const thickness = positive(geometry.footingThickness);
  const length = positive(geometry.footingLength);
  const width = positive(geometry.footingWidth);
  const pedestalLength = positive(geometry.pedestalLength);
  const pedestalWidth = positive(geometry.pedestalWidth);
  const offsetX = finite(geometry.pedestalOffsetX);
  const offsetZ = finite(geometry.pedestalOffsetZ);
  const projectionX = Math.max(
    length / 2 - (offsetX + pedestalLength / 2),
    offsetX - pedestalLength / 2 + length / 2,
    0
  );
  const projectionZ = Math.max(
    width / 2 - (offsetZ + pedestalWidth / 2),
    offsetZ - pedestalWidth / 2 + width / 2,
    0
  );

  if (ec <= EPS || ks <= EPS || thickness <= EPS) {
    return {
      status: "unknown",
      ratioX: null,
      ratioZ: null,
      elasticLength: null,
      governingProjection: null,
      basis:
        "Adapted ACI 336.2R rigidity advisory needs concrete modulus Ec and vertical subgrade reaction modulus ks.",
      details: ["Enter Ec and ks to classify rigid versus flexible behavior."],
    };
  }

  const elasticLength = ((ec * 1000) * thickness ** 3 / (3 * ks)) ** 0.25;
  const effectiveLengthX = 4 * projectionX;
  const effectiveLengthZ = 4 * projectionZ;
  const ratioX = effectiveLengthX / Math.max(elasticLength, EPS);
  const ratioZ = effectiveLengthZ / Math.max(elasticLength, EPS);
  const governingRatio = Math.max(ratioX, ratioZ);
  const governingProjection = Math.max(projectionX, projectionZ);
  const minimumRigidElasticLength = (4 * governingProjection) / 1.75;
  const maximumRigidProjection = (1.75 * elasticLength) / 4;
  const rigid = governingRatio <= 1.75;

  return {
    status: rigid ? "rigid" : "flexible",
    ratioX,
    ratioZ,
    elasticLength,
    governingProjection,
    basis:
      "Adapted ACI 336.2R isolated-footing screen: Section 5.3 compares adjacent strip-footing spans with elastic length; here Leff = 4a.",
    details: [
      "Why 4a: the pedestal-to-edge projection a is treated as one edge curvature length, so 4a approximates the span-like length used by the strip-footing criterion.",
      `Le = ${round(elasticLength)} m from (Ec h^3 / 3ks)^0.25.`,
      `Rigid advisory when Leff/Le <= 1.75; otherwise consider flexible soil-structure analysis.`,
      `a_x = ${round(projectionX)} m, a_z = ${round(projectionZ)} m; a_max = ${round(maximumRigidProjection)} m before flexible behavior is advised.`,
      `Governing Leff/Le = ${round(governingRatio)} vs 1.75; minimum Le for current projection = ${round(minimumRigidElasticLength)} m.`,
    ],
  };
}

function normalizeRect(rect: Rect): Rect | null {
  const xMin = Math.min(rect.xMin, rect.xMax);
  const xMax = Math.max(rect.xMin, rect.xMax);
  const zMin = Math.min(rect.zMin, rect.zMax);
  const zMax = Math.max(rect.zMin, rect.zMax);

  if (xMax - xMin <= EPS || zMax - zMin <= EPS) return null;
  return { xMin, xMax, zMin, zMax };
}

function rectIntegrals(rect: Rect) {
  const normalized = normalizeRect(rect);
  if (!normalized) return null;
  const { xMin, xMax, zMin, zMax } = normalized;
  const dx = xMax - xMin;
  const dz = zMax - zMin;
  const area = dx * dz;
  const ix1 = ((xMax ** 2 - xMin ** 2) / 2) * dz;
  const iz1 = ((zMax ** 2 - zMin ** 2) / 2) * dx;
  const ix2 = ((xMax ** 3 - xMin ** 3) / 3) * dz;
  const iz2 = ((zMax ** 3 - zMin ** 3) / 3) * dx;
  const ixz =
    ((xMax ** 2 - xMin ** 2) / 2) *
    ((zMax ** 2 - zMin ** 2) / 2);

  return { area, ix1, iz1, ix2, iz2, ixz };
}

// Geometric moments of the soil-reaction region within `rect`:
// { A, x:int(x), z:int(z), xx:int(x^2), zz:int(z^2), xz:int(xz) } over dA.
// Full contact reuses the exact closed-form rect integrals (no numeric drift).
// Partial contact integrates over rect intersected with the contact polygon;
// an empty intersection (rect fully lifted) returns zeros so the gross soil
// reaction there is 0 while downward self-weight is still subtracted by callers.
function grossRegionMoments(
  field: PressureField,
  rect: Rect,
  rectInt: NonNullable<ReturnType<typeof rectIntegrals>>
) {
  if (field.contact.state === "full") {
    return {
      A: rectInt.area,
      x: rectInt.ix1,
      z: rectInt.iz1,
      xx: rectInt.ix2,
      zz: rectInt.iz2,
      xz: rectInt.ixz,
    };
  }
  return planeIntegrals(clipPolygonToRect(field.polygon, rect));
}

function isStructuralField(field: PressureField): field is StructuralPressureField {
  return "concretePressure" in field;
}

function asStructuralField(field: PressureField): StructuralPressureField | null {
  return isStructuralField(field) ? field : null;
}

function overlappedRect(a: Rect, b: Rect) {
  return normalizeRect({
    xMin: Math.max(a.xMin, b.xMin),
    xMax: Math.min(a.xMax, b.xMax),
    zMin: Math.max(a.zMin, b.zMin),
    zMax: Math.min(a.zMax, b.zMax),
  });
}

function uniformForce(pressure: number, rect: Rect) {
  const integrals = rectIntegrals(rect);
  return integrals ? pressure * integrals.area : 0;
}

function uniformMomentAboutXPlane(pressure: number, rect: Rect, planeX: number) {
  const integrals = rectIntegrals(rect);
  return integrals ? pressure * (integrals.ix1 - planeX * integrals.area) : 0;
}

function uniformMomentAboutZPlane(pressure: number, rect: Rect, planeZ: number) {
  const integrals = rectIntegrals(rect);
  return integrals ? pressure * (integrals.iz1 - planeZ * integrals.area) : 0;
}

function uniformPressureMomentX(pressure: number, rect: Rect) {
  const integrals = rectIntegrals(rect);
  return integrals ? pressure * integrals.iz1 : 0;
}

function uniformPressureMomentZ(pressure: number, rect: Rect) {
  const integrals = rectIntegrals(rect);
  return integrals ? pressure * integrals.ix1 : 0;
}

function integrateForce(field: PressureField, rect: Rect) {
  const integrals = rectIntegrals(rect);
  if (!integrals) return 0;
  const m = grossRegionMoments(field, rect, integrals);
  const gross = field.q0 * m.A + field.qx * m.x + field.qz * m.z;
  const structural = asStructuralField(field);
  if (!structural) return gross;
  const soilForce = structural.soilRects.reduce((sum, soilRect) => {
    const overlap = overlappedRect(rect, soilRect);
    return sum + (overlap ? uniformForce(structural.soilPressure, overlap) : 0);
  }, 0);
  return gross - uniformForce(structural.concretePressure, rect) - soilForce;
}

function integrateMomentAboutXPlane(
  field: PressureField,
  rect: Rect,
  planeX: number
) {
  const integrals = rectIntegrals(rect);
  if (!integrals) return 0;
  const m = grossRegionMoments(field, rect, integrals);
  const gross =
    field.q0 * (m.x - planeX * m.A) +
    field.qx * (m.xx - planeX * m.x) +
    field.qz * (m.xz - planeX * m.z);
  const structural = asStructuralField(field);
  if (!structural) return gross;
  const soilMoment = structural.soilRects.reduce((sum, soilRect) => {
    const overlap = overlappedRect(rect, soilRect);
    return sum + (overlap ? uniformMomentAboutXPlane(structural.soilPressure, overlap, planeX) : 0);
  }, 0);
  return gross - uniformMomentAboutXPlane(structural.concretePressure, rect, planeX) - soilMoment;
}

function integrateMomentAboutZPlane(
  field: PressureField,
  rect: Rect,
  planeZ: number
) {
  const integrals = rectIntegrals(rect);
  if (!integrals) return 0;
  const m = grossRegionMoments(field, rect, integrals);
  const gross =
    field.q0 * (m.z - planeZ * m.A) +
    field.qx * (m.xz - planeZ * m.x) +
    field.qz * (m.zz - planeZ * m.z);
  const structural = asStructuralField(field);
  if (!structural) return gross;
  const soilMoment = structural.soilRects.reduce((sum, soilRect) => {
    const overlap = overlappedRect(rect, soilRect);
    return sum + (overlap ? uniformMomentAboutZPlane(structural.soilPressure, overlap, planeZ) : 0);
  }, 0);
  return gross - uniformMomentAboutZPlane(structural.concretePressure, rect, planeZ) - soilMoment;
}

function integratePressureMomentX(field: PressureField, rect: Rect) {
  const integrals = rectIntegrals(rect);
  if (!integrals) return 0;
  const m = grossRegionMoments(field, rect, integrals);
  const gross = field.q0 * m.z + field.qx * m.xz + field.qz * m.zz;
  const structural = asStructuralField(field);
  if (!structural) return gross;
  const soilMoment = structural.soilRects.reduce((sum, soilRect) => {
    const overlap = overlappedRect(rect, soilRect);
    return sum + (overlap ? uniformPressureMomentX(structural.soilPressure, overlap) : 0);
  }, 0);
  return gross - uniformPressureMomentX(structural.concretePressure, rect) - soilMoment;
}

function integratePressureMomentZ(field: PressureField, rect: Rect) {
  const integrals = rectIntegrals(rect);
  if (!integrals) return 0;
  const m = grossRegionMoments(field, rect, integrals);
  const gross = field.q0 * m.x + field.qx * m.xx + field.qz * m.xz;
  const structural = asStructuralField(field);
  if (!structural) return gross;
  const soilMoment = structural.soilRects.reduce((sum, soilRect) => {
    const overlap = overlappedRect(rect, soilRect);
    return sum + (overlap ? uniformPressureMomentZ(structural.soilPressure, overlap) : 0);
  }, 0);
  return gross - uniformPressureMomentZ(structural.concretePressure, rect) - soilMoment;
}

function barArea(diameterMm: number) {
  const diameter = positive(diameterMm);
  return (Math.PI * diameter ** 2) / 4;
}

function providedSteelPerMeter(diameterMm: number, spacingMm: number) {
  return (barArea(diameterMm) / positive(spacingMm)) * 1000;
}

function effectiveDepth(thicknessM: number, coverMm: number, barDiameterMm: number) {
  return Math.max(thicknessM * 1000 - Math.max(coverMm, 0) - positive(barDiameterMm) / 2, 0);
}

function conservativeTwoLayerEffectiveDepth(
  thicknessM: number,
  coverMm: number,
  barDiameterXmm: number,
  barDiameterZmm: number
) {
  const largerBar = Math.max(positive(barDiameterXmm), positive(barDiameterZmm));
  const smallerBar = Math.min(positive(barDiameterXmm), positive(barDiameterZmm));
  return Math.max(thicknessM * 1000 - Math.max(coverMm, 0) - largerBar - smallerBar / 2, 0);
}

function minimumSteelRatio(standard: ConcreteStandard, fyMpa: number) {
  if (isAci(standard)) {
    if (fyMpa < 420) return 0.002;
    return Math.max(0.0018 * (420 / positive(fyMpa)), 0.0014);
  }

  return 0.002;
}

function minimumSteel(
  standard: ConcreteStandard,
  concreteAreaMm2: number,
  fyMpa: number
) {
  return minimumSteelRatio(standard, fyMpa) * concreteAreaMm2;
}

function aciFlexuralCapacity(asMm2PerM: number, dMm: number, fcMpa: number, fyMpa: number) {
  const b = 1000;
  const a = (asMm2PerM * fyMpa) / Math.max(0.85 * fcMpa * b, EPS);
  const mn = (asMm2PerM * fyMpa * Math.max(dMm - a / 2, 0)) / 1_000_000;
  return 0.9 * mn;
}

function csaStressBlockFactors(fcMpa: number) {
  return {
    alpha1: Math.max(0.85 - 0.0015 * fcMpa, 0.67),
    beta1: Math.max(0.97 - 0.0025 * fcMpa, 0.67),
  };
}

function csaFlexuralCapacity(asMm2PerM: number, dMm: number, fcMpa: number, fyMpa: number) {
  const b = 1000;
  const { alpha1 } = csaStressBlockFactors(fcMpa);
  const steelForce = 0.85 * asMm2PerM * fyMpa;
  const a = steelForce / Math.max(alpha1 * 0.65 * fcMpa * b, EPS);
  return (steelForce * Math.max(dMm - a / 2, 0)) / 1_000_000;
}

function flexuralCapacity(
  standard: ConcreteStandard,
  asMm2PerM: number,
  dMm: number,
  fcMpa: number,
  fyMpa: number
) {
  return isAci(standard)
    ? aciFlexuralCapacity(asMm2PerM, dMm, fcMpa, fyMpa)
    : csaFlexuralCapacity(asMm2PerM, dMm, fcMpa, fyMpa);
}

function requiredSteelForMoment(
  standard: ConcreteStandard,
  muKnMPerM: number,
  dMm: number,
  fcMpa: number,
  fyMpa: number
) {
  const b = 1000;
  const muNmm = Math.max(muKnMPerM, 0) * 1_000_000;
  if (muNmm <= EPS || dMm <= EPS) return 0;

  const params = codeParameters(standard);
  const concreteFactor = isAci(standard)
    ? 0.85 * fcMpa * b
    : csaStressBlockFactors(fcMpa).alpha1 * params.phiConcrete * fcMpa * b;
  const steelFactor = isAci(standard) ? params.phiFlexure * fyMpa : params.phiSteel * fyMpa;
  const depthFactor = isAci(standard) ? fyMpa / (2 * concreteFactor) : params.phiSteel * fyMpa / (2 * concreteFactor);
  const discriminant = Math.max(dMm ** 2 - (4 * depthFactor * muNmm) / Math.max(steelFactor, EPS), 0);
  const asRequired = (dMm - Math.sqrt(discriminant)) / Math.max(2 * depthFactor, EPS);

  return Math.max(asRequired, 0);
}

function concreteShearRoot(standard: ConcreteStandard, fcMpa: number) {
  const root = Math.sqrt(Math.max(fcMpa, 0));
  return isAci(standard)
    ? Math.min(root, CONCRETE_SHEAR_STRENGTH_LIMIT_ACI)
    : Math.min(root, CONCRETE_SHEAR_STRENGTH_LIMIT_CSA);
}

function csaSizeEffect(dMm: number, shearSpanM: number) {
  if (shearSpanM < 2 * (dMm / 1000)) return 1;
  return Math.min(1, 1300 / (1000 + Math.max(dMm, 0)));
}

function oneWayShearCapacityPerMeter(
  standard: ConcreteStandard,
  fcMpa: number,
  dMm: number,
  shearSpanM: number
) {
  const root = concreteShearRoot(standard, fcMpa);
  const coefficient = isAci(standard)
    ? 0.75 * 0.17
    : 0.19 * 0.65 * csaSizeEffect(dMm, shearSpanM);
  return (coefficient * root * 1000 * Math.max(dMm, 0)) / 1000;
}

function footingRects(geometry: EngineGeometry) {
  const length = positive(geometry.footingLength);
  const width = positive(geometry.footingWidth);
  const pedestalLength = positive(geometry.pedestalLength);
  const pedestalWidth = positive(geometry.pedestalWidth);
  const xCenter = finite(geometry.pedestalOffsetX);
  const zCenter = finite(geometry.pedestalOffsetZ);

  return {
    length,
    width,
    footing: {
      xMin: -length / 2,
      xMax: length / 2,
      zMin: -width / 2,
      zMax: width / 2,
    },
    pedestal: {
      xMin: xCenter - pedestalLength / 2,
      xMax: xCenter + pedestalLength / 2,
      zMin: zCenter - pedestalWidth / 2,
      zMax: zCenter + pedestalWidth / 2,
    },
  };
}

function flexureDemands(field: PressureField, geometry: EngineGeometry) {
  const { length, width, footing, pedestal } = footingRects(geometry);
  const rightMoment = Math.max(
    integrateMomentAboutXPlane(
      field,
      { xMin: pedestal.xMax, xMax: footing.xMax, zMin: footing.zMin, zMax: footing.zMax },
      pedestal.xMax
    ),
    0
  );
  const leftMoment = Math.max(
    -integrateMomentAboutXPlane(
      field,
      { xMin: footing.xMin, xMax: pedestal.xMin, zMin: footing.zMin, zMax: footing.zMax },
      pedestal.xMin
    ),
    0
  );
  const topMoment = Math.max(
    integrateMomentAboutZPlane(
      field,
      { xMin: footing.xMin, xMax: footing.xMax, zMin: pedestal.zMax, zMax: footing.zMax },
      pedestal.zMax
    ),
    0
  );
  const bottomMoment = Math.max(
    -integrateMomentAboutZPlane(
      field,
      { xMin: footing.xMin, xMax: footing.xMax, zMin: footing.zMin, zMax: pedestal.zMin },
      pedestal.zMin
    ),
    0
  );

  return {
    x: Math.max(leftMoment, rightMoment) / Math.max(width, EPS),
    z: Math.max(bottomMoment, topMoment) / Math.max(length, EPS),
    xSide: rightMoment >= leftMoment ? "+X face" : "-X face",
    zSide: topMoment >= bottomMoment ? "+Z face" : "-Z face",
  };
}

function oneWayShearDemands(
  field: PressureField,
  geometry: EngineGeometry,
  dXmm: number,
  dZmm: number
) {
  const { length, width, footing, pedestal } = footingRects(geometry);
  const dXm = dXmm / 1000;
  const dZm = dZmm / 1000;
  const rightX = pedestal.xMax + dXm;
  const leftX = pedestal.xMin - dXm;
  const topZ = pedestal.zMax + dZm;
  const bottomZ = pedestal.zMin - dZm;
  const right = rightX < footing.xMax
    ? Math.max(
        integrateForce(field, {
          xMin: rightX,
          xMax: footing.xMax,
          zMin: footing.zMin,
          zMax: footing.zMax,
        }),
        0
      )
    : 0;
  const left = leftX > footing.xMin
    ? Math.max(
        integrateForce(field, {
          xMin: footing.xMin,
          xMax: leftX,
          zMin: footing.zMin,
          zMax: footing.zMax,
        }),
        0
      )
    : 0;
  const top = topZ < footing.zMax
    ? Math.max(
        integrateForce(field, {
          xMin: footing.xMin,
          xMax: footing.xMax,
          zMin: topZ,
          zMax: footing.zMax,
        }),
        0
      )
    : 0;
  const bottom = bottomZ > footing.zMin
    ? Math.max(
        integrateForce(field, {
          xMin: footing.xMin,
          xMax: footing.xMax,
          zMin: footing.zMin,
          zMax: bottomZ,
        }),
        0
      )
    : 0;

  return {
    x: Math.max(left, right) / Math.max(width, EPS),
    z: Math.max(bottom, top) / Math.max(length, EPS),
    xSide: right >= left ? "+X section" : "-X section",
    zSide: top >= bottom ? "+Z section" : "-Z section",
    xShearSpan: Math.max(
      right >= left ? footing.xMax - rightX : leftX - footing.xMin,
      0
    ),
    zShearSpan: Math.max(
      top >= bottom ? footing.zMax - topZ : bottomZ - footing.zMin,
      0
    ),
  };
}

function criticalPerimeterSegments(geometry: EngineGeometry, dMm: number) {
  const { footing, pedestal } = footingRects(geometry);
  const dM = dMm / 1000;
  const xMinRaw = pedestal.xMin - dM / 2;
  const xMaxRaw = pedestal.xMax + dM / 2;
  const zMinRaw = pedestal.zMin - dM / 2;
  const zMaxRaw = pedestal.zMax + dM / 2;
  const xMin = Math.max(xMinRaw, footing.xMin);
  const xMax = Math.min(xMaxRaw, footing.xMax);
  const zMin = Math.max(zMinRaw, footing.zMin);
  const zMax = Math.min(zMaxRaw, footing.zMax);
  const includeLeft = xMinRaw > footing.xMin + EPS;
  const includeRight = xMaxRaw < footing.xMax - EPS;
  const includeBottom = zMinRaw > footing.zMin + EPS;
  const includeTop = zMaxRaw < footing.zMax - EPS;
  const segments = [
    includeLeft ? { x1: xMin, z1: zMin, x2: xMin, z2: zMax } : null,
    includeRight ? { x1: xMax, z1: zMin, x2: xMax, z2: zMax } : null,
    includeBottom ? { x1: xMin, z1: zMin, x2: xMax, z2: zMin } : null,
    includeTop ? { x1: xMin, z1: zMax, x2: xMax, z2: zMax } : null,
  ].filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
  const boM = segments.reduce(
    (sum, segment) => sum + Math.hypot(segment.x2 - segment.x1, segment.z2 - segment.z1),
    0
  );
  const missingSides =
    Number(!includeLeft) +
    Number(!includeRight) +
    Number(!includeBottom) +
    Number(!includeTop);
  const supportType: "interior" | "edge" | "corner" =
    missingSides <= 0 ? "interior" : missingSides === 1 ? "edge" : "corner";

  return {
    rect: { xMin, xMax, zMin, zMax },
    segments,
    boM,
    supportType,
  };
}

function linePerimeterProperties(
  segments: Array<{ x1: number; z1: number; x2: number; z2: number }>
) {
  const totalLength = segments.reduce(
    (sum, segment) => sum + Math.hypot(segment.x2 - segment.x1, segment.z2 - segment.z1),
    0
  );
  if (totalLength <= EPS) {
    return { xBar: 0, zBar: 0, jxLine: 0, jzLine: 0, cX: 0, cZ: 0 };
  }

  let xFirst = 0;
  let zFirst = 0;
  for (const segment of segments) {
    const length = Math.hypot(segment.x2 - segment.x1, segment.z2 - segment.z1);
    xFirst += ((segment.x1 + segment.x2) / 2) * length;
    zFirst += ((segment.z1 + segment.z2) / 2) * length;
  }
  const xBar = xFirst / totalLength;
  const zBar = zFirst / totalLength;
  let jxLine = 0;
  let jzLine = 0;
  let cX = 0;
  let cZ = 0;

  for (const segment of segments) {
    const vertical = Math.abs(segment.x2 - segment.x1) < EPS;
    const horizontal = Math.abs(segment.z2 - segment.z1) < EPS;
    const x1 = segment.x1 - xBar;
    const x2 = segment.x2 - xBar;
    const z1 = segment.z1 - zBar;
    const z2 = segment.z2 - zBar;
    cX = Math.max(cX, Math.abs(x1), Math.abs(x2));
    cZ = Math.max(cZ, Math.abs(z1), Math.abs(z2));

    if (vertical) {
      const zMin = Math.min(z1, z2);
      const zMax = Math.max(z1, z2);
      const length = zMax - zMin;
      jxLine += (zMax ** 3 - zMin ** 3) / 3;
      jzLine += x1 ** 2 * length;
    } else if (horizontal) {
      const xMin = Math.min(x1, x2);
      const xMax = Math.max(x1, x2);
      const length = xMax - xMin;
      jxLine += z1 ** 2 * length;
      jzLine += (xMax ** 3 - xMin ** 3) / 3;
    }
  }

  return { xBar, zBar, jxLine, jzLine, cX, cZ };
}

function momentTransferFraction(b1Mm: number, b2Mm: number) {
  const gammaFlexure = 1 / (1 + (2 / 3) * Math.sqrt(positive(b1Mm) / positive(b2Mm)));
  return 1 - gammaFlexure;
}

function punchingCapacity(
  standard: ConcreteStandard,
  fcMpa: number,
  dMm: number,
  boMm: number,
  pedestalLengthMm: number,
  pedestalWidthMm: number,
  supportType: "interior" | "edge" | "corner",
  shearSpanM: number
) {
  const beta = Math.max(pedestalLengthMm, pedestalWidthMm) / Math.max(Math.min(pedestalLengthMm, pedestalWidthMm), EPS);
  const root = concreteShearRoot(standard, fcMpa);

  if (isAci(standard)) {
    const alpha = supportType === "interior" ? 40 : supportType === "edge" ? 30 : 20;
    const vc = Math.min(
      0.33 * root,
      0.17 * (1 + 2 / beta) * root,
      0.083 * (2 + (alpha * dMm) / Math.max(boMm, EPS)) * root
    );
    return 0.75 * vc;
  }

  const alpha = supportType === "interior" ? 4 : supportType === "edge" ? 3 : 2;
  const sizeEffect = csaSizeEffect(dMm, shearSpanM);
  const base = 0.65 * sizeEffect * root;
  return Math.min(
    0.19 * (1 + 2 / beta) * base,
    (0.19 + (alpha * dMm) / Math.max(boMm, EPS)) * base,
    0.38 * base
  );
}

function punchingDemand(
  loadCase: EngineLoadCase,
  field: PressureField,
  geometry: EngineGeometry,
  standard: ConcreteStandard,
  dMm: number,
  fcMpa: number
) {
  const critical = criticalPerimeterSegments(geometry, dMm);
  const boMm = critical.boM * 1000;
  const dM = dMm / 1000;
  const insideForce = integrateForce(field, critical.rect);
  const vuKn = Math.max(loadCase.P - insideForce, 0);
  const directStress = (vuKn * 1000) / Math.max(boMm * dMm, EPS);
  const insideMx = integratePressureMomentX(field, critical.rect);
  const insideMz = integratePressureMomentZ(field, critical.rect);
  const momentX = Math.abs(field.mx - insideMx);
  const momentZ = Math.abs(field.mz - insideMz);
  const props = linePerimeterProperties(critical.segments);
  const jxMm4 = props.jxLine * 1_000_000_000 * dMm;
  const jzMm4 = props.jzLine * 1_000_000_000 * dMm;
  const cXMm = props.cX * 1000;
  const cZMm = props.cZ * 1000;
  const bX = Math.max(critical.rect.xMax - critical.rect.xMin, EPS) * 1000;
  const bZ = Math.max(critical.rect.zMax - critical.rect.zMin, EPS) * 1000;
  const gammaVx = momentTransferFraction(bX, bZ);
  const gammaVz = momentTransferFraction(bZ, bX);
  const momentStressX = jxMm4 > EPS
    ? (gammaVx * momentX * 1_000_000 * cZMm) / jxMm4
    : 0;
  const momentStressZ = jzMm4 > EPS
    ? (gammaVz * momentZ * 1_000_000 * cXMm) / jzMm4
    : 0;
  const shearSpan = Math.min(
    Math.max(critical.rect.xMax - critical.rect.xMin, 0),
    Math.max(critical.rect.zMax - critical.rect.zMin, 0)
  );
  const capacity = punchingCapacity(
    standard,
    fcMpa,
    dMm,
    boMm,
    geometry.pedestalLength * 1000,
    geometry.pedestalWidth * 1000,
    critical.supportType,
    shearSpan
  );

  return {
    stress: directStress + momentStressX + momentStressZ,
    capacity,
    vuKn,
    boMm,
    supportType: critical.supportType,
    directStress,
    momentStressX,
    momentStressZ,
    gammaVx,
    gammaVz,
    dM,
  };
}

function statusFromRatio(ratio: number, invalid = false): CheckStatus {
  if (ratio > 1) return "fail";
  if (invalid) return "warning";
  return "pass";
}

function check({
  id,
  label,
  demand,
  capacity,
  unit,
  governingCase,
  basis,
  details = [],
  notes = [],
  invalid = false,
}: {
  id: string;
  label: string;
  demand: number | null;
  capacity: number | null;
  unit: CheckUnit;
  governingCase: string;
  basis: string;
  details?: string[];
  notes?: string[];
  invalid?: boolean;
}): DesignCheck {
  const utilization =
    demand === null || capacity === null || Math.abs(capacity) <= EPS
      ? null
      : demand / capacity;
  const status =
    utilization === null
      ? invalid
        ? "warning"
        : "not-applicable"
      : statusFromRatio(utilization, invalid);

  return {
    id,
    label,
    demand,
    capacity,
    unit,
    utilization,
    governingCase,
    basis,
    details,
    notes,
    status,
  };
}

function governing<T>(
  values: T[],
  score: (value: T) => number
) {
  return values.reduce<T | null>(
    (current, value) =>
      current === null || score(value) > score(current) ? value : current,
    null
  );
}

function overallStatus(checks: DesignCheck[]): CheckStatus {
  if (checks.some((item) => item.status === "fail")) return "fail";
  if (checks.some((item) => item.status === "warning")) return "warning";
  if (checks.length === 0) return "not-applicable";
  return "pass";
}

export function calculateFootingDesign({
  buildingCode,
  loadStandard,
  concreteStandard,
  soilTreatmentMode,
  geometry,
  materials,
  reinforcement,
  serviceLoadCases,
  strengthLoadCases,
}: {
  buildingCode: BuildingCode;
  loadStandard: LoadStandard;
  concreteStandard: ConcreteStandard;
  soilTreatmentMode: SoilTreatmentMode;
  geometry: EngineGeometry;
  materials: EngineMaterials;
  reinforcement: ReinforcementInputs;
  serviceLoadCases: EngineLoadCase[];
  strengthLoadCases: EngineLoadCase[];
}): FootingDesignResult {
  const params = codeParameters(concreteStandard);
  const weight = footingWeight(geometry, materials);
  const soil = soilOverburden(geometry, materials);
  const soilFactors = soilTreatmentFactors(soilTreatmentMode);
  const appliedServiceFoundationWeight =
    weight + soilFactors.service * soil.weight;
  const slidingSafetyFactor = positive(
    materials.slidingSafetyFactor,
    DEFAULT_SERVICE_SLIDING_SAFETY_FACTOR
  );
  const overturningSafetyFactor = positive(
    materials.overturningSafetyFactor,
    DEFAULT_SERVICE_OVERTURNING_SAFETY_FACTOR
  );
  const dXSingleLayer = effectiveDepth(
    geometry.footingThickness,
    materials.clearCover,
    reinforcement.barDiameterX
  );
  const dZSingleLayer = effectiveDepth(
    geometry.footingThickness,
    materials.clearCover,
    reinforcement.barDiameterZ
  );
  const conservativeDepth = conservativeTwoLayerEffectiveDepth(
    geometry.footingThickness,
    materials.clearCover,
    reinforcement.barDiameterX,
    reinforcement.barDiameterZ
  );
  const dX = Math.min(dXSingleLayer, conservativeDepth);
  const dZ = Math.min(dZSingleLayer, conservativeDepth);
  const dAvg = (dX + dZ) / 2;
  const asX = providedSteelPerMeter(
    reinforcement.barDiameterX,
    reinforcement.barSpacingX
  );
  const asZ = providedSteelPerMeter(
    reinforcement.barDiameterZ,
    reinforcement.barSpacingZ
  );
  const concreteAreaX = 1000 * geometry.footingThickness * 1000;
  const concreteAreaZ = 1000 * geometry.footingThickness * 1000;
  const minSteelRatio = minimumSteelRatio(concreteStandard, materials.rebarYield);
  const asMinX = minimumSteel(concreteStandard, concreteAreaX, materials.rebarYield);
  const asMinZ = minimumSteel(concreteStandard, concreteAreaZ, materials.rebarYield);
  const assumptions = [
    "Load rows are already-combined service/stability and strength combinations; this engine does not generate ASCE or NBCC combinations from D/L/W/E components.",
    "P is compression-positive and acts at top of pedestal. Hx/Hz add overturning through pedestal height. Mx/Mz act at top of pedestal.",
    `Soil treatment mode is ${soilTreatmentLabel(soilTreatmentMode)}. Soil overburden excludes the pedestal footprint.`,
    "Groundwater reduces effective concrete and soil weights below the entered groundwater depth using buoyant unit weights.",
    `Service bearing, sliding, overturning, settlement, and rotation include footing self-weight${soilFactors.service > 0 ? " plus applied service soil overburden" : "; soil overburden is excluded"}.`,
    "Strength flexure and shear include factored soil overburden only in Full mode; net structural demand subtracts matching factored distributed concrete and applied soil loads.",
    "Orthogonal bottom bars are treated conservatively as a two-layer mat; both d_x and d_z use the upper-layer effective depth.",
    "Soil pressure uses a rigid-footing linear distribution. When the resultant leaves the kern the reaction is solved as compression-only: tension is not carried, and bearing plus structural demands are integrated over the reduced contact polygon.",
    "ACI 336.2R rigidity result is adapted for isolated footings using Leff = 4a; flexible classification means use soil-structure interaction instead of the linear pressure assumption.",
    "Pedestal is treated as a rectangular loaded area. Pedestal and pedestal-to-footing transfer design are outside this footing-slab check.",
  ];

  const serviceBearing = serviceLoadCases.map((loadCase) => {
    const loadMoments = loadMomentsAtFootingCenter(loadCase, geometry);
    const moments = addSoilWeightMoments(loadMoments, soil, soilFactors.service);
    const axial = loadCase.P + appliedServiceFoundationWeight;
    const field = pressureField(axial, moments.mx, moments.mz, geometry);
    return {
      id: loadCase.id,
      name: loadCaseName(loadCase),
      maxBearing: field.max,
      minBearing: field.min,
      axial,
      mx: moments.mx,
      mz: moments.mz,
      qx: field.qx,
      qz: field.qz,
      settlement:
        Math.max(field.max, 0) /
        Math.max(materials.subgradeReactionModulus, EPS) *
        1000,
      rotationX: Math.abs(field.qz) / Math.max(materials.subgradeReactionModulus, EPS),
      rotationZ: Math.abs(field.qx) / Math.max(materials.subgradeReactionModulus, EPS),
      eccentricityX: Math.abs(axial) > EPS ? moments.mz / axial : null,
      eccentricityZ: Math.abs(axial) > EPS ? moments.mx / axial : null,
      resultantWithinKern: field.contact.state === "full",
      contactState: field.contact.state,
      contactPercent: field.contact.percent,
      contactArea: field.contact.area,
      contactPolygon: field.polygon,
      cornerPressures: [
        [-geometry.footingLength / 2, -geometry.footingWidth / 2],
        [geometry.footingLength / 2, -geometry.footingWidth / 2],
        [geometry.footingLength / 2, geometry.footingWidth / 2],
        [-geometry.footingLength / 2, geometry.footingWidth / 2],
      ].map(([x, z]) => grossSoilPressureAt(field, x, z)),
      forceResidual: field.contact.forceResidual,
      momentResidual: field.contact.momentResidual,
      iterations: field.contact.iterations,
    };
  });

  const strengthRows = strengthLoadCases.map((loadCase) => {
    const moments = loadMomentsAtFootingCenter(loadCase, geometry);
    const field = strengthPressureField(
      loadCase,
      moments,
      geometry,
      materials,
      weight,
      soil,
      soilFactors.strength
    );
    const oneWay = oneWayShearDemands(field, geometry, dX, dZ);
    const flexure = flexureDemands(field, geometry);
    const punching = punchingDemand(
      loadCase,
      field,
      geometry,
      concreteStandard,
      dAvg,
      materials.concreteStrength
    );

    return { loadCase, field, oneWay, flexure, punching };
  });

  const strengthCases = strengthRows.map((row) => {
    return {
      id: row.loadCase.id,
      name: loadCaseName(row.loadCase),
      maxNetPressure: row.field.max,
      minNetPressure: row.field.min,
      maxGrossBearing: row.field.grossMax,
      minGrossBearing: row.field.grossMin,
      oneWayShearX: row.oneWay.x,
      oneWayShearZ: row.oneWay.z,
      flexureX: row.flexure.x,
      flexureZ: row.flexure.z,
      punchingStress: row.punching.stress,
      punchingCapacity: row.punching.capacity,
      contactState: row.field.contact.state,
      contactPercent: row.field.contact.percent,
      qx: row.field.qx,
      qz: row.field.qz,
      eccentricityX:
        Math.abs(row.field.grossAxial) > EPS
          ? row.field.grossMz / row.field.grossAxial
          : null,
      eccentricityZ:
        Math.abs(row.field.grossAxial) > EPS
          ? row.field.grossMx / row.field.grossAxial
          : null,
      contactPolygon: row.field.polygon,
      cornerPressures: [
        [-geometry.footingLength / 2, -geometry.footingWidth / 2],
        [geometry.footingLength / 2, -geometry.footingWidth / 2],
        [geometry.footingLength / 2, geometry.footingWidth / 2],
        [-geometry.footingLength / 2, geometry.footingWidth / 2],
      ].map(([x, z]) => grossSoilPressureAt(row.field, x, z)),
      forceResidual: row.field.contact.forceResidual,
      momentResidual: row.field.contact.momentResidual,
      iterations: row.field.contact.iterations,
    };
  });

  const checks: DesignCheck[] = [];
  checks.push(
    check({
      id: "frost-depth",
      label: "Frost depth",
      demand: Math.max(finite(geometry.frostDepth), 0) * 1000,
      capacity:
        (Math.max(finite(geometry.soilCoverDepth), 0) +
          Math.max(finite(geometry.footingThickness), 0)) *
        1000,
      unit: "mm",
      governingCase: "Geometry",
      basis: "Footing bottom depth must be at or below the entered frost depth.",
      details: [
        `Frost depth = ${round(Math.max(finite(geometry.frostDepth), 0))} m.`,
        `Footing bottom depth = ${round(Math.max(finite(geometry.soilCoverDepth), 0) + Math.max(finite(geometry.footingThickness), 0))} m.`,
      ],
    })
  );

  const bearingGoverning = governing(serviceBearing, (result) => result.maxBearing);
  checks.push(
    check({
      id: "service-bearing",
      label: "Service soil bearing",
      demand: bearingGoverning?.maxBearing ?? null,
      capacity: materials.allowableBearing,
      unit: "kPa",
      governingCase: bearingGoverning?.name ?? "No service cases",
      basis:
        "Service load table with linear bearing pressure: q = N/A +/- Mx/Sx +/- Mz/Sz.",
      details: bearingGoverning
        ? [
            `N = ${round(bearingGoverning.axial)} kN including footing self-weight${soilFactors.service > 0 ? " and applied service soil overburden" : ""}.`,
            `Mx = ${round(bearingGoverning.mx)} kN-m, Mz = ${round(bearingGoverning.mz)} kN-m at footing center.`,
          ]
        : [],
      notes: [],
      invalid: serviceBearing.length === 0,
    })
  );

  // Worst contact = lowest contact percentage (zero/failed score highest).
  const contactGoverning = governing(
    serviceBearing,
    (result) => 100 - result.contactPercent
  );
  checks.push(
    check({
      id: "soil-contact",
      label: "Soil contact",
      demand: contactGoverning?.contactPercent ?? null,
      capacity: 100,
      unit: "ratio",
      governingCase: contactGoverning?.name ?? "No service cases",
      basis:
        "Compression-only soil contact: full contact preferred; partial contact (resultant outside the kern) is permitted with bearing taken at the redistributed peak; zero contact (net uplift) is not allowed.",
      details: contactGoverning
        ? [
            `Peak bearing q_max = ${round(contactGoverning.maxBearing)} kPa at the compression edge.`,
            `Equilibrium residuals: dP = ${contactGoverning.forceResidual.toExponential(2)} kN, dM = ${contactGoverning.momentResidual.toExponential(2)} kN-m after ${contactGoverning.iterations} iteration(s).`,
          ]
        : [],
      notes: [],
      invalid: serviceBearing.length === 0,
    })
  );
  const contactCheck = checks[checks.length - 1];
  if (contactGoverning) {
    const state = contactGoverning.contactState;
    // Engineer-set floor on contact area. 0 keeps partial contact a warning;
    // any partial case below the floor is escalated to a failure.
    const minContact = Math.min(Math.max(finite(materials.minimumContactRatio, 0), 0), 100);
    contactCheck.contact = {
      state,
      percent: contactGoverning.contactPercent,
      minRequired: minContact,
    };
    const belowFloor =
      state === "partial" && contactGoverning.contactPercent < minContact - EPS;
    contactCheck.status =
      state === "full"
        ? "pass"
        : state === "partial"
          ? belowFloor
            ? "fail"
            : "warning"
          : "fail";
    contactCheck.utilization =
      state === "full"
        ? 0
        : state === "partial"
          ? belowFloor
            ? Number.POSITIVE_INFINITY
            : 1
          : Number.POSITIVE_INFINITY;
  }

  const slidingRows = serviceLoadCases.map((loadCase) => {
    const horizontal = Math.hypot(loadCase.Hx, loadCase.Hz);
    const resisting =
      Math.max(loadCase.P + appliedServiceFoundationWeight, 0) *
      Math.max(materials.soilFrictionCoefficient, 0);
    const available = resisting / slidingSafetyFactor;
    return {
      name: loadCaseName(loadCase),
      horizontal,
      available,
      safetyFactor: horizontal > EPS ? resisting / horizontal : Number.POSITIVE_INFINITY,
    };
  });
  const slidingGoverning = governing(slidingRows, (row) =>
    row.available <= EPS ? Number.POSITIVE_INFINITY : row.horizontal / row.available
  );
  checks.push(
    check({
      id: "service-sliding",
      label: "Service sliding",
      demand: slidingGoverning?.horizontal ?? null,
      capacity: slidingGoverning?.available ?? null,
      unit: "kN",
      governingCase: slidingGoverning?.name ?? "No service cases",
      basis:
        `Friction-only check: H <= mu N / ${slidingSafetyFactor}. Passive resistance is not included.`,
      details: slidingGoverning
        ? [`FS = ${Number.isFinite(slidingGoverning.safetyFactor) ? round(slidingGoverning.safetyFactor, 2) : "infinite"}.`]
        : [],
      notes: [],
      invalid: serviceLoadCases.length === 0,
    })
  );

  const factoredBearingGoverning = governing(
    strengthCases,
    (result) => result.maxGrossBearing
  );
  checks.push(
    check({
      id: "factored-bearing",
      label: "Factored soil bearing",
      demand: factoredBearingGoverning?.maxGrossBearing ?? null,
      capacity: materials.ultimateBearing,
      unit: "kPa",
      governingCase: factoredBearingGoverning?.name ?? "No strength cases",
      basis:
        "Strength load table with gross linear bearing pressure checked against ultimate soil bearing.",
      details: factoredBearingGoverning
        ? [
            `qmin = ${round(factoredBearingGoverning.minGrossBearing)} kPa.`,
          ]
        : [],
      notes: factoredBearingGoverning && factoredBearingGoverning.minGrossBearing < -EPS
        ? ["Strength gross bearing has contact loss in the governing case."]
        : [],
      invalid: strengthCases.length === 0,
    })
  );

  const overturningRows = serviceBearing.map((result) => {
    const restoringX = Math.max(result.axial, 0) * positive(geometry.footingWidth) / 2;
    const restoringZ = Math.max(result.axial, 0) * positive(geometry.footingLength) / 2;
    return {
      name: result.name,
      demandX: Math.abs(result.mx) * overturningSafetyFactor,
      capacityX: restoringX,
      demandZ: Math.abs(result.mz) * overturningSafetyFactor,
      capacityZ: restoringZ,
      fsX: Math.abs(result.mx) > EPS ? restoringX / Math.abs(result.mx) : Number.POSITIVE_INFINITY,
      fsZ: Math.abs(result.mz) > EPS ? restoringZ / Math.abs(result.mz) : Number.POSITIVE_INFINITY,
    };
  });
  const overturningXGoverning = governing(
    overturningRows,
    (row) => row.capacityX <= EPS ? Number.POSITIVE_INFINITY : row.demandX / row.capacityX
  );
  const overturningZGoverning = governing(
    overturningRows,
    (row) => row.capacityZ <= EPS ? Number.POSITIVE_INFINITY : row.demandZ / row.capacityZ
  );
  checks.push(
    check({
      id: "overturning-x",
      label: "Overturning about X edge",
      demand: overturningXGoverning?.demandX ?? null,
      capacity: overturningXGoverning?.capacityX ?? null,
      unit: "kN-m",
      governingCase: overturningXGoverning?.name ?? "No service cases",
      basis:
        `Service stability check: ${overturningSafetyFactor} |Mx| <= N B/2.`,
      details: overturningXGoverning
        ? [`FS = ${Number.isFinite(overturningXGoverning.fsX) ? round(overturningXGoverning.fsX, 2) : "infinite"}.`]
        : [],
      invalid: serviceBearing.length === 0,
    }),
    check({
      id: "overturning-z",
      label: "Overturning about Z edge",
      demand: overturningZGoverning?.demandZ ?? null,
      capacity: overturningZGoverning?.capacityZ ?? null,
      unit: "kN-m",
      governingCase: overturningZGoverning?.name ?? "No service cases",
      basis:
        `Service stability check: ${overturningSafetyFactor} |Mz| <= N L/2.`,
      details: overturningZGoverning
        ? [`FS = ${Number.isFinite(overturningZGoverning.fsZ) ? round(overturningZGoverning.fsZ, 2) : "infinite"}.`]
        : [],
      invalid: serviceBearing.length === 0,
    })
  );

  const settlementGoverning = governing(
    serviceBearing,
    (result) => result.settlement
  );
  checks.push(
    check({
      id: "service-settlement",
      label: "Maximum Winkler settlement",
      demand: settlementGoverning?.settlement ?? null,
      capacity: materials.allowableSettlement,
      unit: "mm",
      governingCase: settlementGoverning?.name ?? "No service cases",
      basis: "Serviceability check: s_max = q_max / k_s.",
      details: settlementGoverning
        ? [`qmax = ${round(settlementGoverning.maxBearing)} kPa.`]
        : [],
      notes: [],
      invalid: serviceBearing.length === 0,
    })
  );

  const rotationXGoverning = governing(
    serviceBearing,
    (result) => result.rotationX
  );
  const rotationZGoverning = governing(
    serviceBearing,
    (result) => result.rotationZ
  );
  checks.push(
    check({
      id: "service-rotation-x",
      label: "Footing rotation about X",
      demand: rotationXGoverning?.rotationX ?? null,
      capacity: materials.allowableRotationX,
      unit: "rad",
      governingCase: rotationXGoverning?.name ?? "No service cases",
      basis: "Rigid-footing Winkler check: theta_x = |dq/dz| / k_s.",
      details: rotationXGoverning
        ? [
            `dq/dz = ${round(rotationXGoverning.qz)} kPa/m.`,
            "dq/dz is the soil bearing-pressure gradient along z: how much the contact pressure changes per metre across the footing. Caused by the applied moment; dividing it by the subgrade modulus k_s converts the pressure slope into the footing tilt theta_x.",
          ]
        : [],
      invalid: serviceBearing.length === 0,
    }),
    check({
      id: "service-rotation-z",
      label: "Footing rotation about Z",
      demand: rotationZGoverning?.rotationZ ?? null,
      capacity: materials.allowableRotationZ,
      unit: "rad",
      governingCase: rotationZGoverning?.name ?? "No service cases",
      basis: "Rigid-footing Winkler check: theta_z = |dq/dx| / k_s.",
      details: rotationZGoverning
        ? [
            `dq/dx = ${round(rotationZGoverning.qx)} kPa/m.`,
            "dq/dx is the soil bearing-pressure gradient along x: how much the contact pressure changes per metre across the footing. Caused by the applied moment; dividing it by the subgrade modulus k_s converts the pressure slope into the footing tilt theta_z.",
          ]
        : [],
      invalid: serviceBearing.length === 0,
    })
  );

  checks.push(
    check({
      id: "effective-depth",
      label: "Minimum effective depth",
      demand: 150,
      capacity: Math.min(dX, dZ),
      unit: "mm",
      governingCase: "Geometry",
      basis: params.minDepthBasis,
      details: [
        `dX = ${round(dX)} mm, dZ = ${round(dZ)} mm using conservative upper-layer depth for a two-layer orthogonal mat.`,
      ],
      notes: [],
    })
  );
  const depthCheck = checks[checks.length - 1];
  depthCheck.utilization = depthCheck.capacity ? depthCheck.demand! / depthCheck.capacity : null;
  depthCheck.status =
    depthCheck.utilization !== null && depthCheck.utilization <= 1 ? "pass" : "fail";

  checks.push(
    check({
      id: "minimum-steel-x",
      label: "Minimum bottom steel X",
      demand: asMinX,
      capacity: asX,
      unit: "mm2/m",
      governingCase: "Reinforcement",
      basis: params.minSteelBasis,
      details: [
        `Minimum ratio rho_min = ${(minSteelRatio * 100).toFixed(2)}% of gross concrete area.`,
        `Provided AsX = ${round(asX)} mm2/m.`,
      ],
    }),
    check({
      id: "minimum-steel-z",
      label: "Minimum bottom steel Z",
      demand: asMinZ,
      capacity: asZ,
      unit: "mm2/m",
      governingCase: "Reinforcement",
      basis: params.minSteelBasis,
      details: [
        `Minimum ratio rho_min = ${(minSteelRatio * 100).toFixed(2)}% of gross concrete area.`,
        `Provided AsZ = ${round(asZ)} mm2/m.`,
      ],
    })
  );

  // Cases whose compression-only contact did not converge (the load resultant
  // falls off the footing) yield meaningless, exploding structural demands.
  // Exclude them from governing selection and flag instead of reporting garbage.
  const validStrengthRows = strengthRows.filter(
    (row) => row.field.contact.state !== "failed"
  );
  const strengthContactFailed = strengthRows.length > validStrengthRows.length;
  const STRENGTH_CONTACT_FAIL_NOTE =
    "One or more strength cases have no resolvable soil contact (load resultant off the footing). Those cases are excluded from the structural demand and must be corrected.";
  const rigidity = rigidityAdvice(geometry, materials);
  const flexureGoverningX = governing(validStrengthRows, (row) => row.flexure.x);
  const flexureGoverningZ = governing(validStrengthRows, (row) => row.flexure.z);
  const flexureCapacityX = flexuralCapacity(
    concreteStandard,
    asX,
    dX,
    materials.concreteStrength,
    materials.rebarYield
  );
  const flexureCapacityZ = flexuralCapacity(
    concreteStandard,
    asZ,
    dZ,
    materials.concreteStrength,
    materials.rebarYield
  );
  const requiredAsX = Math.max(
    requiredSteelForMoment(
      concreteStandard,
      flexureGoverningX?.flexure.x ?? 0,
      dX,
      materials.concreteStrength,
      materials.rebarYield
    ),
    asMinX
  );
  const requiredAsZ = Math.max(
    requiredSteelForMoment(
      concreteStandard,
      flexureGoverningZ?.flexure.z ?? 0,
      dZ,
      materials.concreteStrength,
      materials.rebarYield
    ),
    asMinZ
  );

  checks.push(
    check({
      id: "flexure-x",
      label: "Flexure X bars",
      demand: flexureGoverningX?.flexure.x ?? null,
      capacity: flexureCapacityX,
      unit: "kN-m/m",
      governingCase: flexureGoverningX ? loadCaseName(flexureGoverningX.loadCase) : "No strength cases",
      basis: `${params.flexureBasis} Critical section at pedestal face per footing provisions.`,
      details: flexureGoverningX
        ? [
            `Critical side = ${flexureGoverningX.flexure.xSide}.`,
            `Required As = ${round(requiredAsX)} mm2/m; provided As = ${round(asX)} mm2/m.`,
          ]
        : [],
      notes: strengthContactFailed ? [STRENGTH_CONTACT_FAIL_NOTE] : [],
      invalid: strengthLoadCases.length === 0 || validStrengthRows.length === 0,
    }),
    check({
      id: "flexure-z",
      label: "Flexure Z bars",
      demand: flexureGoverningZ?.flexure.z ?? null,
      capacity: flexureCapacityZ,
      unit: "kN-m/m",
      governingCase: flexureGoverningZ ? loadCaseName(flexureGoverningZ.loadCase) : "No strength cases",
      basis: `${params.flexureBasis} Critical section at pedestal face per footing provisions.`,
      details: flexureGoverningZ
        ? [
            `Critical side = ${flexureGoverningZ.flexure.zSide}.`,
            `Required As = ${round(requiredAsZ)} mm2/m; provided As = ${round(asZ)} mm2/m.`,
          ]
        : [],
      notes: strengthContactFailed ? [STRENGTH_CONTACT_FAIL_NOTE] : [],
      invalid: strengthLoadCases.length === 0 || validStrengthRows.length === 0,
    })
  );

  if (params.family === "CSA") {
    const { beta1 } = csaStressBlockFactors(materials.concreteStrength);
    const xC = (0.85 * asX * materials.rebarYield) /
      Math.max(csaStressBlockFactors(materials.concreteStrength).alpha1 * 0.65 * materials.concreteStrength * 1000 * beta1, EPS);
    const zC = (0.85 * asZ * materials.rebarYield) /
      Math.max(csaStressBlockFactors(materials.concreteStrength).alpha1 * 0.65 * materials.concreteStrength * 1000 * beta1, EPS);
    const cLimitX = 0.8 * (700 / (700 + materials.rebarYield)) * dX;
    const cLimitZ = 0.8 * (700 / (700 + materials.rebarYield)) * dZ;
    checks.push(
      check({
        id: "ductility-x",
        label: "CSA flexural ductility X",
        demand: xC,
        capacity: cLimitX,
        unit: "mm",
        governingCase: "Reinforcement",
        basis: `${concreteStandard} 10.5.2: c/d limit for flexural ductility.`,
        details: [`c = ${round(xC)} mm, limit = ${round(cLimitX)} mm.`],
      }),
      check({
        id: "ductility-z",
        label: "CSA flexural ductility Z",
        demand: zC,
        capacity: cLimitZ,
        unit: "mm",
        governingCase: "Reinforcement",
        basis: `${concreteStandard} 10.5.2: c/d limit for flexural ductility.`,
        details: [`c = ${round(zC)} mm, limit = ${round(cLimitZ)} mm.`],
      })
    );
  }

  const oneWayGoverningX = governing(validStrengthRows, (row) => row.oneWay.x);
  const oneWayGoverningZ = governing(validStrengthRows, (row) => row.oneWay.z);
  const oneWayCapacityX = oneWayShearCapacityPerMeter(
    concreteStandard,
    materials.concreteStrength,
    dX,
    oneWayGoverningX?.oneWay.xShearSpan ?? 0
  );
  const oneWayCapacityZ = oneWayShearCapacityPerMeter(
    concreteStandard,
    materials.concreteStrength,
    dZ,
    oneWayGoverningZ?.oneWay.zShearSpan ?? 0
  );
  checks.push(
    check({
      id: "one-way-shear-x",
      label: "One-way shear X",
      demand: oneWayGoverningX?.oneWay.x ?? null,
      capacity: oneWayCapacityX,
      unit: "kN/m",
      governingCase: oneWayGoverningX ? loadCaseName(oneWayGoverningX.loadCase) : "No strength cases",
      basis: `${params.oneWayShearBasis} Critical section at d from pedestal face.`,
      details: oneWayGoverningX
        ? [`Critical side = ${oneWayGoverningX.oneWay.xSide}.`]
        : [],
      notes: strengthContactFailed ? [STRENGTH_CONTACT_FAIL_NOTE] : [],
      invalid: strengthLoadCases.length === 0 || validStrengthRows.length === 0,
    }),
    check({
      id: "one-way-shear-z",
      label: "One-way shear Z",
      demand: oneWayGoverningZ?.oneWay.z ?? null,
      capacity: oneWayCapacityZ,
      unit: "kN/m",
      governingCase: oneWayGoverningZ ? loadCaseName(oneWayGoverningZ.loadCase) : "No strength cases",
      basis: `${params.oneWayShearBasis} Critical section at d from pedestal face.`,
      details: oneWayGoverningZ
        ? [`Critical side = ${oneWayGoverningZ.oneWay.zSide}.`]
        : [],
      notes: strengthContactFailed ? [STRENGTH_CONTACT_FAIL_NOTE] : [],
      invalid: strengthLoadCases.length === 0 || validStrengthRows.length === 0,
    })
  );

  const punchingGoverning = governing(
    validStrengthRows,
    (row) => row.punching.capacity <= EPS ? Number.POSITIVE_INFINITY : row.punching.stress / row.punching.capacity
  );
  checks.push(
    check({
      id: "punching-shear",
      label: "Two-way punching shear",
      demand: punchingGoverning?.punching.stress ?? null,
      capacity: punchingGoverning?.punching.capacity ?? null,
      unit: "MPa",
      governingCase: punchingGoverning ? loadCaseName(punchingGoverning.loadCase) : "No strength cases",
      basis: `${params.punchingBasis} Critical perimeter at d/2 from pedestal face; moment-transfer stress included.`,
      details: punchingGoverning
        ? [
            `Support condition = ${punchingGoverning.punching.supportType}.`,
            `bo = ${round(punchingGoverning.punching.boMm)} mm, d = ${round(dAvg)} mm.`,
            `vu direct = ${round(punchingGoverning.punching.directStress)} MPa, vu(Mx) = ${round(punchingGoverning.punching.momentStressX)} MPa, vu(Mz) = ${round(punchingGoverning.punching.momentStressZ)} MPa.`,
          ]
        : [],
      notes: strengthContactFailed ? [STRENGTH_CONTACT_FAIL_NOTE] : [],
      invalid: strengthLoadCases.length === 0 || validStrengthRows.length === 0,
    })
  );

  const torsionCases = [...serviceLoadCases, ...strengthLoadCases].filter(
    (loadCase) => Math.abs(loadCase.T) > EPS
  );
  if (torsionCases.length > 0) {
    checks.push({
      id: "vertical-torsion",
      label: "Vertical torsion T",
      status: "warning",
      demand: null,
      capacity: null,
      unit: "none",
      utilization: null,
      governingCase: torsionCases.map(loadCaseName).join(", "),
      basis:
        "Vertical torsion is listed in load input, but no code footing torsional-friction design is implemented.",
      details: ["T is not included in bearing, sliding, flexure, one-way shear, or punching shear capacity."],
      notes: ["Design torsional load transfer separately or keep T = 0 for this footing engine."],
    });
  }

  return {
    codeBasis: {
      buildingCode,
      loadStandard,
      concreteStandard,
      concreteFamily: params.family,
      references: codeReferences(buildingCode, loadStandard, concreteStandard),
      assumptions,
    },
    rigidity,
    summary: {
      overallStatus: overallStatus(checks),
      footingSelfWeight: weight,
      soilOverburdenWeight: soil.weight,
      appliedServiceFoundationWeight,
      effectiveDepthX: dX,
      effectiveDepthZ: dZ,
      averageShearDepth: dAvg,
      providedAsX: asX,
      providedAsZ: asZ,
      minimumAsX: asMinX,
      minimumAsZ: asMinZ,
      maxServiceCompression: Math.max(0, ...serviceLoadCases.map((loadCase) => loadCase.P)),
      maxStrengthCompression: Math.max(0, ...strengthLoadCases.map((loadCase) => loadCase.P)),
    },
    checks,
    serviceBearing,
    strengthCases,
  };
}
