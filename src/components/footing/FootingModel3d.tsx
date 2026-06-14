"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Grid, OrbitControls } from "@react-three/drei";

export interface FootingGeometry {
  footingLength: number;
  footingWidth: number;
  footingThickness: number;
  pedestalLength: number;
  pedestalWidth: number;
  pedestalHeight: number;
}

interface Props {
  geometry: FootingGeometry;
  unit: string;
}

function clampDimension(value: number) {
  return Math.max(value, 0.05);
}

function FootingScene({ geometry }: { geometry: FootingGeometry }) {
  const footingLength = clampDimension(geometry.footingLength);
  const footingWidth = clampDimension(geometry.footingWidth);
  const footingThickness = clampDimension(geometry.footingThickness);
  const pedestalLength = clampDimension(geometry.pedestalLength);
  const pedestalWidth = clampDimension(geometry.pedestalWidth);
  const pedestalHeight = clampDimension(geometry.pedestalHeight);
  const modelSpan = Math.max(footingLength, footingWidth, pedestalHeight);
  const cameraDistance = Math.max(modelSpan * 1.35, 3);

  return (
    <>
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
          position={[0, footingThickness + pedestalHeight / 2, 0]}
        >
          <boxGeometry args={[pedestalLength, pedestalHeight, pedestalWidth]} />
          <meshStandardMaterial color="#d2d0ca" roughness={0.74} />
        </mesh>
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
      <ContactShadows
        opacity={0.35}
        scale={Math.max(modelSpan * 1.6, 4)}
        blur={2}
        far={Math.max(modelSpan, 3)}
        position={[0, -footingThickness - 0.02, 0]}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={cameraDistance * 0.45}
        maxDistance={cameraDistance * 2.4}
        target={[0, 0.15, 0]}
      />
    </>
  );
}

export function FootingModel3d({ geometry, unit }: Props) {
  const modelSpan = Math.max(
    geometry.footingLength,
    geometry.footingWidth,
    geometry.pedestalHeight,
    1
  );
  const cameraDistance = Math.max(modelSpan * 1.35, 3);

  return (
    <div className="relative h-[360px] overflow-hidden rounded-md border bg-slate-100 dark:bg-slate-900 sm:h-[420px]">
      <Canvas
        shadows
        camera={{
          position: [cameraDistance, cameraDistance * 0.75, cameraDistance],
          fov: 35,
          near: 0.1,
          far: cameraDistance * 10,
        }}
      >
        <color attach="background" args={["#f8fafc"]} />
        <FootingScene geometry={geometry} />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-white/85 px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur dark:bg-slate-950/75 dark:text-slate-300">
        Drag to rotate · Scroll to zoom · {unit}
      </div>
    </div>
  );
}
