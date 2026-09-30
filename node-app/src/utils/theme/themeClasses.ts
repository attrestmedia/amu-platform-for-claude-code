import { cn } from "utils/common";

export const PAGE_LAYOUT_CLASS = "min-h-[100dvh] bg-background text-primary-text";
export const STAT_CARD_CLASS = "rounded-xl border border-border/70 bg-surface/80 p-4";
export const DETAIL_BAR_CLASS = "rounded-xl border border-border/70 bg-background/70 p-3";
export const SHEET_CLASS =
  "h-[100dvh] max-h-[100dvh] w-full overflow-hidden border-t border-border bg-background p-0 text-primary-text";
export const SHEET_HEADER_CLASS = "border-b border-border bg-background/95 px-4 py-3";

export const THEME_OVERRIDE_CLASS = cn(
  "[&_.border-gray-200]:!border-border/70",
  "[&_.border-gray-300]:!border-border/70",
  "[&_.border-slate-200]:!border-border/70",
  "[&_.border-yellow-200]:!border-amber-400/40",
  "[&_.border-red-200]:!border-red-400/40",
  "[&_.bg-white]:!bg-background/80",
  "[&_.bg-gray-50]:!bg-background/70",
  "[&_.bg-gray-100]:!bg-background/70",
  "[&_.bg-slate-50]:!bg-background/70",
  "[&_.bg-slate-100]:!bg-background/80",
  "[&_.bg-slate-200]:!bg-background/90",
  "[&_.bg-yellow-50]:!bg-amber-500/10",
  "[&_.bg-red-50]:!bg-red-500/10",
  "[&_.text-gray-700]:!text-primary-text",
  "[&_.text-gray-600]:!text-secondary-text",
  "[&_.text-gray-500]:!text-secondary-text",
  "[&_.text-gray-400]:!text-secondary-text",
  "[&_.text-gray-900]:!text-primary-text",
  "[&_.text-gray-800]:!text-primary-text",
  "[&_.text-slate-900]:!text-primary-text",
  "[&_.text-slate-800]:!text-primary-text",
  "[&_.text-slate-700]:!text-primary-text",
  "[&_.text-slate-600]:!text-secondary-text",
  "[&_.text-slate-500]:!text-secondary-text",
  "[&_.text-yellow-700]:!text-amber-600",
  "[&_.text-red-700]:!text-red-500",
  // dark 모드 한정: amber/emerald/rose/sky 톤 가독성 회복 (light 모드 시각은 보존)
  "dark:[&_.bg-amber-50]:!bg-amber-500/10",
  "dark:[&_.bg-amber-100]:!bg-amber-500/20",
  "dark:[&_.border-amber-200]:!border-amber-500/30",
  "dark:[&_.text-amber-700]:!text-amber-300",
  "dark:[&_.text-amber-800]:!text-amber-300",
  "dark:[&_.text-amber-900]:!text-amber-200",
  "dark:[&_.text-amber-950]:!text-amber-100",
  "dark:[&_.bg-emerald-100]:!bg-emerald-500/20",
  "dark:[&_.text-emerald-700]:!text-emerald-300",
  "dark:[&_.bg-rose-50]:!bg-rose-500/10",
  "dark:[&_.bg-rose-100]:!bg-rose-500/20",
  "dark:[&_.text-rose-700]:!text-rose-300",
  "dark:[&_.text-rose-900]:!text-rose-200",
  "dark:[&_.bg-sky-50]:!bg-sky-500/10",
  "dark:[&_.bg-sky-100]:!bg-sky-500/20",
  "dark:[&_.border-sky-300]:!border-sky-500/40",
  "dark:[&_.text-sky-700]:!text-sky-300",
);
