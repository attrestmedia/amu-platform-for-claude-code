import { cn } from "src/utils/common";

export const formSize: Record<string, Record<string, string>> = {
  xxs: {
    width: "w-4",
    height: "h-4",
  },
  xs: {
    width: "w-6",
    height: "h-6",
  },
  sm: {
    width: "w-8",
    height: "h-8",
  },
  md: {
    width: "w-10",
    height: "h-10",
  },
  lg: {
    width: "w-12",
    height: "h-12",
  },
  xl: {
    width: "w-14",
    height: "h-14",
  },
};

export const formSizeUtilities: Record<string, string> = {
  xs: cn(formSize.xs.height, "px-2 py-1 text-xs rounded-sm"),
  sm: cn(formSize.sm.height, "px-3 py-1 text-sm rounded-md"),
  md: cn(formSize.md.height, "px-4 py-2 text-base rounded-default"),
  lg: cn(formSize.lg.height, "px-5 py-3 text-lg rounded-default"),
  xl: cn(formSize.xl.height, "px-6 py-4 text-xl rounded-xl"),
};
