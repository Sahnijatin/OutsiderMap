"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * The signature scene: a field of sodium-amber city lights - the ten
 * thousand options - that drift, then collapse into a single bright point
 * (the one answer), hold, and scatter again. The product thesis, enacted.
 *
 * Load via next/dynamic with ssr: false. With prefers-reduced-motion the
 * field renders as a static night-city scatter.
 */

const COUNT = 1400;
const T_SCATTERED = 1.6; // drift only
const T_CONVERGED = 6.2; // all points home by now
const T_HOLD_END = 7.8; // bright point holds
const CYCLE = 10.5; // full loop

function readToken(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function easeInOutCubic(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

// Seeded PRNG: keeps the scene stable across renders and satisfies render
// purity - the same field of lights every visit.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function CityLights({ reduced }: { reduced: boolean }) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  const { starts, delays, seeds, positions, colors } = useMemo(() => {
    const starts = new Float32Array(COUNT * 3);
    const delays = new Float32Array(COUNT);
    const seeds = new Float32Array(COUNT);
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);

    const accent = new THREE.Color(readToken("--color-accent", "#f0a431"));
    const ember = new THREE.Color(readToken("--color-ember", "#c87c1f"));
    const warmWhite = new THREE.Color("#fff3dc");
    const rand = mulberry32(3 * 60 + 0); // 3:00 AM

    for (let i = 0; i < COUNT; i++) {
      // A wide, shallow ellipse seen obliquely - a city from a rooftop.
      const angle = rand() * Math.PI * 2;
      const radius = 0.5 + Math.pow(rand(), 0.6) * 4.6;
      const x = Math.cos(angle) * radius * 1.6;
      const y = (rand() - 0.5) * 1.7 - Math.sin(angle) * radius * 0.22;
      const z = (rand() - 0.5) * 2.4;
      starts.set([x, y, z], i * 3);
      positions.set([x, y, z], i * 3);

      // Far lights leave first so the collapse sweeps inward.
      delays[i] = (radius / 5.1) * 1.4 + rand() * 0.5;
      seeds[i] = rand() * Math.PI * 2;

      // Mixed street lighting: mostly sodium, some ember, a few warm-white.
      const r = rand();
      const c =
        r < 0.62 ? accent : r < 0.9 ? ember : warmWhite;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    return { starts, delays, seeds, positions, colors };
  }, []);

  useFrame(({ clock }) => {
    const geometry = geometryRef.current;
    if (!geometry || reduced) return;

    const t = clock.elapsedTime % CYCLE;
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      let p: number;
      if (t < T_SCATTERED) {
        p = 0;
      } else if (t < T_CONVERGED) {
        p = clamp01((t - T_SCATTERED - delays[i]) / 2.4);
      } else if (t < T_HOLD_END) {
        p = 1;
      } else {
        p = 1 - clamp01((t - T_HOLD_END - delays[i] * 0.35) / 1.9);
      }
      const e = easeInOutCubic(p);

      // Ambient flicker-drift while scattered, fading out as points travel.
      const drift = (1 - e) * 0.06;
      const sx = starts[i3] + Math.sin(t * 0.7 + seeds[i]) * drift;
      const sy = starts[i3 + 1] + Math.cos(t * 0.9 + seeds[i] * 1.7) * drift;
      const sz = starts[i3 + 2] + Math.sin(t * 0.5 + seeds[i] * 0.6) * drift;

      arr[i3] = sx * (1 - e);
      arr[i3 + 1] = sy * (1 - e);
      arr[i3 + 2] = sz * (1 - e);
    }
    attr.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function AnswerPoint({ reduced }: { reduced: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const accent = useMemo(() => readToken("--color-accent", "#f0a431"), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    if (reduced) {
      mesh.scale.setScalar(1);
      material.opacity = 0.9;
      return;
    }

    const t = clock.elapsedTime % CYCLE;
    // Brightens as the field collapses, breathes while holding.
    const gather = easeInOutCubic(
      clamp01((t - T_SCATTERED) / (T_CONVERGED - T_SCATTERED)),
    );
    const release =
      t > T_HOLD_END ? 1 - clamp01((t - T_HOLD_END) / 1.6) : 1;
    const breathe = 1 + Math.sin(clock.elapsedTime * 2.2) * 0.08;
    const s = (0.35 + gather * 0.9) * release * breathe;
    mesh.scale.setScalar(Math.max(s, 0.25));
    material.opacity = (0.35 + gather * 0.65) * Math.max(release, 0.35);
  });

  return (
    <mesh ref={meshRef}>
      <circleGeometry args={[0.09, 32]} />
      <meshBasicMaterial
        ref={materialRef}
        color={accent}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function ParallaxRig() {
  useFrame(({ camera, pointer }) => {
    camera.position.x += (pointer.x * 0.35 - camera.position.x) * 0.04;
    camera.position.y += (pointer.y * 0.2 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function ConvergenceField() {
  const reduced = useReducedMotion() ?? false;

  return (
    <Canvas
      camera={{ position: [0, 0, 5.2], fov: 55 }}
      dpr={[1, 1.75]}
      gl={{ antialias: false, alpha: true }}
      aria-hidden
    >
      <CityLights reduced={reduced} />
      <AnswerPoint reduced={reduced} />
      {!reduced && <ParallaxRig />}
    </Canvas>
  );
}
