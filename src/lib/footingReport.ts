import katex from "katex";
import type {
  BuildingCode,
  CheckStatus,
  CheckUnit,
  ConcreteStandard,
  EngineGeometry,
  EngineLoadCase,
  EngineMaterials,
  FootingDesignResult,
  LoadStandard,
  ReinforcementInputs,
  SoilTreatmentMode,
} from "./footingEngine";

export type FootingReportUnitSystem = "SI" | "USC";

export interface FootingReportState {
  title: string;
  units: FootingReportUnitSystem;
  buildingCode: BuildingCode;
  loadStandard: LoadStandard;
  concreteStandard: ConcreteStandard;
  soilTreatmentMode: SoilTreatmentMode;
  geometry: EngineGeometry;
  materials: EngineMaterials;
  reinforcement: ReinforcementInputs;
  serviceLoadCases: EngineLoadCase[];
  strengthLoadCases: EngineLoadCase[];
  results: FootingDesignResult;
}

type ReportRow = {
  key: string;
  symbol: string;
  label: string;
  value: string;
  unit: string;
  reference?: string;
};

type DecisionBranch = {
  label: string;
  condition: string;
  active: boolean;
  consequence: string;
};

type TocItem = {
  id: string;
  label: string;
  level?: 3;
};

const EPS = 1e-9;
const M_TO_FT = 3.28084;
const MPA_TO_KSI = 0.1450377377;
const MM_TO_IN = 0.0393700787;
const KPA_TO_KSF = 0.0208854342;
const KN_TO_KIP = 0.2248089431;
const KN_M_TO_KIP_FT = 0.7375621493;
const KN_PER_M_TO_KIP_PER_FT = KN_TO_KIP / M_TO_FT;
const KN_M_PER_M_TO_KIP_FT_PER_FT = KN_M_TO_KIP_FT / M_TO_FT;
const MM2_PER_M_TO_IN2_PER_FT = 0.0015500031 / M_TO_FT;
const SERVICE_SLIDING_SAFETY_FACTOR = 1.5;

export function createFootingCalculationBriefHtml(state: FootingReportState) {
  const title = state.title.trim() || "Untitled footing";
  const generatedAt = formatReportDate(new Date());
  const isAci = state.concreteStandard.startsWith("ACI");
  const isIbc = state.buildingCode.startsWith("IBC");
  const hasTorsion = [...state.serviceLoadCases, ...state.strengthLoadCases].some(
    (loadCase) => Math.abs(loadCase.T) > EPS
  );
  const hasWarnings = state.results.checks.some(
    (check) => check.status === "warning" || check.notes.length > 0
  );
  const contents: TocItem[] = [
    { id: "assumptions", label: "Assumptions" },
    { id: "technical-references", label: "Technical references" },
    { id: "calculation-trace-map", label: "Calculation trace map" },
    { id: "computed-values", label: "Computed values" },
    { id: "load-cases", label: "Load cases" },
    { id: "check-summary", label: "Check summary" },
    { id: "calculation-section", label: "Calculation section" },
    { id: "geometry-self-weight", label: "Geometry and foundation weight", level: 3 },
    { id: "load-transfer-bearing", label: "Load transfer and bearing", level: 3 },
    { id: "sliding-rigidity", label: "Sliding and rigidity", level: 3 },
    { id: "reinforcement-depth", label: "Reinforcement and depth", level: 3 },
    { id: "flexure-shear", label: "Flexure and one-way shear", level: 3 },
    { id: "punching-shear", label: "Punching shear", level: 3 },
    ...(isAci ? [] : [{ id: "csa-ductility", label: "CSA ductility", level: 3 as const }]),
    ...(hasTorsion ? [{ id: "torsion-warning", label: "Torsion warning", level: 3 as const }] : []),
    ...(hasWarnings ? [{ id: "warnings", label: "Warnings" }] : []),
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #18202f;
      --muted: #5f6b7a;
      --rule: #d8dee8;
      --paper: #ffffff;
      --wash: #f4f7fb;
      --accent: #1c4f8f;
      --ok: #047857;
      --bad: #b91c1c;
      --warn: #b45309;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--ink);
      background: #eef2f7;
      font: 12px/1.45 Arial, Helvetica, sans-serif;
    }
    .report-shell {
      width: min(1344px, calc(100% - 32px));
      margin: 24px auto;
      display: grid;
      grid-template-columns: 12rem minmax(0, 960px) 12rem;
      gap: 16px;
      align-items: start;
      justify-content: center;
    }
    main {
      width: 100%;
      margin: 0;
      min-width: 0;
      background: var(--paper);
      border: 1px solid var(--rule);
      box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
      padding: 36px 42px;
    }
    .report-toc,
    .report-print-actions {
      position: sticky;
      top: 16px;
    }
    .report-toc {
      align-self: start;
      max-height: calc(100vh - 32px);
      overflow: auto;
    }
    .report-print-actions {
      display: flex;
      justify-content: flex-start;
    }
    .toc {
      margin: 0;
      padding: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background: var(--paper);
      break-inside: avoid;
      box-shadow: 0 1px 2px rgb(20 30 48 / 8%);
      font-size: 14px;
      line-height: 1.43;
    }
    .toc-title {
      margin: 0;
      padding: 0 8px 4px;
      color: #9ca3af;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .05em;
      text-transform: uppercase;
    }
    .toc a {
      display: block;
      padding: 4px 8px;
      border-radius: 8px;
      color: #4b5563;
      text-decoration: none;
      transition: background-color 120ms ease, color 120ms ease;
    }
    .toc a:hover { background: #f3f4f6; }
    .toc a.is-active {
      background: #eff6ff;
      color: #1d4ed8;
      font-weight: 500;
    }
    .toc a.toc-top {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 2px;
      color: #9ca3af;
    }
    .toc-rule {
      border-top: 1px solid #f3f4f6;
      margin: 0 0 2px;
    }
    .toc-list {
      display: grid;
      gap: 2px;
    }
    .toc-list a {
      break-inside: avoid;
    }
    .toc-list a.toc-sub {
      padding-left: 32px;
      font-size: 12px;
    }
    .toc-list a.toc-sub .toc-num {
      margin-right: 6px;
      color: #9ca3af;
      font-variant-numeric: tabular-nums;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 2px solid var(--ink);
      padding-bottom: 14px;
      margin-bottom: 14px;
    }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 8px;
      background: #0f172a;
      color: #fff;
      font-weight: 700;
      font-size: 18px;
    }
    h1 { margin: 0; font-size: 24px; line-height: 1.15; }
    h2 {
      margin: 28px 0 10px;
      border-bottom: 1px solid var(--rule);
      padding-bottom: 5px;
      font-size: 18px;
    }
    h3 { margin: 22px 0 8px; font-size: 14px; }
    h2.calc-num { counter-reset: secnum; }
    h3.calc-sub { counter-increment: secnum; counter-reset: subnum; }
    h3.calc-sub::before { content: counter(secnum) "\\00a0\\00a0"; }
    .calc-title,
    .decision-title { counter-increment: subnum; }
    .calc-title::before,
    .decision-title::before { content: counter(secnum) "." counter(subnum) "\\00a0\\00a0"; }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 12px 0 18px;
    }
    .meta div, .panel {
      border: 1px solid var(--rule);
      background: var(--wash);
      padding: 8px 10px;
    }
    .front-toc { page-break-after: always; }
    .front-toc-title {
      margin: 24px 0 10px;
      padding-bottom: 4px;
      border-bottom: 2px solid var(--accent);
      font-size: 15px;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .front-toc-list { display: grid; gap: 6px; }
    .front-toc-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      break-inside: avoid;
      color: var(--ink);
      text-decoration: none;
    }
    .front-toc-row .leader {
      flex: 1 1 auto;
      border-bottom: 1px dotted var(--rule);
      transform: translateY(-3px);
    }
    .front-toc-row .num {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      color: var(--muted);
    }
    .front-toc-row.sub { padding-left: 18px; }
    .front-toc-row.sub2 { padding-left: 38px; font-size: 13px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 12px;
    }
    th, td {
      border: 1px solid var(--rule);
      padding: 5px 6px;
      vertical-align: top;
    }
    th { background: #f8fafc; text-align: left; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .quantity-panel {
      border: 1px solid var(--rule);
      padding: 8px;
      background: #fbfdff;
    }
    .quantity-heading {
      margin: 8px 0 4px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .dense-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(0, .9fr) auto auto;
      border-top: 1px solid var(--rule);
    }
    .dense-grid > div {
      border-bottom: 1px solid var(--rule);
      padding: 4px 6px;
      min-width: 0;
    }
    .dense-grid .head { background: #f8fafc; font-weight: 700; }
    .status {
      display: inline-block;
      border-radius: 999px;
      border: 1px solid var(--rule);
      padding: 1px 7px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .status-pass { color: var(--ok); border-color: #bbf7d0; background: #f0fdf4; }
    .status-fail { color: var(--bad); border-color: #fecaca; background: #fef2f2; }
    .status-warning { color: var(--warn); border-color: #fde68a; background: #fffbeb; }
    .status-not-applicable { color: #475569; background: #f8fafc; }
    .decision, .calc {
      border: 1px solid var(--rule);
      background: #fbfdff;
      padding: 9px 10px;
      margin: 8px 0 10px;
      break-inside: avoid;
    }
    .decision-title, .calc-title {
      margin-bottom: 5px;
      font-weight: 700;
      color: #0f172a;
    }
    .branch {
      display: grid;
      grid-template-columns: 70px minmax(0, .9fr) minmax(0, 1.4fr);
      gap: 8px;
      border-top: 1px solid #e2e8f0;
      padding: 5px 0;
    }
    .branch:first-child { border-top: 0; }
    .branch.inactive { color: #94a3b8; }
    .branch-mark {
      font-size: 10px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
    }
    .branch.active .branch-mark { color: var(--ok); }
    .latex-line {
      display: block;
      padding: 12px 0;
      line-height: 1.8;
    }
    .latex-formula {
      overflow-wrap: anywhere;
      text-align: left;
    }
    .latex-formula .katex-display,
    .latex-formula math[display="block"] {
      margin: 0;
      text-align: left;
    }
    .latex-formula math[display="block"] {
      display: inline-block;
    }
    .latex-formula .katex,
    .latex-formula math {
      font-size: 13px;
    }
    .ref { color: var(--muted); font-size: 10px; white-space: nowrap; }
    .warn-text { color: var(--warn); }
    .print-button {
      appearance: none;
      border: 1px solid #c5cfdd;
      border-radius: 6px;
      background: var(--paper);
      color: var(--ink);
      cursor: pointer;
      font: 700 12px/1 Arial, Helvetica, sans-serif;
      padding: 9px 12px;
      box-shadow: 0 8px 18px rgb(20 30 48 / 10%);
    }
    .print-button:hover {
      background: var(--wash);
    }
    @media (max-width: 900px) {
      .report-shell { grid-template-columns: 1fr; }
      .report-toc,
      .report-print-actions { position: static; }
      .report-print-actions {
        order: -1;
        justify-content: flex-end;
      }
      .report-toc { max-height: none; }
      main { padding: 22px; }
      .meta { grid-template-columns: 1fr; }
      .dense-grid { grid-template-columns: minmax(0, 1fr) auto; }
      .dense-grid .ref-col, .dense-grid .unit-col { display: none; }
      .branch { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: #fff; }
      .report-shell { display: block; width: auto; margin: 0; }
      main { border: 0; box-shadow: none; padding: 0; }
      .no-print, .report-toc, .report-print-actions { display: none !important; }
      h2 { break-after: avoid; }
      .decision, .calc, table { break-inside: avoid; }
    }
  </style>
</head>
<body>
<div class="report-shell">
  <aside class="report-toc no-print">
    ${toc(contents)}
  </aside>
  <main id="top">
    <div class="brand">
      <div class="brand-mark">FD</div>
      <div>
        <h1>${esc(title)}</h1>
        <div>Isolated Footing Design Calculation Brief</div>
      </div>
    </div>
    <div class="meta">
      <div><strong>Generated:</strong> ${esc(generatedAt)}</div>
      <div><strong>Unit system:</strong> ${state.units === "SI" ? "SI" : "US Customary"}</div>
      <div><strong>Overall:</strong> ${statusPill(state.results.summary.overallStatus)}</div>
    </div>

    ${frontToc(contents)}

    <h2 id="assumptions">Assumptions</h2>
    <ul>
      ${state.results.codeBasis.assumptions.map((item) => `<li>${mathText(item)}</li>`).join("")}
      <li>All load cases shown below are user-entered already-combined actions. No hidden load-combination generation is performed.</li>
      <li>Pedestal design, anchorage into the pedestal, settlement, global geotechnical capacity, and soil-structure interaction beyond the ACI 336 advisory are outside this footing-slab check.</li>
    </ul>

    <h2 id="technical-references">Technical References</h2>
    <ul>
      ${state.results.codeBasis.references.map((item) => `<li>${esc(item)}</li>`).join("")}
    </ul>

    <h2 id="calculation-trace-map">Calculation Trace Map</h2>
    ${traceMapTable(state, { isAci, isIbc, hasTorsion })}

    <h2 id="computed-values">Computed Values</h2>
    <div class="quantity-panel">
      <div class="quantity-heading">Inputs</div>
      ${denseGrid(inputRows(state))}
      <div class="quantity-heading">Computed</div>
      ${denseGrid(computedRows(state))}
    </div>

    <h2 id="load-cases">Load Cases</h2>
    <h3>Service / Stability Load Cases</h3>
    ${loadCasesTable(state, "service")}
    <h3>Strength Load Cases</h3>
    ${loadCasesTable(state, "strength")}

    <h2 id="check-summary">Check Summary</h2>
    ${checkSummaryTable(state)}

    <h2 class="calc-num" id="calculation-section">Calculation Section</h2>
    ${calculationSection(state, { isAci, isIbc, hasTorsion })}

    ${hasWarnings ? `<h2 id="warnings">Warnings</h2>${warningList(state)}` : ""}
  </main>
  <aside class="report-print-actions no-print">
    <button class="print-button" type="button" onclick="window.print()">Print</button>
  </aside>
</div>
<script>
(() => {
  const list = document.querySelector(".front-toc .front-toc-list");
  if (!list) return;
  const anchor = list.querySelector('a[href="#calculation-section"]');
  const items = document.querySelectorAll(
    "main h3.calc-sub, main .calc-title, main .decision-title",
  );
  let sec = 0;
  let sub = 0;
  let auto = 0;
  const frag = document.createDocumentFragment();
  items.forEach((el) => {
    const isSection = el.matches("h3.calc-sub");
    let number;
    let depth;
    if (isSection) {
      sec += 1;
      sub = 0;
      number = String(sec);
      depth = 1;
    } else {
      sub += 1;
      number = sec + "." + sub;
      depth = 2;
    }
    if (!el.id) el.id = "calc-item-" + auto++;
    const row = document.createElement("a");
    row.className = "front-toc-row " + (depth === 1 ? "sub" : "sub2");
    row.href = "#" + el.id;
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = number + "\u00a0\u00a0" + el.textContent.trim();
    const leader = document.createElement("span");
    leader.className = "leader";
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = number;
    row.append(label, leader, num);
    frag.appendChild(row);
  });
  if (anchor && anchor.nextSibling) list.insertBefore(frag, anchor.nextSibling);
  else list.appendChild(frag);
})();
(() => {
  const links = Array.from(document.querySelectorAll(".toc-list a"));
  const sections = links
    .map((link) => document.getElementById(link.getAttribute("href").slice(1)))
    .filter(Boolean);
  const setActive = (id) => {
    links.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === "#" + id);
    });
  };
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.find((entry) => entry.isIntersecting);
    if (visible) setActive(visible.target.id);
  }, { rootMargin: "-10% 0px -80% 0px", threshold: 0 });
  sections.forEach((section) => observer.observe(section));
})();
</script>
</body>
</html>`;
}

function calculationSection(
  state: FootingReportState,
  flags: { isAci: boolean; isIbc: boolean; hasTorsion: boolean }
) {
  const data = derived(state);
  return `
    <h3 class="calc-sub" id="geometry-self-weight">Geometry and Foundation Weight</h3>
    ${calc("Footing plan properties", [
      String.raw`A = B_x B_z`,
      String.raw`A = ${q(state.geometry.footingLength, "m")} \times ${q(state.geometry.footingWidth, "m")} = ${q(data.area, "m^2")}`,
      String.raw`A_s = A - A_p = ${q(data.soilArea, "m^2")}`,
      String.raw`S_x = \frac{B_x B_z^2}{6} = ${q(data.sx, "m^3")}`,
      String.raw`S_z = \frac{B_z B_x^2}{6} = ${q(data.sz, "m^3")}`,
    ])}
    ${calc("Concrete and soil weight", [
      String.raw`V_c = B_x B_z h`,
      String.raw`V_c = ${q(state.geometry.footingLength, "m")} \times ${q(state.geometry.footingWidth, "m")} \times ${q(state.geometry.footingThickness, "m")} = ${q(data.volume, "m^3")}`,
      String.raw`W_f = V_c \gamma_c = ${q(data.volume, "m^3")} \times ${q(state.materials.concreteUnitWeight, "kN/m^3")} = ${q(state.results.summary.footingSelfWeight, "kN")}`,
      String.raw`V_s = A_s h_s = ${q(data.soilArea, "m^2")} \times ${q(state.geometry.soilCoverDepth, "m")} = ${q(data.soilVolume, "m^3")}`,
      String.raw`W_s = V_s \gamma_s = ${q(data.soilVolume, "m^3")} \times ${q(state.materials.soilUnitWeight, "kN/m^3")} = ${q(state.results.summary.soilOverburdenWeight, "kN")}`,
      String.raw`W_{svc} = W_f + \eta_{s,svc}W_s = ${q(state.results.summary.appliedServiceFoundationWeight, "kN")}`,
    ])}

    <h3 class="calc-sub" id="load-transfer-bearing">Load Transfer and Bearing</h3>
    ${decision({
      title: "Building-code load basis",
      branches: [
        {
          label: "IBC",
          condition: String.raw`\text{building code starts with IBC}`,
          active: flags.isIbc,
          consequence: `${state.loadStandard} load combinations are expected in the load tables.`,
        },
        {
          label: "NBCC",
          condition: String.raw`\text{building code starts with NBCC}`,
          active: !flags.isIbc,
          consequence: "NBCC load combinations are expected in the load tables.",
        },
      ],
    })}
    ${serviceBearingCalculations(state)}
    ${checkCalc(state, "service-bearing")}
    ${checkCalc(state, "soil-contact")}

    <h3 class="calc-sub" id="sliding-rigidity">Sliding and Rigidity</h3>
    ${slidingCalculations(state)}
    ${checkCalc(state, "service-sliding")}
    ${decision({
      title: "ACI 336 rigidity advisory",
      branches: [
        {
          label: "Rigid",
          condition: String.raw`L/L_e \le 1.75`,
          active: state.results.rigidity.status === "rigid",
          consequence: "linear pressure assumption is reasonable for preliminary footing checks.",
        },
        {
          label: "Flexible",
          condition: String.raw`L/L_e > 1.75`,
          active: state.results.rigidity.status === "flexible",
          consequence: "soil-structure interaction should be used instead of the linear pressure assumption.",
        },
        {
          label: "Unknown",
          condition: String.raw`E_c \le 0 \;\text{or}\; k_s \le 0`,
          active: state.results.rigidity.status === "unknown",
          consequence: "enter Ec and ks to classify rigidity.",
        },
      ],
    })}
    ${rigidityCalculations(state, data)}

    <h3 class="calc-sub" id="reinforcement-depth">Reinforcement and Depth</h3>
    ${decision({
      title: "Concrete design family",
      branches: [
        {
          label: "ACI",
          condition: String.raw`\text{selected concrete standard starts with ACI}`,
          active: flags.isAci,
          consequence: "use ACI phi factors and minimum slab reinforcement rules.",
        },
        {
          label: "CSA",
          condition: String.raw`\text{selected concrete standard starts with CSA}`,
          active: !flags.isAci,
          consequence: "use CSA resistance factors, minimum reinforcement, and ductility checks.",
        },
      ],
    })}
    ${depthAndSteelCalculations(state, data, flags.isAci)}
    ${checkCalc(state, "effective-depth")}
    ${checkCalc(state, "minimum-steel-x")}
    ${checkCalc(state, "minimum-steel-z")}

    <h3 class="calc-sub" id="flexure-shear">Flexure and One-Way Shear</h3>
    ${strengthPressureCalculations(state)}
    ${flexureCapacityCalculations(state, data, flags.isAci)}
    ${checkCalc(state, "flexure-x")}
    ${checkCalc(state, "flexure-z")}
    ${oneWayShearCalculations(state, flags.isAci)}
    ${checkCalc(state, "one-way-shear-x")}
    ${checkCalc(state, "one-way-shear-z")}

    <h3 class="calc-sub" id="punching-shear">Punching Shear</h3>
    ${punchingCalculations(state, flags.isAci)}
    ${checkCalc(state, "punching-shear")}

    ${flags.isAci ? "" : `<h3 class="calc-sub" id="csa-ductility">CSA Ductility</h3>${csaDuctilityCalculations(state, data)}${checkCalc(state, "ductility-x")}${checkCalc(state, "ductility-z")}`}
    ${flags.hasTorsion ? `<h3 class="calc-sub" id="torsion-warning">Torsion Warning</h3>${checkCalc(state, "vertical-torsion")}` : ""}
  `;
}

function serviceBearingCalculations(state: FootingReportState) {
  if (state.serviceLoadCases.length === 0) {
    return calc("Service bearing", String.raw`\text{No service load cases entered.}`);
  }
  return state.serviceLoadCases
    .map((loadCase) => {
      const row = state.results.serviceBearing.find((item) => item.id === loadCase.id);
      const loadMoments = loadMomentsAtFootingCenter(loadCase, state.geometry);
      const data = derived(state);
      const soilFactors = soilTreatmentFactors(state.soilTreatmentMode);
      const moments = addSoilWeightMoments(
        loadMoments,
        state.results.summary.soilOverburdenWeight,
        data.soilCentroidX,
        data.soilCentroidZ,
        soilFactors.service
      );
      return calc(`Service bearing - ${loadName(loadCase)}`, [
        String.raw`\eta_{s,svc} = ${num(soilFactors.service, 0)}`,
        String.raw`M_x^* = M_x + H_z h_p + P e_z + \eta_{s,svc}W_s z_s`,
        String.raw`M_x^* = ${q(loadCase.Mx, "kN m")} + ${q(loadCase.Hz, "kN")}${q(state.geometry.pedestalHeight, "m")} + ${q(loadCase.P, "kN")}${q(state.geometry.pedestalOffsetZ, "m")} + ${num(soilFactors.service, 0)}${q(state.results.summary.soilOverburdenWeight, "kN")}${q(data.soilCentroidZ, "m")} = ${q(moments.mx, "kN m")}`,
        String.raw`M_z^* = M_z - H_x h_p - P e_x - \eta_{s,svc}W_s x_s`,
        String.raw`M_z^* = ${q(loadCase.Mz, "kN m")} - ${q(loadCase.Hx, "kN")}${q(state.geometry.pedestalHeight, "m")} - ${q(loadCase.P, "kN")}${q(state.geometry.pedestalOffsetX, "m")} - ${num(soilFactors.service, 0)}${q(state.results.summary.soilOverburdenWeight, "kN")}${q(data.soilCentroidX, "m")} = ${q(moments.mz, "kN m")}`,
        String.raw`N = P + W_f + \eta_{s,svc}W_s = ${q(loadCase.P, "kN")} + ${q(state.results.summary.footingSelfWeight, "kN")} + ${num(soilFactors.service, 0)}${q(state.results.summary.soilOverburdenWeight, "kN")} = ${q(row?.axial ?? 0, "kN")}`,
        String.raw`q = \frac{N}{A} \pm \frac{M_x^*}{S_x} \pm \frac{M_z^*}{S_z}`,
        String.raw`q_{max} = ${q(row?.maxBearing ?? 0, "kPa")};\quad q_{min} = ${q(row?.minBearing ?? 0, "kPa")};\quad A=${q(data.area, "m^2")},\;S_x=${q(data.sx, "m^3")},\;S_z=${q(data.sz, "m^3")}`,
      ]);
    })
    .join("");
}

function slidingCalculations(state: FootingReportState) {
  if (state.serviceLoadCases.length === 0) {
    return calc("Service sliding", String.raw`\text{No service load cases entered.}`);
  }
  return state.serviceLoadCases
    .map((loadCase) => {
      const horizontal = Math.hypot(loadCase.Hx, loadCase.Hz);
      const normal = loadCase.P + state.results.summary.appliedServiceFoundationWeight;
      const resisting = Math.max(normal, 0) * Math.max(state.materials.soilFrictionCoefficient, 0);
      const available = resisting / SERVICE_SLIDING_SAFETY_FACTOR;
      const fs = horizontal > EPS ? resisting / horizontal : Number.POSITIVE_INFINITY;
      return calc(`Service sliding - ${loadName(loadCase)}`, [
        String.raw`H = \sqrt{H_x^2 + H_z^2}`,
        String.raw`H = \sqrt{${q(loadCase.Hx, "kN")}^2 + ${q(loadCase.Hz, "kN")}^2} = ${q(horizontal, "kN")}`,
        String.raw`N = P + W_f + \eta_{s,svc}W_s = ${q(normal, "kN")}`,
        String.raw`H_{allow} = \frac{\mu N}{1.5} = \frac{${num(state.materials.soilFrictionCoefficient, 2)} \times ${q(normal, "kN")}}{1.5} = ${q(available, "kN")}`,
        String.raw`FS = ${Number.isFinite(fs) ? num(fs, 2) : String.raw`\infty`}`,
      ]);
    })
    .join("");
}

function rigidityCalculations(state: FootingReportState, data: ReturnType<typeof derived>) {
  if (state.results.rigidity.elasticLength === null) {
    return calc("Rigidity advisory", [
      String.raw`L_e = \left(\frac{E_c h^3}{3k_s}\right)^{1/4}`,
      String.raw`\text{Rigidity not classified because }E_c\text{ or }k_s\text{ is missing/nonpositive.}`,
    ]);
  }
  return calc("Rigidity advisory", [
    String.raw`L_e = \left(\frac{E_c h^3}{3k_s}\right)^{1/4}`,
    String.raw`L_e = \left(\frac{${q(state.materials.concreteElasticModulus * 1000, "kN/m^2")} \times ${q(state.geometry.footingThickness, "m")}^3}{3 \times ${q(state.materials.subgradeReactionModulus, "kN/m^3")}}\right)^{1/4} = ${q(state.results.rigidity.elasticLength, "m")}`,
    String.raw`L_x = ${q(data.projectionX, "m")};\quad L_z = ${q(data.projectionZ, "m")}`,
    String.raw`\frac{L_x}{L_e} = ${num(state.results.rigidity.ratioX ?? 0)};\quad \frac{L_z}{L_e} = ${num(state.results.rigidity.ratioZ ?? 0)};\quad \text{limit}=1.75`,
  ]);
}

function depthAndSteelCalculations(
  state: FootingReportState,
  data: ReturnType<typeof derived>,
  isAci: boolean
) {
  const asMinRule = isAci
    ? state.materials.rebarYield < 420
      ? String.raw`A_{s,min}=0.002A_g`
      : String.raw`A_{s,min}=\max\left(0.0018\frac{420}{f_y},0.0014\right)A_g`
    : String.raw`A_{s,min}=0.002A_g`;
  return calc("Effective depth and reinforcement", [
    String.raw`d_{x,single}=1000h-c_c-\frac{d_{b,x}}{2} = ${q(data.dXSingle, "mm")}`,
    String.raw`d_{z,single}=1000h-c_c-\frac{d_{b,z}}{2} = ${q(data.dZSingle, "mm")}`,
    String.raw`d_{conservative}=1000h-c_c-d_{b,larger}-\frac{d_{b,smaller}}{2} = ${q(data.dConservative, "mm")}`,
    String.raw`d_x = \min(d_{x,single},d_{conservative}) = ${q(state.results.summary.effectiveDepthX, "mm")}`,
    String.raw`d_z = \min(d_{z,single},d_{conservative}) = ${q(state.results.summary.effectiveDepthZ, "mm")}`,
    String.raw`A_{s,x} = \frac{\pi d_{b,x}^2}{4s_x}1000 = ${q(state.results.summary.providedAsX, "mm^2/m")}`,
    String.raw`A_{s,z} = \frac{\pi d_{b,z}^2}{4s_z}1000 = ${q(state.results.summary.providedAsZ, "mm^2/m")}`,
    asMinRule,
    String.raw`A_{s,min,x} = ${q(state.results.summary.minimumAsX, "mm^2/m")};\quad A_{s,min,z} = ${q(state.results.summary.minimumAsZ, "mm^2/m")}`,
  ]);
}

function strengthPressureCalculations(state: FootingReportState) {
  if (state.strengthLoadCases.length === 0) {
    return calc("Strength net pressure", String.raw`\text{No strength load cases entered.}`);
  }
  return state.strengthLoadCases
    .map((loadCase) => {
      const row = state.results.strengthCases.find((item) => item.id === loadCase.id);
      const loadMoments = loadMomentsAtFootingCenter(loadCase, state.geometry);
      const data = derived(state);
      const factor = Math.max(loadCase.foundationDeadLoadFactor, 0);
      const soilFactors = soilTreatmentFactors(state.soilTreatmentMode);
      const grossMoments = addSoilWeightMoments(
        loadMoments,
        state.results.summary.soilOverburdenWeight,
        data.soilCentroidX,
        data.soilCentroidZ,
        factor * soilFactors.strength
      );
      return calc(`Strength actions - ${loadName(loadCase)}`, [
        String.raw`D_f = ${num(factor, 3)}`,
        String.raw`\eta_{s,u} = ${num(soilFactors.strength, 0)}`,
        String.raw`M_{x,g}^* = M_x + H_z h_p + P e_z + D_f\eta_{s,u}W_s z_s = ${q(grossMoments.mx, "kN m")}`,
        String.raw`M_{z,g}^* = M_z - H_x h_p - P e_x - D_f\eta_{s,u}W_s x_s = ${q(grossMoments.mz, "kN m")}`,
        String.raw`N_g = P + D_f(W_f + \eta_{s,u}W_s)`,
        String.raw`q_g = \frac{N_g}{A} \pm \frac{M_{x,g}^*}{S_x} \pm \frac{M_{z,g}^*}{S_z}`,
        String.raw`q_{g,max} = ${q(row?.maxGrossBearing ?? 0, "kPa")};\quad q_{g,min} = ${q(row?.minGrossBearing ?? 0, "kPa")}`,
        String.raw`q_{net} = q_g - D_f\gamma_c h - D_f\eta_{s,u}\gamma_s h_s\quad\text{over soil rectangles}`,
        String.raw`q_{net,max} = ${q(row?.maxNetPressure ?? 0, "kPa")};\quad q_{net,min} = ${q(row?.minNetPressure ?? 0, "kPa")}`,
        String.raw`M_{u,x} = ${q(row?.flexureX ?? 0, "kN m/m")};\quad M_{u,z} = ${q(row?.flexureZ ?? 0, "kN m/m")}`,
        String.raw`V_{u,x} = ${q(row?.oneWayShearX ?? 0, "kN/m")};\quad V_{u,z} = ${q(row?.oneWayShearZ ?? 0, "kN/m")}`,
      ]);
    })
    .join("");
}

function flexureCapacityCalculations(
  state: FootingReportState,
  data: ReturnType<typeof derived>,
  isAci: boolean
) {
  const b = 1000;
  const asX = state.results.summary.providedAsX;
  const asZ = state.results.summary.providedAsZ;
  const dx = state.results.summary.effectiveDepthX;
  const dz = state.results.summary.effectiveDepthZ;
  const fc = state.materials.concreteStrength;
  const fy = state.materials.rebarYield;
  const aciAX = (asX * fy) / Math.max(0.85 * fc * b, EPS);
  const aciAZ = (asZ * fy) / Math.max(0.85 * fc * b, EPS);
  const csaAX = (0.85 * asX * fy) / Math.max(data.alpha1 * 0.65 * fc * b, EPS);
  const csaAZ = (0.85 * asZ * fy) / Math.max(data.alpha1 * 0.65 * fc * b, EPS);
  if (isAci) {
    return calc("ACI flexural capacity", [
      String.raw`b = ${q(b, "mm")}`,
      String.raw`a_x = \frac{A_{s,x}f_y}{0.85 f'_c b} = ${q(aciAX, "mm")}`,
      String.raw`a_z = \frac{A_{s,z}f_y}{0.85 f'_c b} = ${q(aciAZ, "mm")}`,
      String.raw`\phi M_{n,x}=0.90 A_{s,x}f_y\left(d_x-\frac{a_x}{2}\right)`,
      String.raw`\phi M_{n,x}=0.90(${q(asX, "mm^2/m")})(${q(fy, "MPa")})\left(${q(dx, "mm")}-\frac{${q(aciAX, "mm")}}{2}\right)= ${q(checkById(state, "flexure-x")?.capacity ?? 0, "kN m/m")}`,
      String.raw`\phi M_{n,z}=0.90 A_{s,z}f_y\left(d_z-\frac{a_z}{2}\right)`,
      String.raw`\phi M_{n,z}=0.90(${q(asZ, "mm^2/m")})(${q(fy, "MPa")})\left(${q(dz, "mm")}-\frac{${q(aciAZ, "mm")}}{2}\right)= ${q(checkById(state, "flexure-z")?.capacity ?? 0, "kN m/m")}`,
      String.raw`A_{s,req,x} = ${q(requiredSteel(state.concreteStandard, checkById(state, "flexure-x")?.demand ?? 0, state.results.summary.effectiveDepthX, state.materials.concreteStrength, state.materials.rebarYield), "mm^2/m")}`,
      String.raw`A_{s,req,z} = ${q(requiredSteel(state.concreteStandard, checkById(state, "flexure-z")?.demand ?? 0, state.results.summary.effectiveDepthZ, state.materials.concreteStrength, state.materials.rebarYield), "mm^2/m")}`,
    ]);
  }
  return calc("CSA flexural capacity", [
    String.raw`\alpha_1 = \max(0.85-0.0015f'_c,0.67) = ${num(data.alpha1, 3)}`,
    String.raw`\phi_s = 0.85;\quad \phi_c = 0.65`,
    String.raw`b = ${q(b, "mm")}`,
    String.raw`a_x = \frac{\phi_s A_{s,x}f_y}{\alpha_1\phi_c f'_c b} = ${q(csaAX, "mm")}`,
    String.raw`a_z = \frac{\phi_s A_{s,z}f_y}{\alpha_1\phi_c f'_c b} = ${q(csaAZ, "mm")}`,
    String.raw`M_{r,x}= \phi_s A_{s,x}f_y\left(d_x-\frac{a_x}{2}\right)`,
    String.raw`M_{r,x}=0.85(${q(asX, "mm^2/m")})(${q(fy, "MPa")})\left(${q(dx, "mm")}-\frac{${q(csaAX, "mm")}}{2}\right)= ${q(checkById(state, "flexure-x")?.capacity ?? 0, "kN m/m")}`,
    String.raw`M_{r,z}= \phi_s A_{s,z}f_y\left(d_z-\frac{a_z}{2}\right)`,
    String.raw`M_{r,z}=0.85(${q(asZ, "mm^2/m")})(${q(fy, "MPa")})\left(${q(dz, "mm")}-\frac{${q(csaAZ, "mm")}}{2}\right)= ${q(checkById(state, "flexure-z")?.capacity ?? 0, "kN m/m")}`,
    String.raw`A_{s,req,x} = ${q(requiredSteel(state.concreteStandard, checkById(state, "flexure-x")?.demand ?? 0, state.results.summary.effectiveDepthX, state.materials.concreteStrength, state.materials.rebarYield), "mm^2/m")}`,
    String.raw`A_{s,req,z} = ${q(requiredSteel(state.concreteStandard, checkById(state, "flexure-z")?.demand ?? 0, state.results.summary.effectiveDepthZ, state.materials.concreteStrength, state.materials.rebarYield), "mm^2/m")}`,
  ]);
}

function oneWayShearCalculations(state: FootingReportState, isAci: boolean) {
  const root = concreteShearRoot(state.concreteStandard, state.materials.concreteStrength);
  if (isAci) {
    return calc("ACI one-way shear capacity", [
      String.raw`\sqrt{f'_c} \le 8.3\text{ MPa};\quad \sqrt{f'_c}_{used} = ${q(root, "MPa^{1/2}")}`,
      String.raw`\phi V_c = 0.75(0.17)\sqrt{f'_c}bd`,
      String.raw`\phi V_{c,x} = ${q(checkById(state, "one-way-shear-x")?.capacity ?? 0, "kN/m")}`,
      String.raw`\phi V_{c,z} = ${q(checkById(state, "one-way-shear-z")?.capacity ?? 0, "kN/m")}`,
    ]);
  }
  return calc("CSA one-way shear capacity", [
    String.raw`\sqrt{f'_c} \le 8.0\text{ MPa};\quad \sqrt{f'_c}_{used} = ${q(root, "MPa^{1/2}")}`,
    String.raw`V_r = 0.19\phi_c\lambda_s\sqrt{f'_c}bd`,
    String.raw`V_{r,x} = ${q(checkById(state, "one-way-shear-x")?.capacity ?? 0, "kN/m")}`,
    String.raw`V_{r,z} = ${q(checkById(state, "one-way-shear-z")?.capacity ?? 0, "kN/m")}`,
  ]);
}

function punchingCalculations(state: FootingReportState, isAci: boolean) {
  const row = governingPunchingRow(state);
  if (!row) return calc("Punching shear", String.raw`\text{No strength load cases entered.}`);
  const check = checkById(state, "punching-shear");
  const basis = isAci
    ? String.raw`\phi v_c = 0.75\min\left(0.33\sqrt{f'_c},\;0.17(1+2/\beta)\sqrt{f'_c},\;0.083(2+\alpha_s d/b_o)\sqrt{f'_c}\right)`
    : String.raw`v_r = \min\left(0.19(1+2/\beta)\phi_c\lambda_s\sqrt{f'_c},\;(0.19+\alpha_s d/b_o)\phi_c\lambda_s\sqrt{f'_c},\;0.38\phi_c\lambda_s\sqrt{f'_c}\right)`;
  return calc("Punching shear", [
    String.raw`\text{Governing case: }${texText(row.name)}`,
    String.raw`v_u = v_{direct} + v_{M_x} + v_{M_z}`,
    String.raw`v_u = ${q(row.punchingStress, "MPa")}`,
    String.raw`\text{Critical perimeter at }d/2\text{ from pedestal face; moment-transfer stress included.}`,
    basis,
    String.raw`v_{capacity} = ${q(check?.capacity ?? 0, "MPa")}`,
  ]);
}

function csaDuctilityCalculations(state: FootingReportState, data: ReturnType<typeof derived>) {
  return calc("CSA flexural ductility", [
    String.raw`\alpha_1 = ${num(data.alpha1, 3)};\quad \beta_1 = ${num(data.beta1, 3)}`,
    String.raw`c = \frac{\phi_s A_s f_y}{\alpha_1\phi_c f'_c b\beta_1}`,
    String.raw`c_{limit} = 0.8\frac{700}{700+f_y}d`,
    String.raw`c_x = ${q(checkById(state, "ductility-x")?.demand ?? 0, "mm")};\quad c_{limit,x} = ${q(checkById(state, "ductility-x")?.capacity ?? 0, "mm")}`,
    String.raw`c_z = ${q(checkById(state, "ductility-z")?.demand ?? 0, "mm")};\quad c_{limit,z} = ${q(checkById(state, "ductility-z")?.capacity ?? 0, "mm")}`,
  ]);
}

function checkCalc(state: FootingReportState, id: string) {
  const item = checkById(state, id);
  if (!item) return "";
  const ratio =
    item.utilization === null
      ? "\\text{N/A}"
      : Number.isFinite(item.utilization)
        ? num(item.utilization, 3)
        : String.raw`\infty`;
  return calc(item.label, [
    String.raw`\text{Basis: }${basisTex(item.basis)}`,
    String.raw`\text{Demand} = ${item.demand === null ? "\\text{N/A}" : q(item.demand, unitTex(item.unit))}`,
    String.raw`\text{Capacity} = ${item.capacity === null ? "\\text{N/A}" : q(item.capacity, unitTex(item.unit))}`,
    String.raw`\frac{D}{C} = ${ratio}\quad\left(${texText(statusLabel(item.status))}\right)`,
    String.raw`\text{Governing case: }${texText(item.governingCase)}`,
    ...item.details.map(detailTex),
    ...item.notes.map((note) => String.raw`\text{${escapeTex(note)}}`),
  ]);
}

function detailTex(detail: string) {
  const normal = detail.match(/^N = ([0-9.,-]+) kN including footing self-weight(?: and (?:applied service )?soil overburden)?\.$/);
  if (normal) {
    return String.raw`N = ${formatTexNumber(normal[1])}\,\mathrm{kN}\quad\text{including footing self-weight and applied service soil overburden}`;
  }

  const moments = detail.match(/^Mx = ([0-9.,-]+) kN-m, Mz = ([0-9.,-]+) kN-m at footing center\.$/);
  if (moments) {
    return String.raw`M_x = ${formatTexNumber(moments[1])}\,\mathrm{kN\cdot m},\quad M_z = ${formatTexNumber(moments[2])}\,\mathrm{kN\cdot m}\quad\text{at footing center}`;
  }

  const qmin = detail.match(/^qmin = ([0-9.,-]+) kPa\.$/);
  if (qmin) {
    return String.raw`q_{min} = ${formatTexNumber(qmin[1])}\,\mathrm{kPa}`;
  }

  const fs = detail.match(/^FS = ([0-9.,-]+|infinite)\.$/);
  if (fs) {
    return String.raw`\mathrm{FS} = ${fs[1] === "infinite" ? String.raw`\infty` : formatTexNumber(fs[1])}`;
  }

  const depths = detail.match(/^dX = ([0-9.,-]+) mm, dZ = ([0-9.,-]+) mm using conservative upper-layer depth for a two-layer orthogonal mat\.$/);
  if (depths) {
    return String.raw`d_x = ${formatTexNumber(depths[1])}\,\mathrm{mm},\quad d_z = ${formatTexNumber(depths[2])}\,\mathrm{mm}\quad\text{using conservative upper-layer depth}`;
  }

  const asX = detail.match(/^Provided AsX = ([0-9.,-]+) mm2\/m\.$/);
  if (asX) {
    return String.raw`A_{s,x} = ${formatTexNumber(asX[1])}\,\mathrm{mm^2/m}`;
  }

  const asZ = detail.match(/^Provided AsZ = ([0-9.,-]+) mm2\/m\.$/);
  if (asZ) {
    return String.raw`A_{s,z} = ${formatTexNumber(asZ[1])}\,\mathrm{mm^2/m}`;
  }

  const side = detail.match(/^Critical side = ([^.]+)\.$/);
  if (side) {
    return String.raw`\text{Critical side} = \text{${escapeTex(side[1])}}`;
  }

  const requiredAs = detail.match(/^Required As = ([0-9.,-]+) mm2\/m; provided As = ([0-9.,-]+) mm2\/m\.$/);
  if (requiredAs) {
    return String.raw`A_{s,req} = ${formatTexNumber(requiredAs[1])}\,\mathrm{mm^2/m},\quad A_s = ${formatTexNumber(requiredAs[2])}\,\mathrm{mm^2/m}`;
  }

  const cLimit = detail.match(/^c = ([0-9.,-]+) mm, limit = ([0-9.,-]+) mm\.$/);
  if (cLimit) {
    return String.raw`c = ${formatTexNumber(cLimit[1])}\,\mathrm{mm},\quad c_{limit} = ${formatTexNumber(cLimit[2])}\,\mathrm{mm}`;
  }

  const support = detail.match(/^Support condition = ([^.]+)\.$/);
  if (support) {
    return String.raw`\text{Support condition} = \text{${escapeTex(support[1])}}`;
  }

  const punchingGeometry = detail.match(/^bo = ([0-9.,-]+) mm, d = ([0-9.,-]+) mm\.$/);
  if (punchingGeometry) {
    return String.raw`b_o = ${formatTexNumber(punchingGeometry[1])}\,\mathrm{mm},\quad d = ${formatTexNumber(punchingGeometry[2])}\,\mathrm{mm}`;
  }

  const punchingStress = detail.match(
    /^vu direct = ([0-9.,-]+) MPa, vu\(Mx\) = ([0-9.,-]+) MPa, vu\(Mz\) = ([0-9.,-]+) MPa\.$/
  );
  if (punchingStress) {
    return String.raw`v_{u,direct} = ${formatTexNumber(punchingStress[1])}\,\mathrm{MPa},\quad v_u(M_x) = ${formatTexNumber(punchingStress[2])}\,\mathrm{MPa},\quad v_u(M_z) = ${formatTexNumber(punchingStress[3])}\,\mathrm{MPa}`;
  }

  return texText(detail);
}

function basisTex(basis: string) {
  if (basis.includes("tension-controlled flexure with phi = 0.90")) {
    return String.raw`${texText(basis.split("phi = 0.90")[0])}\phi = 0.90${texText(basis.split("phi = 0.90")[1] ?? "")}`;
  }
  if (basis.includes("factored flexure using phi_c = 0.65 and phi_s = 0.85")) {
    return String.raw`${texText(basis.split("phi_c")[0])}\phi_c = 0.65\text{ and }\phi_s = 0.85${texText(basis.split("0.85")[1] ?? "")}`;
  }
  if (basis.includes("phi Vc = 0.75 x 0.17 lambda sqrt(fc') bw d")) {
    return String.raw`${texText(basis.split("phi Vc")[0])}\phi V_c = 0.75 \times 0.17\lambda\sqrt{f'_c}b_wd`;
  }
  if (basis.includes("phi vc = 0.75 x least concrete two-way shear stress")) {
    return String.raw`${texText(basis.split("phi vc")[0])}\phi v_c = 0.75 \times \text{least concrete two-way shear stress}`;
  }
  return texText(basis);
}

function denseGrid(rows: ReportRow[]) {
  const sorted = [...rows].sort((a, b) => sortKey(a.key).localeCompare(sortKey(b.key)));
  return `<div class="dense-grid">
    <div class="head">Quantity</div><div class="head num">Value</div><div class="head unit-col">Unit</div><div class="head ref-col">Ref</div>
    ${sorted
      .map(
        (row) => `
          <div>${math(row.symbol)} ${esc(row.label)}</div>
          <div class="num">${esc(row.value)}</div>
          <div class="unit-col">${esc(row.unit)}</div>
          <div class="ref-col">${esc(row.reference ?? "")}</div>`
      )
      .join("")}
  </div>`;
}

function inputRows(state: FootingReportState): ReportRow[] {
  const u = units(state.units);
  return [
    { key: "A-qa", symbol: "q_a", label: "allowable bearing", value: f(convert(state.materials.allowableBearing, "kPa", state.units), 3), unit: u.pressure },
    { key: "B-Bx", symbol: "B_x", label: "footing length", value: f(convert(state.geometry.footingLength, "m", state.units), 3), unit: u.length },
    { key: "B-Bz", symbol: "B_z", label: "footing width", value: f(convert(state.geometry.footingWidth, "m", state.units), 3), unit: u.length },
    { key: "C-cover", symbol: "c_c", label: "clear cover", value: f(convert(state.materials.clearCover, "mm", state.units), 3), unit: u.cover },
    { key: "D-dbx", symbol: "d_{b,x}", label: "X bar diameter", value: f(convert(state.reinforcement.barDiameterX, "mm", state.units), 3), unit: u.cover },
    { key: "D-dbz", symbol: "d_{b,z}", label: "Z bar diameter", value: f(convert(state.reinforcement.barDiameterZ, "mm", state.units), 3), unit: u.cover },
    { key: "E-Ec", symbol: "E_c", label: "concrete modulus", value: f(convert(state.materials.concreteElasticModulus, "MPa", state.units), 3), unit: u.stress },
    { key: "F-fc", symbol: "f'_c", label: "concrete strength", value: f(convert(state.materials.concreteStrength, "MPa", state.units), 3), unit: u.stress },
    { key: "F-fy", symbol: "f_y", label: "rebar yield", value: f(convert(state.materials.rebarYield, "MPa", state.units), 3), unit: u.stress },
    { key: "H-h", symbol: "h", label: "footing thickness", value: f(convert(state.geometry.footingThickness, "m", state.units), 3), unit: u.length },
    { key: "H-hp", symbol: "h_p", label: "pedestal height", value: f(convert(state.geometry.pedestalHeight, "m", state.units), 3), unit: u.length },
    { key: "H-hs", symbol: "h_s", label: "soil cover depth", value: f(convert(state.geometry.soilCoverDepth, "m", state.units), 3), unit: u.length },
    { key: "K-ks", symbol: "k_s", label: "subgrade reaction", value: f(convert(state.materials.subgradeReactionModulus, "kN/m3", state.units), 3), unit: u.subgrade },
    { key: "L-Lpx", symbol: "L_{p,x}", label: "pedestal length", value: f(convert(state.geometry.pedestalLength, "m", state.units), 3), unit: u.length },
    { key: "L-Lpz", symbol: "L_{p,z}", label: "pedestal width", value: f(convert(state.geometry.pedestalWidth, "m", state.units), 3), unit: u.length },
    { key: "S-sx", symbol: "s_x", label: "X bar spacing", value: f(convert(state.reinforcement.barSpacingX, "mm", state.units), 3), unit: u.cover },
    { key: "S-sz", symbol: "s_z", label: "Z bar spacing", value: f(convert(state.reinforcement.barSpacingZ, "mm", state.units), 3), unit: u.cover },
    { key: "S-soil-treatment", symbol: "\\eta_s", label: "soil treatment", value: soilTreatmentLabel(state.soilTreatmentMode), unit: "" },
    { key: "X-ex", symbol: "e_x", label: "pedestal offset X", value: f(convert(state.geometry.pedestalOffsetX, "m", state.units), 3), unit: u.length },
    { key: "Z-ez", symbol: "e_z", label: "pedestal offset Z", value: f(convert(state.geometry.pedestalOffsetZ, "m", state.units), 3), unit: u.length },
    { key: "zz-gamma", symbol: "\\gamma_c", label: "concrete unit weight", value: f(convert(state.materials.concreteUnitWeight, "kN/m3", state.units), 3), unit: u.unitWeight },
    { key: "zz-gamma-s", symbol: "\\gamma_s", label: "soil unit weight", value: f(convert(state.materials.soilUnitWeight, "kN/m3", state.units), 3), unit: u.unitWeight },
    { key: "zz-mu", symbol: "\\mu", label: "soil friction coefficient", value: f(state.materials.soilFrictionCoefficient, 3), unit: "" },
  ];
}

function computedRows(state: FootingReportState): ReportRow[] {
  const u = units(state.units);
  const data = derived(state);
  const governingService = maxBy(state.results.serviceBearing, (row) => row.maxBearing);
  const governingStrength = maxBy(state.results.strengthCases, (row) => row.maxNetPressure);
  return [
    { key: "A-area", symbol: "A", label: "footing plan area", value: f(convert(data.area, "m2", state.units), 3), unit: u.area },
    { key: "A-As-min-x", symbol: "A_{s,min,x}", label: "minimum X steel", value: f(convert(state.results.summary.minimumAsX, "mm2/m", state.units), 0), unit: u.steel },
    { key: "A-As-min-z", symbol: "A_{s,min,z}", label: "minimum Z steel", value: f(convert(state.results.summary.minimumAsZ, "mm2/m", state.units), 0), unit: u.steel },
    { key: "A-As-x", symbol: "A_{s,x}", label: "provided X steel", value: f(convert(state.results.summary.providedAsX, "mm2/m", state.units), 0), unit: u.steel },
    { key: "A-As-z", symbol: "A_{s,z}", label: "provided Z steel", value: f(convert(state.results.summary.providedAsZ, "mm2/m", state.units), 0), unit: u.steel },
    { key: "D-davg", symbol: "d_{avg}", label: "average shear depth", value: f(convert(state.results.summary.averageShearDepth, "mm", state.units), 1), unit: u.cover },
    { key: "D-dx", symbol: "d_x", label: "effective depth X", value: f(convert(state.results.summary.effectiveDepthX, "mm", state.units), 1), unit: u.cover },
    { key: "D-dz", symbol: "d_z", label: "effective depth Z", value: f(convert(state.results.summary.effectiveDepthZ, "mm", state.units), 1), unit: u.cover },
    { key: "L-Le", symbol: "L_e", label: "elastic length", value: state.results.rigidity.elasticLength === null ? "N/A" : f(convert(state.results.rigidity.elasticLength, "m", state.units), 3), unit: u.length },
    { key: "Q-qmax", symbol: "q_{max}", label: "max service bearing", value: governingService ? f(convert(governingService.maxBearing, "kPa", state.units), 3) : "N/A", unit: u.pressure },
    { key: "Q-qnet", symbol: "q_{net,max}", label: "max strength net pressure", value: governingStrength ? f(convert(governingStrength.maxNetPressure, "kPa", state.units), 3) : "N/A", unit: u.pressure },
    { key: "S-status", symbol: "\\text{Status}", label: "overall status", value: statusLabel(state.results.summary.overallStatus), unit: "" },
    { key: "V-volume", symbol: "V_c", label: "concrete volume", value: f(convert(data.volume, "m3", state.units), 3), unit: u.volume },
    { key: "W-self", symbol: "W_f", label: "footing self-weight", value: f(convert(state.results.summary.footingSelfWeight, "kN", state.units), 3), unit: u.force },
    { key: "W-soil", symbol: "W_s", label: "soil overburden", value: f(convert(state.results.summary.soilOverburdenWeight, "kN", state.units), 3), unit: u.force },
    { key: "W-total", symbol: "W_{svc}", label: "applied service foundation weight", value: f(convert(state.results.summary.appliedServiceFoundationWeight, "kN", state.units), 3), unit: u.force },
  ];
}

function loadCasesTable(state: FootingReportState, kind: "service" | "strength") {
  const rows = kind === "service" ? state.serviceLoadCases : state.strengthLoadCases;
  const u = units(state.units);
  if (rows.length === 0) return `<p class="warn-text">No ${kind} load cases entered.</p>`;
  return `<table>
    <thead><tr>
      <th>Case</th><th class="num">${math("P")} (${esc(u.force)})</th><th class="num">${math("H_x")} (${esc(u.force)})</th><th class="num">${math("H_z")} (${esc(u.force)})</th><th class="num">${math("M_x")} (${esc(u.moment)})</th><th class="num">${math("M_z")} (${esc(u.moment)})</th><th class="num">${math("T")} (${esc(u.moment)})</th>${kind === "strength" ? `<th class="num">${math("D_f")}</th>` : ""}
    </tr></thead>
    <tbody>
      ${rows
        .map(
          (row) => `<tr>
            <td>${esc(loadName(row))}</td>
            <td class="num">${f(convert(row.P, "kN", state.units), 3)}</td>
            <td class="num">${f(convert(row.Hx, "kN", state.units), 3)}</td>
            <td class="num">${f(convert(row.Hz, "kN", state.units), 3)}</td>
            <td class="num">${f(convert(row.Mx, "kN-m", state.units), 3)}</td>
            <td class="num">${f(convert(row.Mz, "kN-m", state.units), 3)}</td>
            <td class="num">${f(convert(row.T, "kN-m", state.units), 3)}</td>
            ${kind === "strength" ? `<td class="num">${f(row.foundationDeadLoadFactor, 3)}</td>` : ""}
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function checkSummaryTable(state: FootingReportState) {
  return `<table>
    <thead>
      <tr><th>Check</th><th>Status</th><th class="num">Demand</th><th class="num">Capacity</th><th class="num">D/C</th><th>Governing case</th><th>Basis / notes</th></tr>
    </thead>
    <tbody>
      ${state.results.checks
        .map(
          (check) => `<tr>
            <td>${esc(check.label)}</td>
            <td>${statusPill(check.status)}</td>
            <td class="num">${valueWithUnit(check.demand, check.unit, state.units)}</td>
            <td class="num">${valueWithUnit(check.capacity, check.unit, state.units)}</td>
            <td class="num">${check.utilization === null ? "N/A" : Number.isFinite(check.utilization) ? f(check.utilization, 2) : "&infin;"}</td>
            <td>${mathText(check.governingCase)}</td>
            <td>${mathText(check.basis)}${check.details.length ? `<br>${check.details.map(mathText).join("<br>")}` : ""}${check.notes.length ? `<br><span class="warn-text">${check.notes.map(mathText).join("<br>")}</span>` : ""}</td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function traceMapTable(
  state: FootingReportState,
  flags: { isAci: boolean; isIbc: boolean; hasTorsion: boolean }
) {
  const rows = [
    ["Code basis", flags.isIbc ? `${state.buildingCode} with ${state.loadStandard}` : `${state.buildingCode} with NBCC load combinations`, "Building code selects concrete/load standard pairing."],
    ["Geometry", "Footing plan, pedestal footprint, offsets, and thickness", "Drives area, section moduli, effective depths, critical sections."],
    ["Self-weight", "Concrete volume times concrete unit weight", "Included in service bearing/sliding normal force."],
    ["Service bearing", "All service load cases", "Worst qmax controls bearing; qmin controls no-uplift."],
    ["Sliding", "All service load cases", "Worst H/(mu N / 1.5) controls."],
    ["Rigidity", "ACI 336 advisory", "Rigid, flexible, or needs ks/Ec."],
    ["Concrete family", flags.isAci ? "ACI branch taken" : "CSA branch taken", flags.isAci ? "CSA ductility not applicable." : "CSA ductility checks included."],
    ["Strength actions", "All strength load cases", "Worst flexure, one-way shear, and punching demands govern separately."],
    ["Punching", "Critical perimeter at d/2", "Direct shear plus moment-transfer stress."],
    ["Torsion", flags.hasTorsion ? "Warning included" : "No nonzero T", "T is listed but not included in footing capacity checks."],
  ];
  return `<table><thead><tr><th>Step</th><th>What is evaluated</th><th>Decision/result</th></tr></thead><tbody>${rows
    .map((row) => `<tr><td>${esc(row[0])}</td><td>${esc(row[1])}</td><td>${esc(row[2])}</td></tr>`)
    .join("")}</tbody></table>`;
}

function warningList(state: FootingReportState) {
  const warnings = state.results.checks.flatMap((check) => [
    ...(check.status === "warning" ? [`${check.label}: ${check.basis}`] : []),
    ...check.notes.map((note) => `${check.label}: ${note}`),
  ]);
  return warnings.length
    ? `<ul>${warnings.map((warning) => `<li class="warn-text">${mathText(warning)}</li>`).join("")}</ul>`
    : "";
}

function decision(args: { title: string; branches: DecisionBranch[] }) {
  return `<div class="decision">
    <div class="decision-title">Decision &middot; ${esc(args.title)}</div>
    <div class="branches">
      ${args.branches
        .map(
          (branch) => `<div class="branch ${branch.active ? "active" : "inactive"}">
            <span class="branch-mark">${branch.active ? "taken" : "not taken"}</span>
            <span>${math(branch.condition)}</span>
            <span><strong>${esc(branch.label)}</strong> &rarr; ${esc(branch.consequence)}</span>
          </div>`
        )
        .join("")}
    </div>
  </div>`;
}

function calc(title: string, equations: string | string[]) {
  const lines = Array.isArray(equations) ? equations : [equations];
  return `<div class="calc">
    <div class="calc-title">${esc(title)}</div>
    ${lines
      .map(
        (equation) => `<div class="latex-line">
          <div class="latex-formula">${math(equation, true)}</div>
        </div>`
      )
      .join("")}
  </div>`;
}

function derived(state: FootingReportState) {
  const length = positive(state.geometry.footingLength);
  const width = positive(state.geometry.footingWidth);
  const area = length * width;
  const volume = area * positive(state.geometry.footingThickness);
  const footing = {
    xMin: -length / 2,
    xMax: length / 2,
    zMin: -width / 2,
    zMax: width / 2,
  };
  const pedestal = {
    xMin: Math.max(
      footing.xMin,
      state.geometry.pedestalOffsetX - state.geometry.pedestalLength / 2
    ),
    xMax: Math.min(
      footing.xMax,
      state.geometry.pedestalOffsetX + state.geometry.pedestalLength / 2
    ),
    zMin: Math.max(
      footing.zMin,
      state.geometry.pedestalOffsetZ - state.geometry.pedestalWidth / 2
    ),
    zMax: Math.min(
      footing.zMax,
      state.geometry.pedestalOffsetZ + state.geometry.pedestalWidth / 2
    ),
  };
  const pedestalArea =
    pedestal.xMax > pedestal.xMin && pedestal.zMax > pedestal.zMin
      ? (pedestal.xMax - pedestal.xMin) * (pedestal.zMax - pedestal.zMin)
      : 0;
  const pedestalFirstX =
    pedestalArea > EPS
      ? ((pedestal.xMax ** 2 - pedestal.xMin ** 2) / 2) *
        (pedestal.zMax - pedestal.zMin)
      : 0;
  const pedestalFirstZ =
    pedestalArea > EPS
      ? ((pedestal.zMax ** 2 - pedestal.zMin ** 2) / 2) *
        (pedestal.xMax - pedestal.xMin)
      : 0;
  const soilArea = Math.max(area - pedestalArea, 0);
  const soilCoverDepth = Math.max(state.geometry.soilCoverDepth, 0);
  const soilVolume = soilArea * soilCoverDepth;
  const soilCentroidX = soilArea > EPS ? -pedestalFirstX / soilArea : 0;
  const soilCentroidZ = soilArea > EPS ? -pedestalFirstZ / soilArea : 0;
  const sx = (length * width ** 2) / 6;
  const sz = (width * length ** 2) / 6;
  const dXSingle = Math.max(
    state.geometry.footingThickness * 1000 -
      Math.max(state.materials.clearCover, 0) -
      positive(state.reinforcement.barDiameterX) / 2,
    0
  );
  const dZSingle = Math.max(
    state.geometry.footingThickness * 1000 -
      Math.max(state.materials.clearCover, 0) -
      positive(state.reinforcement.barDiameterZ) / 2,
    0
  );
  const largerBar = Math.max(
    positive(state.reinforcement.barDiameterX),
    positive(state.reinforcement.barDiameterZ)
  );
  const smallerBar = Math.min(
    positive(state.reinforcement.barDiameterX),
    positive(state.reinforcement.barDiameterZ)
  );
  const dConservative = Math.max(
    state.geometry.footingThickness * 1000 -
      Math.max(state.materials.clearCover, 0) -
      largerBar -
      smallerBar / 2,
    0
  );
  const projectionX = Math.max(
    length / 2 -
      (state.geometry.pedestalOffsetX + state.geometry.pedestalLength / 2),
    state.geometry.pedestalOffsetX -
      state.geometry.pedestalLength / 2 +
      length / 2,
    0
  );
  const projectionZ = Math.max(
    width / 2 -
      (state.geometry.pedestalOffsetZ + state.geometry.pedestalWidth / 2),
    state.geometry.pedestalOffsetZ -
      state.geometry.pedestalWidth / 2 +
      width / 2,
    0
  );
  const alpha1 = Math.max(0.85 - 0.0015 * state.materials.concreteStrength, 0.67);
  const beta1 = Math.max(0.97 - 0.0025 * state.materials.concreteStrength, 0.67);
  return {
    area,
    volume,
    soilArea,
    soilVolume,
    soilCentroidX,
    soilCentroidZ,
    sx,
    sz,
    dXSingle,
    dZSingle,
    dConservative,
    projectionX,
    projectionZ,
    alpha1,
    beta1,
  };
}

function loadMomentsAtFootingCenter(loadCase: EngineLoadCase, geometry: EngineGeometry) {
  return {
    mx:
      loadCase.Mx +
      loadCase.Hz * geometry.pedestalHeight +
      loadCase.P * geometry.pedestalOffsetZ,
    mz:
      loadCase.Mz -
      loadCase.Hx * geometry.pedestalHeight -
      loadCase.P * geometry.pedestalOffsetX,
  };
}

function addSoilWeightMoments(
  moments: ReturnType<typeof loadMomentsAtFootingCenter>,
  soilWeight: number,
  soilCentroidX: number,
  soilCentroidZ: number,
  factor = 1
) {
  const factoredSoilWeight = factor * soilWeight;
  return {
    mx: moments.mx + factoredSoilWeight * soilCentroidZ,
    mz: moments.mz - factoredSoilWeight * soilCentroidX,
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

function requiredSteel(
  standard: ConcreteStandard,
  moment: number,
  depth: number,
  fc: number,
  fy: number
) {
  const b = 1000;
  const muNmm = Math.max(moment, 0) * 1_000_000;
  if (muNmm <= EPS || depth <= EPS) return 0;
  const isAci = standard.startsWith("ACI");
  const phiConcrete = isAci ? 1 : 0.65;
  const phiSteel = isAci ? 1 : 0.85;
  const phiFlexure = isAci ? 0.9 : 1;
  const alpha1 = Math.max(0.85 - 0.0015 * fc, 0.67);
  const concreteFactor = isAci ? 0.85 * fc * b : alpha1 * phiConcrete * fc * b;
  const steelFactor = isAci ? phiFlexure * fy : phiSteel * fy;
  const depthFactor = isAci
    ? fy / (2 * concreteFactor)
    : (phiSteel * fy) / (2 * concreteFactor);
  const discriminant = Math.max(
    depth ** 2 - (4 * depthFactor * muNmm) / Math.max(steelFactor, EPS),
    0
  );
  return Math.max((depth - Math.sqrt(discriminant)) / Math.max(2 * depthFactor, EPS), 0);
}

function concreteShearRoot(standard: ConcreteStandard, fc: number) {
  const root = Math.sqrt(Math.max(fc, 0));
  return standard.startsWith("ACI") ? Math.min(root, 8.3) : Math.min(root, 8);
}

function governingPunchingRow(state: FootingReportState) {
  return state.results.strengthCases.reduce<(typeof state.results.strengthCases)[number] | null>(
    (current, row) =>
      current === null ||
      row.punchingCapacity <= EPS ||
      row.punchingStress / row.punchingCapacity >
        current.punchingStress / Math.max(current.punchingCapacity, EPS)
        ? row
        : current,
    null
  );
}

function checkById(state: FootingReportState, id: string) {
  return state.results.checks.find((check) => check.id === id);
}

function maxBy<T>(values: T[], score: (value: T) => number) {
  return values.reduce<T | null>(
    (current, value) => (current === null || score(value) > score(current) ? value : current),
    null
  );
}

function valueWithUnit(value: number | null, unit: CheckUnit, unitSystem: FootingReportUnitSystem) {
  if (value === null) return "N/A";
  if (!Number.isFinite(value)) return "&infin;";
  const label = displayUnit(unit, unitSystem);
  return `${f(convert(value, unit, unitSystem), displayDigits(unit))}${label ? ` ${esc(label)}` : ""}`;
}

function convert(value: number, unit: CheckUnit | "m" | "m2" | "m3" | "kN-m" | "kN/m3", unitSystem: FootingReportUnitSystem) {
  if (unitSystem === "SI") return value;
  if (unit === "m") return value * M_TO_FT;
  if (unit === "m2") return value * M_TO_FT ** 2;
  if (unit === "m3") return value * M_TO_FT ** 3;
  if (unit === "kPa") return value * KPA_TO_KSF;
  if (unit === "kN") return value * KN_TO_KIP;
  if (unit === "kN/m") return value * KN_PER_M_TO_KIP_PER_FT;
  if (unit === "kN-m" || unit === "kN-m/m") return value * (unit === "kN-m" ? KN_M_TO_KIP_FT : KN_M_PER_M_TO_KIP_FT_PER_FT);
  if (unit === "MPa") return value * MPA_TO_KSI;
  if (unit === "mm") return value * MM_TO_IN;
  if (unit === "mm2/m") return value * MM2_PER_M_TO_IN2_PER_FT;
  if (unit === "kN/m3") return value / 6.365880986;
  return value;
}

function displayUnit(unit: CheckUnit, unitSystem: FootingReportUnitSystem) {
  if (unit === "none" || unit === "ratio") return "";
  if (unitSystem === "SI") {
    if (unit === "mm2/m") return "mm2/m";
    if (unit === "kN-m/m") return "kN m/m";
    return unit;
  }
  if (unit === "kPa") return "ksf";
  if (unit === "kN") return "kip";
  if (unit === "kN/m") return "kip/ft";
  if (unit === "kN-m/m") return "kip ft/ft";
  if (unit === "MPa") return "ksi";
  if (unit === "mm") return "in";
  if (unit === "mm2/m") return "in2/ft";
  return unit;
}

function units(unitSystem: FootingReportUnitSystem) {
  return unitSystem === "SI"
    ? {
        length: "m",
        area: "m2",
        volume: "m3",
        cover: "mm",
        force: "kN",
        moment: "kN m",
        pressure: "kPa",
        stress: "MPa",
        unitWeight: "kN/m3",
        subgrade: "kN/m3",
        steel: "mm2/m",
      }
    : {
        length: "ft",
        area: "ft2",
        volume: "ft3",
        cover: "in",
        force: "kip",
        moment: "kip ft",
        pressure: "ksf",
        stress: "ksi",
        unitWeight: "pcf",
        subgrade: "pci",
        steel: "in2/ft",
      };
}

function unitTex(unit: CheckUnit) {
  if (unit === "kN-m/m") return "kN m/m";
  if (unit === "mm2/m") return "mm^2/m";
  if (unit === "none" || unit === "ratio") return "";
  return unit;
}

function displayDigits(unit: CheckUnit) {
  return ["mm", "mm2/m", "kPa", "kN", "kN/m", "kN-m/m"].includes(unit) ? 0 : 3;
}

function statusPill(status: CheckStatus) {
  return `<span class="status status-${esc(status)}">${esc(statusLabel(status))}</span>`;
}

function statusLabel(status: CheckStatus) {
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  if (status === "warning") return "Review";
  return "N/A";
}

function toc(items: TocItem[]) {
  let calcNum = 0;
  return `<nav class="toc" aria-label="Contents">
    <p class="toc-title">Contents</p>
    <a class="toc-top" href="#top"><span aria-hidden="true">↑</span>Top</a>
    <a class="toc-top" href="#table-of-contents"><span aria-hidden="true">☰</span>Table of contents</a>
    <div class="toc-rule"></div>
    <div class="toc-list">${items
    .map((item) => {
      if (item.level === 3) {
        calcNum += 1;
        return `<a class="toc-sub" href="#${esc(item.id)}"><span class="toc-num">${calcNum}</span>${esc(item.label)}</a>`;
      }
      return `<a href="#${esc(item.id)}">${esc(item.label)}</a>`;
    })
    .join("")}</div>
  </nav>`;
}

function frontToc(items: TocItem[]) {
  const rows = items
    .filter((item) => item.level !== 3)
    .map(
      (item) => `<a class="front-toc-row" href="#${esc(item.id)}">
        <span class="label">${esc(item.label)}</span>
        <span class="leader"></span>
        <span class="num"></span>
      </a>`
    )
    .join("");
  return `<nav class="front-toc" id="table-of-contents" aria-label="Contents">
    <p class="front-toc-title">Contents</p>
    <div class="front-toc-list">${rows}</div>
  </nav>`;
}

function sortKey(key: string) {
  return key.startsWith("zz-") ? `zzzz-${key}` : key;
}

function loadName(loadCase: EngineLoadCase) {
  return loadCase.name.trim() || "Unnamed";
}

function positive(value: number) {
  return Math.max(Number.isFinite(value) ? value : 0, EPS);
}

function q(value: number, unit: string, digits = 3) {
  return `${num(value, digits)}\\,\\mathrm{${escapeTex(unit)}}`;
}

function num(value: number, digits = 3) {
  if (!Number.isFinite(value)) return String.raw`\infty`;
  return f(value, digits).replace(/,/g, "{,}");
}

function f(value: number, digits = 3) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function math(tex: string, displayMode = false) {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    output: "mathml",
    strict: "ignore",
  });
}

function mathText(text: string) {
  const formulas: string[] = [];
  const token = (tex: string) => {
    const index = formulas.push(math(tex)) - 1;
    return `@@MATH_${index}@@`;
  };
  const html = esc(text)
    .replace(/q = P\/A \+\/- Mx\/Sx \+\/- Mz\/Sz/g, () => token(String.raw`q = \frac{P}{A}\pm\frac{M_x}{S_x}\pm\frac{M_z}{S_z}`))
    .replace(/H &lt;= mu N \/ 1.5/g, () => token(String.raw`H \le \frac{\mu N}{1.5}`))
    .replace(/N = ([0-9.,-]+) kN including footing self-weight(?: and (?:applied service )?soil overburden)?\./g, (_, n) => token(String.raw`N = ${formatTexNumber(n)}\,\mathrm{kN}\quad\text{including footing self-weight and applied service soil overburden}`))
    .replace(/Mx = ([0-9.,-]+) kN-m, Mz = ([0-9.,-]+) kN-m at footing center\./g, (_, mx, mz) => token(String.raw`M_x = ${formatTexNumber(mx)}\,\mathrm{kN\cdot m},\quad M_z = ${formatTexNumber(mz)}\,\mathrm{kN\cdot m}\quad\text{at footing center}`))
    .replace(/qmin = ([0-9.,-]+) kPa\./g, (_, qmin) => token(String.raw`q_{min} = ${formatTexNumber(qmin)}\,\mathrm{kPa}`))
    .replace(/FS = ([0-9.,-]+|infinite)\./g, (_, fs) => token(String.raw`\mathrm{FS} = ${fs === "infinite" ? String.raw`\infty` : formatTexNumber(fs)}`))
    .replace(/phi = 0\.90/g, () => token(String.raw`\phi = 0.90`))
    .replace(/phi_c = 0\.65/g, () => token(String.raw`\phi_c = 0.65`))
    .replace(/phi_s = 0\.85/g, () => token(String.raw`\phi_s = 0.85`))
    .replace(/c\/d/g, () => token(String.raw`c/d`))
    .replace(/d\/2/g, () => token(String.raw`d/2`))
    .replace(/ at d from /g, () => ` at ${token("d")} from `)
    .replace(/Hx\/Hz/g, () => token(String.raw`H_x/H_z`))
    .replace(/Mx\/Mz/g, () => token(String.raw`M_x/M_z`))
    .replace(/\bd_x\b/g, () => token(String.raw`d_x`))
    .replace(/\bd_z\b/g, () => token(String.raw`d_z`))
    .replace(/\bqmax\b/g, () => token(String.raw`q_{max}`))
    .replace(/\bqmin\b/g, () => token(String.raw`q_{min}`))
    .replace(/\bEc\b/g, () => token(String.raw`E_c`))
    .replace(/\bks\b/g, () => token(String.raw`k_s`))
    .replace(/dX = ([0-9.,-]+) mm, dZ = ([0-9.,-]+) mm using conservative upper-layer depth for a two-layer orthogonal mat\./g, (_, dx, dz) => token(String.raw`d_x = ${formatTexNumber(dx)}\,\mathrm{mm},\quad d_z = ${formatTexNumber(dz)}\,\mathrm{mm}\quad\text{using conservative upper-layer depth}`))
    .replace(/Provided AsX = ([0-9.,-]+) mm2\/m\./g, (_, asx) => token(String.raw`A_{s,x} = ${formatTexNumber(asx)}\,\mathrm{mm^2/m}`))
    .replace(/Provided AsZ = ([0-9.,-]+) mm2\/m\./g, (_, asz) => token(String.raw`A_{s,z} = ${formatTexNumber(asz)}\,\mathrm{mm^2/m}`))
    .replace(/Critical side = ([^.]+)\./g, (_, side) => token(String.raw`\text{Critical side} = \text{${escapeTex(side)}}`))
    .replace(/Required As = ([0-9.,-]+) mm2\/m; provided As = ([0-9.,-]+) mm2\/m\./g, (_, required, provided) => token(String.raw`A_{s,req} = ${formatTexNumber(required)}\,\mathrm{mm^2/m},\quad A_s = ${formatTexNumber(provided)}\,\mathrm{mm^2/m}`))
    .replace(/c = ([0-9.,-]+) mm, limit = ([0-9.,-]+) mm\./g, (_, c, limit) => token(String.raw`c = ${formatTexNumber(c)}\,\mathrm{mm},\quad c_{limit} = ${formatTexNumber(limit)}\,\mathrm{mm}`))
    .replace(/Support condition = ([^.]+)\./g, (_, support) => token(String.raw`\text{Support condition} = \text{${escapeTex(support)}}`))
    .replace(/bo = ([0-9.,-]+) mm, d = ([0-9.,-]+) mm\./g, (_, bo, d) => token(String.raw`b_o = ${formatTexNumber(bo)}\,\mathrm{mm},\quad d = ${formatTexNumber(d)}\,\mathrm{mm}`))
    .replace(/vu direct = ([0-9.,-]+) MPa, vu\(Mx\) = ([0-9.,-]+) MPa, vu\(Mz\) = ([0-9.,-]+) MPa\./g, (_, direct, mx, mz) => token(String.raw`v_{u,direct} = ${formatTexNumber(direct)}\,\mathrm{MPa},\quad v_u(M_x) = ${formatTexNumber(mx)}\,\mathrm{MPa},\quad v_u(M_z) = ${formatTexNumber(mz)}\,\mathrm{MPa}`))
    .replace(/phi Vc = 0\.75 x 0\.17 lambda sqrt\(fc&#39;\) bw d/g, () => token(String.raw`\phi V_c = 0.75 \times 0.17\lambda\sqrt{f'_c}b_wd`))
    .replace(/phi vc = 0\.75 x least concrete two-way shear stress/g, () => token(String.raw`\phi v_c = 0.75 \times \text{least concrete two-way shear stress}`))
    .replace(/phi/g, () => token(String.raw`\phi`))
    .replace(/sqrt\(fc&#39;\)/g, () => token(String.raw`\sqrt{f'_c}`));

  return html.replace(/@@MATH_(\d+)@@/g, (_, index) => formulas[Number(index)] ?? "");
}

function formatTexNumber(value: string) {
  return value.replace(/,/g, "{,}");
}

function texText(text: string) {
  return String.raw`\text{${escapeTex(text)}}`;
}

function escapeTex(value: string) {
  return value
    .replace(/\\/g, String.raw`\backslash `)
    .replace(/[{}]/g, "")
    .replace(/_/g, String.raw`\_`)
    .replace(/%/g, String.raw`\%`)
    .replace(/&/g, String.raw`\&`)
    .replace(/#/g, String.raw`\#`);
}

function esc(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatReportDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
