"use client";

import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type Group } from "three";

type MotionCoverCanvasProps = {
  onReady: () => void;
  onContextLost: () => void;
};

function getThemeAccentColor() {
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent-text").trim() || styles.getPropertyValue("--accent").trim();
  return accent ? `hsl(${accent})` : "#9eaf45";
}

function MotionCoverLifecycle({ onReady, onContextLost }: MotionCoverCanvasProps) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    let readyFrame = 0;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    readyFrame = window.requestAnimationFrame(onReady);

    return () => {
      window.cancelAnimationFrame(readyFrame);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
    };
  }, [gl, onContextLost, onReady]);

  return null;
}

function MotionCoverScene() {
  const groupRef = useRef<Group>(null);
  const accent = getThemeAccentColor();

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const time = clock.getElapsedTime();
    groupRef.current.rotation.x = Math.sin(time * 0.2) * 0.08;
    groupRef.current.rotation.y = Math.cos(time * 0.16) * 0.14;
    groupRef.current.position.y = Math.sin(time * 0.28) * 0.08;
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.8} />
      <mesh rotation={[0.2, 0.35, 0]}>
        <icosahedronGeometry args={[1.15, 1]} />
        <meshBasicMaterial color={accent} transparent opacity={0.2} wireframe />
      </mesh>
      <mesh position={[0.75, -0.45, 0.2]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshBasicMaterial color={accent} transparent opacity={0.42} />
      </mesh>
    </group>
  );
}

export function AppMagazineMotionCoverCanvas({ onReady, onContextLost }: MotionCoverCanvasProps) {
  return (
    <Canvas
      camera={{ fov: 36, near: 0.1, far: 20, position: [0, 0, 4] }}
      dpr={[1, 1.25]}
      frameloop="always"
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
    >
      <MotionCoverLifecycle onReady={onReady} onContextLost={onContextLost} />
      <MotionCoverScene />
    </Canvas>
  );
}
