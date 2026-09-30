"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Crop,
  Download,
  Eraser,
  MessageSquarePlus,
  MousePointer2,
  Brush,
  ChevronUp,
  ChevronDown,
  Circle,
  Eye,
  EyeOff,
  Hand,
  Hexagon,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
  Triangle,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import type { BgMode, CursorIcon, CursorMode, SizeMode, Tool } from "../CanvasDrawingTypes";
import { canvasDrawingClamp } from "../utils/canvasEngine";
import { cn } from "utils/common";
import { Button, Popover, PopoverContent, PopoverTrigger, ScrollArea } from "@amu-labs/ui";
import { useIsMobile } from "hooks/common";

type DrawTool = Extract<Tool, "pen" | "rect" | "triangle" | "ellipse" | "polygon">;

// 2행 도구 컨트롤을 의미 단위(도구/브러시/컬러/옵션)로 묶는 그룹 칩 — 도구 간 구분 강화
function ToolGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-full border border-border/60 bg-surface/40 p-1.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

// + 오버플로우 메뉴 내부 항목 — 좌측정렬 아이콘+라벨, 활성/비활성 표현
function MenuItem({
  active = false,
  icon: Icon,
  onClick,
  disabled,
  children,
}: {
  active?: boolean;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "primary" : "ghost"}
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="w-full justify-start gap-2 px-2.5 text-xs"
    >
      <Icon className="icon-xs" />
      {children}
    </Button>
  );
}

// 자유 드로잉 도구 전용 커스텀 아이콘 — 손으로 그린 듯한 squiggle 라인(lucide 미제공)
function FreeDrawIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M3.5 11C3.5 7.5 8.5 7 9 11C9.5 15 14 16 16 12C17.5 9 21 10.5 20 14C19.2 16.4 16.5 16 16.8 13.5" />
    </svg>
  );
}

// 2행 도구 선택용 아이콘 토글 버튼 — 선택/비선택 상태 표현
function ToolIconBtn({
  active,
  icon: Icon,
  iconSize = "icon-xs",
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  iconSize?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "primary" : "ghost"}
      size="icon-sm"
      rounded="full"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon className={iconSize} />
    </Button>
  );
}

function ExpandableToolbarRow({ children, gapClassName }: { children: React.ReactNode; gapClassName: string }) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = React.useState(false);

  const handleOverflowChange = React.useCallback(({ horizontal }: { horizontal: boolean; vertical: boolean }) => {
    setHasHorizontalOverflow(horizontal);
  }, []);

  // 모바일: 인라인 확장 대신 전체 메뉴를 floating Popover로 노출
  if (isMobile) {
    return (
      <div className="flex min-w-0 items-start gap-2">
        <ScrollArea
          className="min-w-0 flex-1"
          onOverflowChange={handleOverflowChange}
          wheelOnScrollX
          scrollbars="horizontal"
        >
          <div className={cn("flex w-max items-center", gapClassName)}>{children}</div>
        </ScrollArea>

        {hasHorizontalOverflow && (
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <Button
                aria-expanded={moreOpen}
                aria-label={lang({ ko: "전체 도구", en: "All tools" })}
                className="shrink-0"
                variant="outline"
                rounded="full"
                size="icon-sm"
              >
                <ChevronDown className="icon-xs" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-1.5rem))] p-2">
              <div className={cn("flex flex-wrap items-center", gapClassName)}>{children}</div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  }

  const content = (
    <div
      className={cn("flex items-center", gapClassName, expanded ? "w-full flex-wrap pb-1 [&>*]:max-w-full" : "w-max")}
    >
      {children}
    </div>
  );

  return (
    <div className="flex min-w-0 items-start gap-2">
      {expanded ? (
        <div className="min-w-0 flex-1">{content}</div>
      ) : (
        <ScrollArea
          className="min-w-0 flex-1"
          onOverflowChange={handleOverflowChange}
          wheelOnScrollX
          scrollbars="horizontal"
        >
          {content}
        </ScrollArea>
      )}

      {(hasHorizontalOverflow || expanded) && (
        <Button
          aria-expanded={expanded}
          aria-label={lang({
            ko: expanded ? "접어보기" : "펼쳐보기",
            en: expanded ? "Collapse" : "Expand",
          })}
          className="shrink-0"
          variant="outline"
          rounded="full"
          size="icon-sm"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUp className="icon-xs" /> : <ChevronDown className="icon-xs" />}
        </Button>
      )}
    </div>
  );
}

export function DrawingToolbar(props: {
  floatingUiPortalContainer: HTMLDivElement | null;
  sizeMode: SizeMode;
  setSizeMode: (v: SizeMode) => void;
  fixedW: number;
  fixedH: number;
  setFixedW: (v: number) => void;
  setFixedH: (v: number) => void;

  bgMode: BgMode;
  setBgMode: (v: BgMode) => void;
  bgColor: string;
  setBgColor: (v: string) => void;

  tool: Tool;
  setTool: (v: Tool) => void;

  // 드롭다운 표시용(선택/코멘트/지우개 상태에서도 마지막 draw tool 유지)
  drawToolValue: DrawTool;

  penSize: number;
  setPenSize: (v: number) => void;
  penColor: string;
  setPenColor: (v: string) => void;

  cursorMode: CursorMode;
  setCursorMode: (v: CursorMode) => void;
  cursorIcon: CursorIcon;
  setCursorIcon: (v: CursorIcon) => void;

  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  onClearAll: () => void;
  onDeleteSelected: () => void;

  onExportPng: () => void;
  onStartRegionCapture: () => void;
  regionCaptureActive: boolean;

  polygonUi?: {
    active: boolean;
    points: number;
    onCancel: () => void;
    onDone: () => void;
  };

  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  guideEnabled: boolean;
  setGuideEnabled: (v: boolean) => void;
  titleText?: { ko: string; en: string };
  exportLabel?: { ko: string; en: string };
  regionCaptureLabel?: { ko: string; en: string };
  hideSizeControls?: boolean;
  hideBackgroundControls?: boolean;
  hideCursorControls?: boolean;
  hideRegionCapture?: boolean;
  collapsible?: boolean;
  enableHandTool?: boolean;
  onClose?: () => void;
  imageTransformActions?: {
    onFlipX: () => void;
    onFlipY: () => void;
    onRotateCcw: () => void;
    onRotateCw: () => void;
  };
}) {
  const {
    floatingUiPortalContainer,
    sizeMode,
    setSizeMode,
    fixedW,
    fixedH,
    setFixedW,
    setFixedH,
    bgMode,
    setBgMode,
    bgColor,
    setBgColor,
    tool,
    setTool,
    penSize,
    setPenSize,
    penColor,
    setPenColor,
    cursorMode,
    setCursorMode,
    setCursorIcon,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onClearAll,
    onDeleteSelected,
    onExportPng,
    onStartRegionCapture,
    regionCaptureActive,
    polygonUi,
    titleText,
    exportLabel,
    regionCaptureLabel,
    hideSizeControls = false,
    hideBackgroundControls = false,
    hideCursorControls = false,
    hideRegionCapture = false,
    collapsible = false,
    enableHandTool = false,
    onClose,
    imageTransformActions,
  } = props;

  const [collapsed, setCollapsed] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [brushOpen, setBrushOpen] = React.useState(false);
  const [cursorMenuOpen, setCursorMenuOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const [hidden, setHidden] = React.useState(false);

  // 커서 모드별 아이콘/라벨 — 드롭다운 트리거/옵션 공통 사용
  const cursorModeIcon: Record<CursorMode, LucideIcon> = {
    icon: Brush,
    circle: Circle,
    pointer: MousePointer2,
  };
  const cursorModeLabel: Record<CursorMode, { ko: string; en: string }> = {
    icon: { ko: "아이콘", en: "Icon" },
    circle: { ko: "원형", en: "Circle" },
    pointer: { ko: "포인터", en: "Pointer" },
  };
  const CurrentCursorIcon = cursorModeIcon[cursorMode];
  const controlsId = React.useId();
  const labelClassName = "flex shrink-0 items-center gap-1";
  const selectClassName = "rounded-default border bg-surface px-2 py-1 text-xs";

  // 오버플로우 메뉴 안에서 선택되는 도구들 — 활성 시 + 트리거를 강조
  const overflowToolActive = tool === "select" || tool === "eraser" || tool === "comment" || tool === "text";
  // 도구 선택류는 선택 즉시 메뉴 닫기, Undo/Redo는 연속 사용 위해 열어 둠
  const runMenuAction = (fn: () => void, close = true) => {
    fn();
    if (close) setMoreOpen(false);
  };

  // 펜 크기 변경(슬라이더 공통) — 4 미만은 pencil 커서, 이상은 brush 커서
  const handlePenSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const s = Number(event.target.value);
    setPenSize(s);
    setCursorIcon(s < 4 ? "pencil" : "brush");
  };

  if (hidden) {
    return (
      <div data-export-ignore="true" className="absolute right-3 top-3 z-[70]">
        <Button
          variant="outline"
          size="icon-sm"
          rounded="full"
          aria-label={lang({ ko: "툴바 표시", en: "Show toolbar" })}
          className="bg-background/90 shadow-sm backdrop-blur"
          onClick={() => setHidden(false)}
        >
          <Eye className="icon-xs" />
        </Button>
      </div>
    );
  }

  return (
    <div data-export-ignore="true" className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="flex flex-col px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 truncate text-sm font-semibold">
            <Lang text={titleText || { ko: "드로잉", en: "Drawing" }} />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="primary"
              size="sm"
              rounded="full"
              onClick={onExportPng}
              aria-label={lang(exportLabel || { ko: "PNG 저장", en: "Save PNG" })}
            >
              <Download className="icon-xs" />
              <Lang text={exportLabel || { ko: "PNG 저장", en: "Save PNG" }} className="text-xs" />
            </Button>
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={overflowToolActive ? "secondary" : "primary"}
                  size="icon-sm"
                  rounded="full"
                  aria-label={lang({ ko: "도구 더보기", en: "More tools" })}
                  aria-expanded={moreOpen}
                >
                  <Plus className="icon-xs" />
                  <span className="sr-only">
                    <Lang text={{ ko: "도구", en: "Tools" }} />
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} className="w-auto min-w-[12rem] p-1.5">
                <div className="flex flex-col gap-0.5">
                  <MenuItem
                    active={tool === "select"}
                    icon={MousePointer2}
                    onClick={() => runMenuAction(() => setTool("select"))}
                  >
                    <Lang text={{ ko: "선택", en: "Select" }} />
                  </MenuItem>
                  <MenuItem
                    active={tool === "eraser"}
                    icon={Eraser}
                    onClick={() => runMenuAction(() => setTool("eraser"))}
                  >
                    <Lang text={{ ko: "지우개", en: "Eraser" }} />
                  </MenuItem>
                  <MenuItem
                    active={tool === "comment"}
                    icon={MessageSquarePlus}
                    onClick={() => runMenuAction(() => setTool("comment"))}
                  >
                    <Lang text={{ ko: "코멘트", en: "Comment" }} />
                  </MenuItem>
                  <MenuItem active={tool === "text"} icon={Type} onClick={() => runMenuAction(() => setTool("text"))}>
                    <Lang text={{ ko: "텍스트", en: "Text" }} />
                  </MenuItem>

                  {imageTransformActions ? (
                    <>
                      <div className="my-1 h-px bg-border/60" />
                      <MenuItem icon={Square} onClick={() => runMenuAction(imageTransformActions.onFlipX)}>
                        <Lang text={{ ko: "좌우 반전", en: "Flip X" }} />
                      </MenuItem>
                      <MenuItem icon={Triangle} onClick={() => runMenuAction(imageTransformActions.onFlipY)}>
                        <Lang text={{ ko: "상하 반전", en: "Flip Y" }} />
                      </MenuItem>
                      <MenuItem icon={RotateCcw} onClick={() => runMenuAction(imageTransformActions.onRotateCcw)}>
                        <Lang text={{ ko: "반시계 회전", en: "Rotate CCW" }} />
                      </MenuItem>
                      <MenuItem icon={RotateCw} onClick={() => runMenuAction(imageTransformActions.onRotateCw)}>
                        <Lang text={{ ko: "시계 회전", en: "Rotate CW" }} />
                      </MenuItem>
                    </>
                  ) : null}

                  <div className="my-1 h-px bg-border/60" />

                  <MenuItem icon={Undo2} disabled={!canUndo} onClick={() => runMenuAction(onUndo, false)}>
                    <Lang text={{ ko: "Undo", en: "Undo" }} />
                  </MenuItem>
                  <MenuItem icon={Redo2} disabled={!canRedo} onClick={() => runMenuAction(onRedo, false)}>
                    <Lang text={{ ko: "Redo", en: "Redo" }} />
                  </MenuItem>

                  <div className="my-1 h-px bg-border/60" />

                  <MenuItem icon={Trash2} onClick={() => runMenuAction(onDeleteSelected)}>
                    <Lang text={{ ko: "선택 삭제", en: "Delete" }} />
                  </MenuItem>
                  <MenuItem icon={Eraser} onClick={() => runMenuAction(onClearAll)}>
                    <Lang text={{ ko: "전체 지우기", en: "Clear" }} />
                  </MenuItem>

                  <div className="my-1 h-px bg-border/60" />

                  <MenuItem icon={EyeOff} onClick={() => runMenuAction(() => setHidden(true))}>
                    <Lang text={{ ko: "툴바 숨기기", en: "Hide toolbar" }} />
                  </MenuItem>
                </div>
              </PopoverContent>
            </Popover>

            {collapsible && (
              <Button
                variant="outline"
                size="icon-sm"
                rounded="full"
                aria-expanded={!collapsed}
                aria-controls={controlsId}
                aria-label={lang({
                  ko: collapsed ? "툴바 펼치기" : "툴바 접기",
                  en: collapsed ? "Expand toolbar" : "Collapse toolbar",
                })}
                onClick={() => setCollapsed((prev) => !prev)}
              >
                {collapsed ? <ChevronUp className="icon-xs" /> : <ChevronDown className="icon-xs" />}
              </Button>
            )}
            {onClose ? (
              <Button
                variant="outline"
                size="icon-sm"
                rounded="full"
                aria-label={lang({ ko: "드로잉 닫기", en: "Close drawing" })}
                onClick={onClose}
              >
                <X className="icon-xs" />
              </Button>
            ) : null}
          </div>
        </div>

        {!collapsed && (
          <div id={controlsId} className="flex flex-col">
            <ExpandableToolbarRow gapClassName="gap-2">
              {!hideSizeControls && (
                <label className={labelClassName}>
                  <span className="text-xs opacity-80">
                    <Lang text={{ ko: "사이즈", en: "Size" }} />
                  </span>
                  <select
                    className={selectClassName}
                    value={sizeMode}
                    onChange={(e) => setSizeMode(e.target.value as SizeMode)}
                  >
                    <option value="fixed">
                      <Lang text={{ ko: "가로/세로 지정", en: "Fixed" }} />
                    </option>
                    <option value="parent">
                      <Lang text={{ ko: "부모에 맞춤", en: "Fit parent" }} />
                    </option>
                    <option value="window">
                      <Lang text={{ ko: "윈도우에 맞춤", en: "Fit window" }} />
                    </option>
                  </select>
                </label>
              )}

              {!hideBackgroundControls && (
                <label className={labelClassName}>
                  <span className="text-xs opacity-80">
                    <Lang text={{ ko: "배경", en: "Background" }} />
                  </span>
                  <select
                    className={selectClassName}
                    value={bgMode}
                    onChange={(e) => setBgMode(e.target.value as BgMode)}
                  >
                    <option value="white">
                      <Lang text={{ ko: "화이트", en: "White" }} />
                    </option>
                    <option value="color">
                      <Lang text={{ ko: "컬러", en: "Color" }} />
                    </option>
                    <option value="transparent">
                      <Lang text={{ ko: "투명", en: "Transparent" }} />
                    </option>
                  </select>
                </label>
              )}

              <ToolGroup>
                {!hideRegionCapture && (
                  <ToolIconBtn
                    active={regionCaptureActive}
                    icon={Crop}
                    label={lang(regionCaptureLabel || { ko: "영역 캡쳐", en: "Region capture" })}
                    onClick={onStartRegionCapture}
                  />
                )}
              </ToolGroup>

              <ToolGroup>
                {enableHandTool && (
                  <ToolIconBtn
                    active={tool === "hand"}
                    icon={Hand}
                    label={lang({ ko: "이동(손바닥)", en: "Pan (hand)" })}
                    onClick={() => setTool("hand")}
                  />
                )}
              </ToolGroup>

              <ToolGroup className="gap-1">
                <span className="mx-2 text-xs">
                  <Lang text={{ ko: "모양", en: "Shape" }} />
                </span>
                <ToolIconBtn
                  active={tool === "pen"}
                  icon={FreeDrawIcon}
                  iconSize="icon-sm"
                  label={lang({ ko: "자유 드로잉", en: "Free draw" })}
                  onClick={() => setTool("pen")}
                />
                <ToolIconBtn
                  active={tool === "rect"}
                  icon={Square}
                  label={lang({ ko: "사각형", en: "Rectangle" })}
                  onClick={() => setTool("rect")}
                />
                <ToolIconBtn
                  active={tool === "triangle"}
                  icon={Triangle}
                  label={lang({ ko: "삼각형", en: "Triangle" })}
                  onClick={() => setTool("triangle")}
                />
                <ToolIconBtn
                  active={tool === "ellipse"}
                  icon={Circle}
                  label={lang({ ko: "원/타원", en: "Ellipse" })}
                  onClick={() => setTool("ellipse")}
                />
                <ToolIconBtn
                  active={tool === "polygon"}
                  icon={Hexagon}
                  label={lang({ ko: "폴리곤", en: "Polygon" })}
                  onClick={() => setTool("polygon")}
                />
              </ToolGroup>

              <ToolGroup className="gap-1.5 pr-2.5">
                {!isMobile ? (
                  <Popover open={brushOpen} onOpenChange={setBrushOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant={brushOpen ? "primary" : "ghost"}
                        size="sm"
                        rounded="full"
                        className="gap-1.5 px-2.5 text-xs"
                        aria-label={lang({ ko: "브러시 크기", en: "Brush size" })}
                      >
                        <Brush className="icon-xs" />
                        <span className="tabular-nums">{penSize}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="start" sideOffset={8} className="w-56 p-3">
                      <div className="flex items-center gap-3">
                        <Circle className="opacity-70" style={{ width: penSize, height: penSize }} />
                        <input
                          aria-label="pen-size"
                          type="range"
                          min={1}
                          max={60}
                          value={penSize}
                          onChange={handlePenSizeChange}
                          className="w-full"
                        />
                        <span className="w-6 text-right text-xs tabular-nums">{penSize}</span>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Button
                    variant={brushOpen ? "primary" : "ghost"}
                    size="sm"
                    rounded="full"
                    className="gap-1.5 px-2.5 text-xs"
                    aria-label={lang({ ko: "브러시 크기", en: "Brush size" })}
                    onClick={() => setBrushOpen((v) => !v)}
                  >
                    <Brush className="icon-xs" />
                    <span className="tabular-nums">{penSize}</span>
                  </Button>
                )}

                <label
                  className="relative icon-xs cursor-pointer rounded-full border border-border/60"
                  style={{ backgroundColor: penColor }}
                >
                  <input
                    aria-label="pen-color"
                    type="color"
                    value={penColor}
                    onChange={(event) => setPenColor(event.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>

                {!hideBackgroundControls && bgMode === "color" && (
                  <label className={labelClassName}>
                    <span className="text-xs opacity-80">
                      <Lang text={{ ko: "배경 컬러", en: "BG" }} />
                    </span>
                    <input
                      aria-label="bg-color"
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer rounded-full bg-translate"
                    />
                  </label>
                )}

                {!hideSizeControls && sizeMode === "fixed" && (
                  <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-muted/20 px-2 py-2">
                    <label className={labelClassName}>
                      <span className="text-xs opacity-80">W</span>
                      <input
                        type="number"
                        value={fixedW}
                        onChange={(e) => setFixedW(canvasDrawingClamp(Number(e.target.value) || 1, 200, 4000))}
                        className="w-24 rounded-default border bg-background px-2 py-1 text-xs"
                      />
                    </label>
                    <label className={labelClassName}>
                      <span className="text-xs opacity-80">H</span>
                      <input
                        type="number"
                        value={fixedH}
                        onChange={(e) => setFixedH(canvasDrawingClamp(Number(e.target.value) || 1, 200, 4000))}
                        className="w-24 rounded-default border bg-background px-2 py-1 text-xs"
                      />
                    </label>
                  </div>
                )}
              </ToolGroup>

              <ToolGroup>
                {!hideCursorControls && (
                  <label className={labelClassName}>
                    <span className="mx-2 text-xs">
                      <Lang text={{ ko: "커서", en: "Cursor" }} />
                    </span>
                    <Popover open={cursorMenuOpen} onOpenChange={setCursorMenuOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 px-2 text-xs"
                          aria-label={lang({ ko: "커서 모양", en: "Cursor style" })}
                        >
                          <CurrentCursorIcon className="icon-xs" />
                          <Lang text={cursorModeLabel[cursorMode]} />
                          <ChevronDown className="icon-xs opacity-60" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={8} className="w-auto min-w-[8.5rem] p-1.5">
                        <div className="flex flex-col gap-0.5">
                          {(["icon", "circle", "pointer"] as const).map((mode) => (
                            <MenuItem
                              key={mode}
                              active={cursorMode === mode}
                              icon={cursorModeIcon[mode]}
                              onClick={() => {
                                setCursorMode(mode);
                                setCursorMenuOpen(false);
                              }}
                            >
                              <Lang text={cursorModeLabel[mode]} />
                            </MenuItem>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </label>
                )}
              </ToolGroup>

              <ToolGroup className="h-12 px-4 mr-2 ">
                <label className={cn(labelClassName, "gap-1.5")}>
                  <span className="text-xs opacity-80">
                    <Lang text={{ ko: "스냅", en: "Snap" }} />
                  </span>
                  <input
                    type="checkbox"
                    checked={props.snapEnabled}
                    onChange={(e) => props.setSnapEnabled(e.target.checked)}
                  />
                </label>

                <label className={cn(labelClassName, "gap-1.5")}>
                  <span className="text-xs opacity-80">
                    <Lang text={{ ko: "가이드", en: "Guides" }} />
                  </span>
                  <input
                    type="checkbox"
                    checked={props.guideEnabled}
                    onChange={(e) => props.setGuideEnabled(e.target.checked)}
                  />
                </label>
              </ToolGroup>

              <div className="shrink-0 text-xxs opacity-70">
                <Lang text={{ ko: "※ Alt 누르면 스냅 임시 해제", en: "Tip: Hold Alt to temporarily disable snap" }} />
              </div>
            </ExpandableToolbarRow>
          </div>
        )}

        {!collapsed && polygonUi?.active && polygonUi.points > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2">
            <div className="text-xs opacity-80">
              <Lang text={{ ko: "폴리곤 점 추가 중", en: "Adding polygon points" }} /> ·{" "}
              <Lang text={{ ko: "점 수", en: "Points" }} />: {polygonUi.points}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 px-3 text-xs" onClick={polygonUi.onCancel}>
                <X className="icon-xs" />
                <Lang text={{ ko: "취소", en: "Cancel" }} />
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="gap-1.5 px-3 text-xs"
                disabled={polygonUi.points < 3}
                onClick={polygonUi.onDone}
              >
                <Check className="icon-xs" />
                <Lang text={{ ko: "완료", en: "Done" }} />
              </Button>
            </div>
          </div>
        )}

        {/* 모바일 세로 플로팅 슬라이더 — 툴바의 backdrop-blur 컨테이닝 블록은 피하되,
            Radix Dialog의 포인터 입력 경계 안에 유지하도록 편집기 루트로 portal */}
        {isMobile &&
          brushOpen &&
          floatingUiPortalContainer &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[95]" aria-hidden onClick={() => setBrushOpen(false)} />
              <div className="fixed right-3 top-1/2 z-[100] flex -translate-y-1/2 flex-col items-center gap-2 rounded-full border bg-popover p-3 shadow-lg">
                <span className="text-xs font-medium tabular-nums">{penSize}</span>
                <input
                  aria-label="pen-size"
                  type="range"
                  min={1}
                  max={60}
                  value={penSize}
                  onChange={handlePenSizeChange}
                  className="h-44"
                  style={{ writingMode: "vertical-lr", direction: "rtl" }}
                />
                <Brush className="icon-xs opacity-70" />
              </div>
            </>,
            floatingUiPortalContainer,
          )}
      </div>
    </div>
  );
}
