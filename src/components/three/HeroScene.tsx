"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { useRef } from "react";
import type { Mesh } from "three";

function NightOrb() {
  const mesh = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (mesh.current) {
      mesh.current.rotation.x += delta * 0.1;
      mesh.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.8}>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[1.4, 1]} />
        <meshStandardMaterial color="#e8b84b" wireframe />
      </mesh>
    </Float>
  );
}

/**
 * Placeholder 3D moment proving the R3F + Next.js integration.
 * Must be loaded via next/dynamic with ssr: false — Canvas cannot
 * render on the server. The real signature hero scene is a Phase 1
 * design deliverable.
 */
export default function HeroScene() {
  return (
    <Canvas camera={{ position: [0, 0, 4], fov: 50 }} aria-hidden>
      <ambientLight intensity={0.4} />
      <pointLight position={[4, 4, 4]} intensity={40} color="#e8b84b" />
      <NightOrb />
    </Canvas>
  );
}
