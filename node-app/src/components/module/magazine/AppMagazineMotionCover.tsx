"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ImageBox } from "components/module/image";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";

export type MotionCoverTier = "standard" | "motion" | "signature";
export type MotionCoverAspect = "wide" | "square";

const MotionCoverCanvas = dynamic(
  () => import("./AppMagazineMotionCoverCanvas").then((module) => module.AppMagazineMotionCoverCanvas),
  { ssr: false },
);

type MotionCoverProps = {
  title: string;
  description: string;
  image?: string;
  imageAlt: string;
  tier: MotionCoverTier;
  aspect?: MotionCoverAspect;
  sizes?: string;
  fallbackContent?: ReactNode;
};

type RuntimeBoundaryProps = {
  children: ReactNode;
  onError: () => void;
};

type RuntimeBoundaryState = {
  hasError: boolean;
};

class RuntimeBoundary extends Component<RuntimeBoundaryProps, RuntimeBoundaryState> {
  state: RuntimeBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RuntimeBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function supportsWebGl2() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    const supported = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return supported;
  } catch {
    return false;
  }
}

function isLowTierDevice() {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
    deviceMemory?: number;
  };
  const connection = nav.connection;

  return (
    window.innerWidth < 640 ||
    (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) ||
    (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) ||
    Boolean(connection?.saveData) ||
    ["2g", "slow-2g"].includes(connection?.effectiveType || "")
  );
}

function useInViewport(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [inViewport, setInViewport] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      const fallbackFrame = window.requestAnimationFrame(() => setInViewport(true));
      return () => window.cancelAnimationFrame(fallbackFrame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => setInViewport(entry.isIntersecting),
      { rootMargin: "160px 0px", threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, inViewport: enabled && inViewport };
}

function useSignatureRuntimeEligibility(tier: MotionCoverTier) {
  const reducedMotion = useReducedMotion();
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    if (tier !== "signature") {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setEligible(media.matches === false && supportsWebGl2() && !isLowTierDevice());
    };
    const initialCheck = window.requestAnimationFrame(update);
    media.addEventListener?.("change", update);
    return () => {
      window.cancelAnimationFrame(initialCheck);
      media.removeEventListener?.("change", update);
    };
  }, [tier]);

  return eligible && reducedMotion === false;
}

function MotionTextLoop({ title, description, active }: { title: string; description: string; active: boolean }) {
  const messages = [title, description].filter(Boolean);
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(messages.length - 1, 0));

  useEffect(() => {
    if (!active || messages.length < 2) return;
    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, 3200);
    return () => window.clearInterval(interval);
  }, [active, messages.length, title, description]);

  if (!messages.length) return null;

  const message = messages[safeIndex];
  const messageBox = active ? (
    <AnimatePresence initial={false} mode="wait">
      <motion.p
        key={`${safeIndex}-${message}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="line-clamp-3"
      >
        {message}
      </motion.p>
    </AnimatePresence>
  ) : (
    <p className="line-clamp-3">{message}</p>
  );

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-4 bottom-4 z-10 max-w-[85%] sm:inset-x-6 sm:bottom-6">
      <div className="overflow-hidden rounded-xl bg-background/80 px-4 py-3 text-sm font-semibold leading-6 text-primary-text shadow-sm backdrop-blur-sm sm:text-base">{messageBox}</div>
    </div>
  );
}

function SignatureCanvasLayer({ onError }: { onError: () => void }) {
  const [canvasReady, setCanvasReady] = useState(false);
  const handleReady = useCallback(() => setCanvasReady(true), []);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-500 ease-out motion-reduce:transition-none",
        canvasReady && "opacity-100",
      )}
      aria-hidden="true"
    >
      <RuntimeBoundary onError={onError}>
        <MotionCoverCanvas onReady={handleReady} onContextLost={onError} />
      </RuntimeBoundary>
    </div>
  );
}

export function AppMagazineMotionCover({
  title,
  description,
  image,
  imageAlt,
  tier,
  aspect = "wide",
  sizes,
  fallbackContent,
}: MotionCoverProps) {
  const shouldReduceMotion = useReducedMotion();
  const [runtimeFailed, setRuntimeFailed] = useState(false);
  const runtimeEligible = useSignatureRuntimeEligibility(tier);
  const { ref, inViewport } = useInViewport(tier === "signature" && runtimeEligible && !runtimeFailed);
  const animateText = tier !== "standard" && shouldReduceMotion === false;
  const showCanvas = tier === "signature" && runtimeEligible && inViewport && !runtimeFailed;
  const handleRuntimeError = useCallback(() => setRuntimeFailed(true), []);

  return (
    <div
      ref={ref}
      data-motion-cover-tier={tier}
      className={cn(
        "relative w-full overflow-hidden bg-muted",
        aspect === "wide" ? "aspect-[16/10]" : "aspect-square",
      )}
    >
      {image ? (
        <ImageBox
          src={image}
          alt={imageAlt}
          width="100%"
          height="100%"
          objectFit="object-cover"
          sizes={sizes}
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-secondary-text" aria-hidden="true">
          {fallbackContent}
        </div>
      )}

      {tier !== "standard" && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" aria-hidden="true" />
      )}

      {showCanvas && (
        <SignatureCanvasLayer onError={handleRuntimeError} />
      )}

      {tier !== "standard" && <MotionTextLoop title={title} description={description} active={animateText} />}

      {tier !== "standard" && (
        <span className="sr-only">
          <Lang text={{ ko: "움직이는 대표 카드", en: "Animated featured card" }} />
        </span>
      )}
    </div>
  );
}
