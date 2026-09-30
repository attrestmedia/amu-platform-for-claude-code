"use client";

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import {
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointsMaterial,
  ShaderMaterial,
  Texture,
} from "three";
import { createSpatialGalleryTransforms } from "./spatialGalleryLayout";
import type { SpatialGalleryAtlasItem, SpatialGalleryQuality } from "./types";

const VERTEX_SHADER = `
  attribute vec4 aUvRect;
  attribute float aHighlight;
  varying vec2 vAtlasUv;
  varying vec2 vLocalUv;
  varying vec4 vUvRect;
  varying float vHighlight;

  void main() {
    vLocalUv = uv;
    vAtlasUv = mix(aUvRect.xy, aUvRect.zw, uv);
    vUvRect = aUvRect;
    vHighlight = aHighlight;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D uAtlas;
  varying vec2 vAtlasUv;
  varying vec2 vLocalUv;
  varying vec4 vUvRect;
  varying float vHighlight;

  float roundedBox(vec2 point, float radius) {
    vec2 edge = min(point, 1.0 - point);
    vec2 corner = max(vec2(radius) - edge, 0.0);
    return radius - length(corner);
  }

  void main() {
    float edge = roundedBox(vLocalUv, 0.065);
    float alpha = smoothstep(-0.012, 0.012, edge);
    if (alpha < 0.01) discard;

    vec2 sampleUv = vAtlasUv;
    if (!gl_FrontFacing) {
      sampleUv.x = mix(vUvRect.x, vUvRect.z, 1.0 - vLocalUv.x);
    }
    vec4 image = texture2D(uAtlas, sampleUv);
    vec3 highlighted = mix(image.rgb, image.rgb * 1.12, vHighlight);
    gl_FragColor = vec4(highlighted, image.a * alpha);
  }
`;

type GalleryMeshProps = {
  items: SpatialGalleryAtlasItem[];
  texture: Texture;
  onActivate: (index: number) => void;
  onPressStart: (index: number) => void;
};

function GalleryMesh({ items, texture, onActivate, onPressStart }: GalleryMeshProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const hoveredRef = useRef<number | null>(null);
  const { invalidate } = useThree();
  const transforms = useMemo(() => createSpatialGalleryTransforms(items), [items]);
  const geometry = useMemo(() => {
    const next = new PlaneGeometry(1, 1, 1, 1);
    const uvRects = new Float32Array(items.length * 4);
    const highlights = new Float32Array(items.length);
    items.forEach((item, index) => uvRects.set(item.uvRect, index * 4));
    next.setAttribute("aUvRect", new InstancedBufferAttribute(uvRects, 4));
    next.setAttribute("aHighlight", new InstancedBufferAttribute(highlights, 1).setUsage(DynamicDrawUsage));
    return next;
  }, [items]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uAtlas: { value: texture } },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: false,
        depthWrite: true,
        side: DoubleSide,
      }),
    [texture],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const object = new Object3D();
    transforms.forEach((transform, index) => {
      object.position.set(...transform.position);
      object.rotation.set(...transform.rotation);
      object.scale.set(...transform.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [invalidate, transforms]);

  useEffect(() => {
    const highlights = geometry.getAttribute("aHighlight") as InstancedBufferAttribute;
    for (let index = 0; index < items.length; index += 1) {
      highlights.setX(index, index === hoveredRef.current ? 1 : 0);
    }
    highlights.needsUpdate = true;
    invalidate();
  }, [geometry, invalidate, items.length]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const setHovered = (index: number | null) => {
    hoveredRef.current = index;
    const highlights = geometry.getAttribute("aHighlight") as InstancedBufferAttribute;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      highlights.setX(itemIndex, itemIndex === index ? 1 : 0);
    }
    highlights.needsUpdate = true;
    invalidate();
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, items.length]}
      frustumCulled={false}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        if (typeof event.instanceId === "number") onPressStart(event.instanceId);
      }}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (typeof event.instanceId === "number") onActivate(event.instanceId);
      }}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        setHovered(typeof event.instanceId === "number" ? event.instanceId : null);
      }}
      onPointerOut={() => setHovered(null)}
    />
  );
}

const PARTICLE_COUNTS: Record<SpatialGalleryQuality, number> = {
  low: 320,
  medium: 700,
  high: 1200,
};

const PARTICLE_LINE_COUNTS: Record<SpatialGalleryQuality, number> = {
  low: 70,
  medium: 120,
  high: 180,
};

function seededValue(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createParticleGeometry(quality: SpatialGalleryQuality) {
  const count = PARTICLE_COUNTS[quality];
  const positions = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < count; index += 1) {
    const progress = (index + 0.5) / count;
    const vertical = 1 - progress * 2;
    const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const theta = index * goldenAngle + seededValue(index, 3) * 0.24;
    const shell = 4.25 + seededValue(index, 7) * 1.75;
    positions[index * 3] = Math.cos(theta) * radial * shell * 1.08;
    positions[index * 3 + 1] = vertical * shell * 0.76;
    positions[index * 3 + 2] = Math.sin(theta) * radial * shell * 0.84;
  }

  const pointsGeometry = new BufferGeometry();
  pointsGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  const nodeCount = Math.min(PARTICLE_LINE_COUNTS[quality], count);
  const linePositions: number[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const base = index * 3;
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let candidate = index + 1; candidate < nodeCount; candidate += 1) {
      const candidateBase = candidate * 3;
      const dx = positions[base] - positions[candidateBase];
      const dy = positions[base + 1] - positions[candidateBase + 1];
      const dz = positions[base + 2] - positions[candidateBase + 2];
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    if (nearest >= 0 && nearestDistance < 2.4) {
      const nearestBase = nearest * 3;
      linePositions.push(
        positions[base],
        positions[base + 1],
        positions[base + 2],
        positions[nearestBase],
        positions[nearestBase + 1],
        positions[nearestBase + 2],
      );
    }
  }

  const linesGeometry = new BufferGeometry();
  linesGeometry.setAttribute("position", new Float32BufferAttribute(linePositions, 3));
  return { linesGeometry, pointsGeometry };
}

function getThemeAccentColor() {
  const styles = getComputedStyle(document.documentElement);
  const accent =
    styles.getPropertyValue("--accent-text").trim() || styles.getPropertyValue("--accent").trim();
  return accent ? `hsl(${accent})` : "#9eaf45";
}

function SpatialParticles({ quality }: { quality: SpatialGalleryQuality }) {
  const geometries = useMemo(() => createParticleGeometry(quality), [quality]);
  const pointsMaterial = useMemo(
    () =>
      new PointsMaterial({
        color: getThemeAccentColor(),
        depthWrite: false,
        opacity: quality === "low" ? 0.55 : 0.68,
        size: quality === "low" ? 0.07 : 0.09,
        sizeAttenuation: true,
        transparent: true,
      }),
    [quality],
  );
  const linesMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color: getThemeAccentColor(),
        depthWrite: false,
        opacity: quality === "low" ? 0.15 : 0.23,
        transparent: true,
      }),
    [quality],
  );

  useEffect(() => {
    const updateThemeColor = () => {
      const color = getThemeAccentColor();
      pointsMaterial.color.set(color);
      linesMaterial.color.set(color);
    };
    const observer = new MutationObserver(updateThemeColor);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, [linesMaterial, pointsMaterial]);

  useEffect(
    () => () => {
      geometries.pointsGeometry.dispose();
      geometries.linesGeometry.dispose();
      pointsMaterial.dispose();
      linesMaterial.dispose();
    },
    [geometries, linesMaterial, pointsMaterial],
  );

  return (
    <>
      <points geometry={geometries.pointsGeometry} material={pointsMaterial} raycast={() => undefined} />
      <lineSegments geometry={geometries.linesGeometry} material={linesMaterial} raycast={() => undefined} />
    </>
  );
}

function AmbientDrift({
  children,
  enabled,
  quality,
}: {
  children: ReactNode;
  enabled: boolean;
  quality: SpatialGalleryQuality;
}) {
  const groupRef = useRef<Group>(null);
  const { invalidate } = useThree();

  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(invalidate, quality === "low" ? 80 : 50);
    return () => window.clearInterval(interval);
  }, [enabled, invalidate, quality]);

  useFrame(({ clock }) => {
    if (!groupRef.current || !enabled) return;
    const time = clock.getElapsedTime();
    groupRef.current.rotation.x = Math.sin(time * 0.19) * 0.025;
    groupRef.current.rotation.y = Math.cos(time * 0.16) * 0.055;
    groupRef.current.rotation.z = Math.sin(time * 0.13) * 0.014;
  });

  return <group ref={groupRef}>{children}</group>;
}

function CameraMagnification({ zoom }: { zoom: number }) {
  const { camera, invalidate } = useThree();
  const cameraRef = useRef(camera);

  useEffect(() => {
    const activeCamera = cameraRef.current;
    if (!(activeCamera instanceof PerspectiveCamera)) return;
    activeCamera.zoom = zoom;
    activeCamera.updateProjectionMatrix();
    invalidate();
  }, [invalidate, zoom]);

  return null;
}

function ContextLossMonitor({ onContextLost }: { onContextLost: () => void }) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    canvas.addEventListener("webglcontextlost", handleLost);
    return () => canvas.removeEventListener("webglcontextlost", handleLost);
  }, [gl, onContextLost]);

  return null;
}

type SpatialGallerySceneProps = {
  items: SpatialGalleryAtlasItem[];
  texture: Texture;
  rotation: [number, number];
  zoom: number;
  quality: SpatialGalleryQuality;
  reducedMotion: boolean;
  onActivate: (index: number) => void;
  onPressStart: (index: number) => void;
  onContextLost: () => void;
};

export function SpatialGalleryScene({
  items,
  texture,
  rotation,
  zoom,
  quality,
  reducedMotion,
  onActivate,
  onPressStart,
  onContextLost,
}: SpatialGallerySceneProps) {
  const dpr = quality === "high" ? 1.5 : quality === "medium" ? 1.25 : 1;

  return (
    <Canvas
      camera={{ fov: 46, near: 0.1, far: 50, position: [0, 0, 11.2] }}
      dpr={dpr}
      frameloop="demand"
      gl={{ alpha: true, antialias: quality !== "low", powerPreference: "high-performance" }}
      role="img"
      aria-label="드래그와 확대/축소로 탐색하는 공개 AI 이미지 3D 갤러리"
    >
      <ContextLossMonitor onContextLost={onContextLost} />
      <CameraMagnification zoom={zoom} />
      <group rotation={[rotation[0], rotation[1], 0]}>
        <AmbientDrift enabled={!reducedMotion} quality={quality}>
          <SpatialParticles quality={quality} />
          <GalleryMesh
            items={items}
            texture={texture}
            onActivate={onActivate}
            onPressStart={onPressStart}
          />
        </AmbientDrift>
      </group>
    </Canvas>
  );
}
