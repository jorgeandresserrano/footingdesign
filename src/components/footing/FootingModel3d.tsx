"use client";

import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import {
  Grid,
  OrbitControls,
  PerspectiveCamera,
} from "@react-three/drei";
import {
  CatmullRomCurve3,
  Quaternion,
  Vector3,
} from "three";

const SOIL_PLANES = [
  { key: "ground", label: "Ground surface", color: "#8b5a2b", opacity: 0.35 },
  { key: "frost", label: "Frost depth", color: "#38bdf8", opacity: 0.3 },
  { key: "groundwater", label: "Groundwater", color: "#1d4ed8", opacity: 0.3 },
] as const;

type SoilPlaneKey = (typeof SOIL_PLANES)[number]["key"];

type PlaneVisibility = Record<SoilPlaneKey, boolean>;

const CAMERA_FOV = 35;
const CAMERA_DIRECTION = [1, 0.75, 1] as const;
const CAMERA_DIRECTION_LENGTH = Math.hypot(...CAMERA_DIRECTION);
const AXIS_SHAFT_RADIUS_FACTOR = 0.002;
const AXIS_HEAD_RADIUS_FACTOR = 0.0072;
const AXIS_HEAD_LENGTH_FACTOR = 0.021;

export interface FootingGeometry {
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

interface Props {
  geometry: FootingGeometry;
}

function clampDimension(value: number) {
  return Math.max(value, 0.05);
}

function finiteNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function getCameraDistance({
  modelLength,
  modelWidth,
  modelHeight,
  aspect,
}: {
  modelLength: number;
  modelWidth: number;
  modelHeight: number;
  aspect: number;
}) {
  const radius =
    Math.hypot(modelLength, modelWidth, Math.max(modelHeight, 0.5)) / 2;
  const verticalFov = (CAMERA_FOV * Math.PI) / 180;
  const horizontalFov =
    2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.1));
  const limitingFov = Math.min(verticalFov, horizontalFov);

  return Math.max((radius / Math.sin(limitingFov / 2)) * 1.25, 3);
}

function AxisArrow({
  color,
  length,
  shaftRadius,
  headRadius,
  headLength,
  rotation,
}: {
  color: string;
  length: number;
  shaftRadius: number;
  headRadius: number;
  headLength: number;
  rotation: [number, number, number];
}) {
  return (
    <group rotation={rotation}>
      <mesh position={[0, length / 2, 0]}>
        <cylinderGeometry args={[shaftRadius, shaftRadius, length, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, length, 0]}>
        <coneGeometry args={[headRadius, headLength, 24]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function MomentArrow({
  color,
  radius,
  tubeRadius,
  headRadius,
  headLength,
  position,
  rotation,
}: {
  color: string;
  radius: number;
  tubeRadius: number;
  headRadius: number;
  headLength: number;
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const startAngle = Math.PI * 0.15;
  const endAngle = Math.PI * 1.65;
  const points = Array.from({ length: 24 }, (_, index) => {
    const angle =
      startAngle + ((endAngle - startAngle) * index) / (24 - 1);
    return new Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0);
  });
  const curve = new CatmullRomCurve3(points);
  const end = points[0];
  const tangent = end.clone().sub(points[1]).normalize();
  const quaternion = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    tangent
  );
  const headCenter = end
    .clone()
    .add(tangent.clone().multiplyScalar(headLength / 2));

  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <tubeGeometry args={[curve, 32, tubeRadius, 8, false]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={headCenter} quaternion={quaternion}>
        <coneGeometry args={[headRadius, headLength, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function FootingScene({
  geometry,
  planeVisibility,
}: {
  geometry: FootingGeometry;
  planeVisibility: PlaneVisibility;
}) {
  const { size } = useThree();
  const footingLength = clampDimension(geometry.footingLength);
  const footingWidth = clampDimension(geometry.footingWidth);
  const footingThickness = clampDimension(geometry.footingThickness);
  const soilCoverDepth = Math.max(finiteNumber(geometry.soilCoverDepth), 0);
  const frostDepth = Math.max(finiteNumber(geometry.frostDepth), 0);
  const groundwaterDepth = Math.max(finiteNumber(geometry.groundwaterDepth), 0);
  const groundSurfaceY = footingThickness / 2 + soilCoverDepth;
  const pedestalLength = clampDimension(geometry.pedestalLength);
  const pedestalWidth = clampDimension(geometry.pedestalWidth);
  const pedestalHeight = clampDimension(geometry.pedestalHeight);
  const pedestalOffsetX = finiteNumber(geometry.pedestalOffsetX);
  const pedestalOffsetZ = finiteNumber(geometry.pedestalOffsetZ);
  const minX = Math.min(
    -footingLength / 2,
    pedestalOffsetX - pedestalLength / 2
  );
  const maxX = Math.max(
    footingLength / 2,
    pedestalOffsetX + pedestalLength / 2
  );
  const minZ = Math.min(-footingWidth / 2, pedestalOffsetZ - pedestalWidth / 2);
  const maxZ = Math.max(footingWidth / 2, pedestalOffsetZ + pedestalWidth / 2);
  const modelLength = maxX - minX;
  const modelWidth = maxZ - minZ;
  const modelSpan = Math.max(modelLength, modelWidth, pedestalHeight);
  const modelHeight = footingThickness + pedestalHeight;
  const axisLength = Math.max(modelSpan * 0.28, 0.7);
  const visualLength = Math.max(modelLength, axisLength * 2.8);
  const visualWidth = Math.max(modelWidth, axisLength * 2.8);
  const visualHeight = modelHeight + axisLength * 1.4;
  const lockedZoomDistance = getCameraDistance({
    modelLength: visualLength,
    modelWidth: visualWidth,
    modelHeight: visualHeight,
    aspect: size.width / size.height,
  });
  const cameraDistance = lockedZoomDistance / CAMERA_DIRECTION_LENGTH;
  const axisShaftRadius = lockedZoomDistance * AXIS_SHAFT_RADIUS_FACTOR;
  const axisHeadRadius = lockedZoomDistance * AXIS_HEAD_RADIUS_FACTOR;
  const axisHeadLength = lockedZoomDistance * AXIS_HEAD_LENGTH_FACTOR;
  const momentRadius = lockedZoomDistance * 0.03;
  const momentOffset = lockedZoomDistance * 0.025;
  const momentTubeRadius = axisShaftRadius * 0.85;
  const momentHeadRadius = axisHeadRadius * 0.75;
  const momentHeadLength = axisHeadLength * 0.75;
  const axisOriginY = footingThickness + pedestalHeight + 0.08;
  const cameraTarget: [number, number, number] = [
    (minX + maxX) / 2,
    modelHeight / 2 - footingThickness / 2,
    (minZ + maxZ) / 2,
  ];

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[
          cameraTarget[0] + cameraDistance * CAMERA_DIRECTION[0],
          cameraTarget[1] + cameraDistance * CAMERA_DIRECTION[1],
          cameraTarget[2] + cameraDistance * CAMERA_DIRECTION[2],
        ]}
        fov={CAMERA_FOV}
        near={0.1}
        far={Math.max(lockedZoomDistance * 4, 100)}
      />
      <ambientLight intensity={0.65} />
      <directionalLight
        castShadow
        position={[cameraDistance, cameraDistance * 1.2, cameraDistance]}
        intensity={1.1}
        shadow-mapSize={[1024, 1024]}
      />
      <group position={[0, -footingThickness / 2, 0]}>
        <mesh castShadow receiveShadow position={[0, footingThickness / 2, 0]}>
          <boxGeometry args={[footingLength, footingThickness, footingWidth]} />
          <meshStandardMaterial color="#b9b7b2" roughness={0.78} />
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[
            pedestalOffsetX,
            footingThickness + pedestalHeight / 2,
            pedestalOffsetZ,
          ]}
        >
          <boxGeometry args={[pedestalLength, pedestalHeight, pedestalWidth]} />
          <meshStandardMaterial color="#d2d0ca" roughness={0.74} />
        </mesh>
      </group>
      {SOIL_PLANES.filter((plane) => planeVisibility[plane.key]).map(
        (plane) => {
          const planeY =
            plane.key === "ground"
              ? groundSurfaceY
              : plane.key === "frost"
                ? groundSurfaceY - frostDepth
                : groundSurfaceY - groundwaterDepth;
          return (
            <mesh
              key={plane.key}
              position={[(minX + maxX) / 2, planeY, (minZ + maxZ) / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry
                args={[
                  Math.max(modelSpan * 2.4, 6),
                  Math.max(modelSpan * 2.4, 6),
                ]}
              />
              <meshStandardMaterial
                color={plane.color}
                transparent
                opacity={plane.opacity}
                roughness={0.95}
                side={2}
                depthWrite={false}
              />
            </mesh>
          );
        }
      )}
      <group position={[pedestalOffsetX, axisOriginY, pedestalOffsetZ]}>
        <AxisArrow
          color="#dc2626"
          length={axisLength}
          shaftRadius={axisShaftRadius}
          headRadius={axisHeadRadius}
          headLength={axisHeadLength}
          rotation={[0, 0, -Math.PI / 2]}
        />
        <AxisArrow
          color="#2563eb"
          length={axisLength}
          shaftRadius={axisShaftRadius}
          headRadius={axisHeadRadius}
          headLength={axisHeadLength}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <AxisArrow
          color="#16a34a"
          length={axisLength}
          shaftRadius={axisShaftRadius}
          headRadius={axisHeadRadius}
          headLength={axisHeadLength}
          rotation={[0, 0, 0]}
        />
        <MomentArrow
          color="#dc2626"
          radius={momentRadius}
          tubeRadius={momentTubeRadius}
          headRadius={momentHeadRadius}
          headLength={momentHeadLength}
          position={[axisLength + momentOffset, 0, 0]}
          rotation={[0, -Math.PI / 2, 0]}
        />
        <MomentArrow
          color="#2563eb"
          radius={momentRadius}
          tubeRadius={momentTubeRadius}
          headRadius={momentHeadRadius}
          headLength={momentHeadLength}
          position={[0, 0, axisLength + momentOffset]}
          rotation={[0, Math.PI, 0]}
        />
        <MomentArrow
          color="#16a34a"
          radius={momentRadius}
          tubeRadius={momentTubeRadius}
          headRadius={momentHeadRadius}
          headLength={momentHeadLength}
          position={[0, axisLength + momentOffset, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      </group>
      <Grid
        position={[0, -footingThickness - 0.01, 0]}
        args={[Math.ceil(modelSpan * 2), Math.ceil(modelSpan * 2)]}
        cellSize={0.25}
        cellThickness={0.6}
        cellColor="#cbd5e1"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#94a3b8"
        fadeDistance={Math.max(modelSpan * 2, 6)}
        fadeStrength={1}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        minDistance={lockedZoomDistance}
        maxDistance={lockedZoomDistance}
        target={cameraTarget}
      />
    </>
  );
}

export function FootingModel3d({ geometry }: Props) {
  const [planeVisibility, setPlaneVisibility] = useState<PlaneVisibility>({
    ground: true,
    frost: true,
    groundwater: true,
  });
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <div className="relative h-[360px] overflow-hidden rounded-md border bg-slate-100 dark:bg-slate-900 sm:h-[420px]">
      <Canvas
        shadows
      >
        <color attach="background" args={["#f8fafc"]} />
        <FootingScene geometry={geometry} planeVisibility={planeVisibility} />
      </Canvas>
      <div className="absolute bottom-3 right-3 flex flex-col-reverse rounded-md border bg-white/85 text-[11px] font-medium shadow-sm backdrop-blur dark:bg-slate-950/75">
        <button
          type="button"
          onClick={() => setLegendOpen((open) => !open)}
          className="flex w-full items-center gap-2 px-2 py-1.5 text-slate-700 dark:text-slate-200"
        >
          <span className="text-slate-400">{legendOpen ? "▾" : "▸"}</span>
          Soil layers
        </button>
        {legendOpen && (
          <div className="border-b px-2 py-1.5">
            {SOIL_PLANES.map((plane) => (
              <label
                key={plane.key}
                className="flex cursor-pointer items-center gap-2 py-0.5 text-slate-700 dark:text-slate-200"
              >
                <input
                  type="checkbox"
                  checked={planeVisibility[plane.key]}
                  onChange={(event) =>
                    setPlaneVisibility((prev) => ({
                      ...prev,
                      [plane.key]: event.target.checked,
                    }))
                  }
                  className="size-3 accent-current"
                />
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: plane.color }}
                />
                {plane.label}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border bg-white/85 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur dark:bg-slate-950/75">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <span className="size-2 rounded-full bg-red-600" />
          X / Hx / Mx
        </div>
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <span className="size-2 rounded-full bg-blue-600" />
          Z / Hz / My
        </div>
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <span className="size-2 rounded-full bg-green-600" />
          Y / P / T
        </div>
      </div>
    </div>
  );
}
