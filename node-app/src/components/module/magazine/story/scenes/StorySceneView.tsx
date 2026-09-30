import type { CSSProperties, ReactNode } from "react";
import { sampleSceneStyles, type InteractiveArticleAsset, type MotionCssStyle, type TimelineLine, type TimelineScene } from "../../../../../motion-story";
import { NumberCount } from "./NumberCount";

/**
 * 결정적 장면 렌더러 — (scene, localMs, isStatic, assets) → DOM.
 *
 * 이 디렉터리(`story/scenes/**`)의 컴포넌트는 시간을 스스로 읽지 않는다.
 * Math.random · Date · performance.now · fetch · setTimeout · setInterval · window.scroll* 금지
 * (설계 §4.4 결정성 규칙). 같은 입력은 웹·스크럽·영상 export 에서 같은 화면을 만든다.
 *
 * 모든 텍스트는 항상 DOM 에 있다. 모션은 opacity · transform · clip-path 로 보이는 방식만 바꾼다.
 */

export type StorySceneVariant = "stage" | "card" | "hero";

export type StorySceneViewProps = {
  scene: TimelineScene;
  localMs: number;
  isStatic: boolean;
  assets: readonly InteractiveArticleAsset[];
  variant: StorySceneVariant;
  /** 첫 화면 LCP 후보 이미지 */
  priority?: boolean;
  /** 미디어 위 · 텍스트 아래 레이어 (signature 등급의 WebGL 배경 등) */
  backgroundLayer?: ReactNode;
  /** layout=outro 의 행동 버튼 */
  outroAction?: ReactNode;
  className?: string;
};

const TEXT_SIZE: Record<StorySceneVariant, { headline: string; body: string; quote: string; figure: string }> = {
  stage: {
    headline: "text-3xl font-bold leading-tight sm:text-4xl",
    body: "text-xl leading-9 sm:text-2xl sm:leading-10",
    quote: "text-2xl font-semibold leading-snug sm:text-3xl",
    figure: "text-5xl font-bold sm:text-6xl",
  },
  hero: {
    headline: "text-2xl font-bold leading-tight sm:text-4xl",
    body: "text-lg leading-8 sm:text-2xl sm:leading-10",
    quote: "text-xl font-semibold leading-snug sm:text-2xl",
    figure: "text-4xl font-bold",
  },
  card: {
    headline: "text-xl font-bold leading-snug",
    body: "text-lg font-semibold leading-7",
    quote: "text-lg font-semibold leading-7",
    figure: "text-3xl font-bold",
  },
};

function toStyle(style: MotionCssStyle | undefined, live: boolean): CSSProperties {
  if (!style) return {};
  const css: CSSProperties = { ...style };
  if (live && (style.transform || style.opacity || style.clipPath)) css.willChange = "transform, opacity";
  return css;
}

const UNDERLINE_BASE: CSSProperties = {
  backgroundImage: "linear-gradient(currentColor, currentColor)",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "0 100%",
  paddingBottom: "0.08em",
};

function LineContent({ line, units, live }: { line: TimelineLine; units: MotionCssStyle[]; live: boolean }) {
  if (line.words) {
    return (
      <>
        {line.words.map((word, index) => (
          <span key={`${word.unitIndex}`}>
            {index > 0 ? " " : null}
            <span className="inline-block" style={toStyle(units[word.unitIndex], live)}>
              {word.text}
            </span>
          </span>
        ))}
      </>
    );
  }
  if (line.unitIndex >= 0) {
    return (
      <span className="inline-block" style={toStyle(units[line.unitIndex], live)}>
        {line.text}
      </span>
    );
  }
  return <>{line.text}</>;
}

function SceneLines({
  scene,
  units,
  emphasis,
  live,
  variant,
  quote,
}: {
  scene: TimelineScene;
  units: MotionCssStyle[];
  emphasis: MotionCssStyle;
  live: boolean;
  variant: StorySceneVariant;
  quote?: boolean;
}) {
  const size = TEXT_SIZE[variant];
  const underline = scene.emphasis === "emph.underline";
  const emphasisTarget = scene.emphasis && scene.emphasis !== "emph.number-count" ? scene.lines.length - 1 : -1;
  return (
    <div className="space-y-3">
      {scene.lines.map((line, index) => {
        const headlineStyle = line.isHeadline || scene.layout === "cover";
        const className = headlineStyle ? `${size.headline} text-primary-text` : `${quote ? size.quote : size.body} text-primary-text`;
        const content = <LineContent line={line} units={units} live={live} />;
        return (
          <p key={`${scene.sceneId}-${index}`} className={className}>
            {index === emphasisTarget ? (
              <span className="inline" style={{ ...(underline ? UNDERLINE_BASE : { display: "inline-block" }), ...toStyle(emphasis, live) }}>
                {content}
              </span>
            ) : (
              content
            )}
          </p>
        );
      })}
    </div>
  );
}

function SceneMedia({
  asset,
  camera,
  live,
  priority,
  backgroundLayer,
  scrim,
}: {
  asset: InteractiveArticleAsset | undefined;
  camera: MotionCssStyle;
  live: boolean;
  priority: boolean;
  backgroundLayer?: ReactNode;
  scrim: boolean;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-muted" aria-hidden={asset ? undefined : true}>
      {asset ? (
        <div className="h-full w-full origin-center" style={toStyle(camera, live)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 리소스 자산은 고정 크기 정적 파일이며, 카메라 transform 래퍼 안에서 원본 비율을 유지해야 한다 */}
          <img
            src={asset.src}
            alt={asset.alt}
            width={asset.width}
            height={asset.height}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            fetchPriority={priority ? "high" : "auto"}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      {backgroundLayer ? <div className="pointer-events-none absolute inset-0">{backgroundLayer}</div> : null}
      {scrim ? <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" /> : null}
    </div>
  );
}

export function StorySceneView({
  scene,
  localMs,
  isStatic,
  assets,
  variant,
  priority = false,
  backgroundLayer,
  outroAction,
  className,
}: StorySceneViewProps) {
  const styles = sampleSceneStyles(scene, localMs, isStatic);
  const live = !isStatic;
  const assetId = scene.visual?.assetId ?? scene.visual?.fallbackAssetId;
  const asset = assetId ? assets.find((item) => item.assetId === assetId) : undefined;
  const size = TEXT_SIZE[variant];
  const padding = variant === "card" ? "p-5" : "px-6 py-10 sm:px-10";

  const lines = <SceneLines scene={scene} units={styles.units} emphasis={styles.emphasis} live={live} variant={variant} />;

  let body: ReactNode;
  switch (scene.layout) {
    case "cover":
      body = (
        <>
          <SceneMedia asset={asset} camera={styles.camera} live={live} priority={priority} backgroundLayer={backgroundLayer} scrim />
          <div className={`relative mt-auto ${padding}`}>{lines}</div>
        </>
      );
      break;
    case "image_text":
      body = (
        <>
          <div className="relative min-h-0 flex-[1.2]">
            <SceneMedia asset={asset} camera={styles.camera} live={live} priority={priority} backgroundLayer={backgroundLayer} scrim={false} />
          </div>
          <div className={`relative ${padding}`}>{lines}</div>
        </>
      );
      break;
    case "quote":
      body = (
        <blockquote className={`relative my-auto ${padding}`}>
          <span aria-hidden="true" className="block text-6xl font-bold leading-none text-secondary-text">
            &ldquo;
          </span>
          <SceneLines scene={scene} units={styles.units} emphasis={styles.emphasis} live={live} variant={variant} quote />
        </blockquote>
      );
      break;
    case "data":
    case "comparison": {
      const comparison = scene.layout === "comparison";
      body = (
        <div className={`relative my-auto space-y-6 ${padding}`}>
          {lines}
          <dl className={comparison ? "grid grid-cols-2 gap-4" : "grid gap-4"}>
            {scene.figures.map((figure, index) => (
              <div key={`${scene.sceneId}-figure-${index}`} className="rounded-2xl border border-border bg-surface p-4">
                <dt className="text-sm font-medium text-secondary-text">{figure.label}</dt>
                <dd className="mt-2 text-primary-text">
                  <NumberCount figure={figure} localMs={styles.counterLocalMs} className={size.figure} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      );
      break;
    }
    case "outro":
      body = (
        <div className={`relative my-auto space-y-6 ${padding}`}>
          {lines}
          {outroAction ? <div>{outroAction}</div> : null}
        </div>
      );
      break;
    default:
      body = asset ? (
        <>
          <SceneMedia asset={asset} camera={styles.camera} live={live} priority={priority} backgroundLayer={backgroundLayer} scrim />
          <div className={`relative my-auto ${padding}`}>{lines}</div>
        </>
      ) : (
        <div className={`relative my-auto ${padding}`}>{lines}</div>
      );
  }

  return (
    <div
      data-story-scene={scene.sceneId}
      data-story-layout={scene.layout}
      className={`relative flex h-full w-full flex-col overflow-hidden bg-background ${className ?? ""}`}
      style={toStyle(styles.container, live)}
    >
      {body}
    </div>
  );
}
