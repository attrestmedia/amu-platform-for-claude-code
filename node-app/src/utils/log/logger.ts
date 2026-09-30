/**
 * @docHint
 * @purpose logger 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain logging
 * @scope global
 */

export type LogLevel = "log" | "info" | "warn" | "error" | "debug" | "trace";

type LogArg = unknown;
type LogArgs = LogArg[];
type LogStyleOptionValue = string | number | boolean | null | undefined;

const LOG_STYLE_TRIGGER_KEYS = [
  "color",
  "background",
  "bold",
  "italic",
  "underline",
  "fontSize",
  "padding",
  "border",
] as const;
const LOG_STYLE_RESERVED_KEYS = [
  "color",
  "background",
  "bold",
  "italic",
  "underline",
  "fontSize",
  "padding",
  "border",
] as const;

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const isLogStyleOptions = (value: unknown): value is LogStyleOptions => {
  if (!isObjectRecord(value)) return false;
  return LOG_STYLE_TRIGGER_KEYS.some((key) => key in value);
};

const appendCssRule = (styleString: string, key: string, value: LogStyleOptionValue) => {
  if (value === undefined || value === null || typeof value === "boolean") return styleString;
  return `${styleString}${key.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${value}; `;
};

// 스타일 옵션 타입 정의
export interface LogStyleOptions {
  color?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: string;
  padding?: string;
  border?: string;
  // 기타 CSS 속성도 추가 가능
  [key: string]: LogStyleOptionValue;
}

/**
 * logger.log("메시지", { color: "green" });
 * logger.log("[TAG]", "메시지", { color: "blue", bold: true });
 * @returns
 */
const createLogger = () => {
  // 클라이언트인지 서버인지 환경 감지
  const isClient = typeof window !== "undefined";
  const isProduction = process.env.NODE_ENV === "production";

  // 스타일 옵션 처리 함수
  const processArgs = (args: LogArgs): [LogArgs, string | null, string | null] => {
    const newArgs = [...args];
    let styleString: string | null = null;
    let prefix: string | null = null;

    // 마지막 인자가 스타일 객체인지 확인
    if (newArgs.length > 0 && isLogStyleOptions(newArgs[newArgs.length - 1])) {
      const styleObj = newArgs.pop() as LogStyleOptions;
      styleString = "";

      // 스타일 문자열 생성
      if (styleObj.color) styleString += `color: ${styleObj.color}; `;
      if (styleObj.background) styleString += `background: ${styleObj.background}; `;
      if (styleObj.bold) styleString += "font-weight: bold; ";
      if (styleObj.italic) styleString += "font-style: italic; ";
      if (styleObj.underline) styleString += "text-decoration: underline; ";
      if (styleObj.fontSize) styleString += `font-size: ${styleObj.fontSize}; `;
      if (styleObj.padding) styleString += `padding: ${styleObj.padding}; `;
      if (styleObj.border) styleString += `border: ${styleObj.border}; `;

      // 기타 CSS 속성 처리
      Object.entries(styleObj).forEach(([key, value]) => {
        if ((LOG_STYLE_RESERVED_KEYS as readonly string[]).includes(key)) return;
        styleString = appendCssRule(styleString || "", key, value);
      });
    }

    // 첫 번째 인자가 [TAG] 형식인지 확인
    if (newArgs.length > 0 && typeof newArgs[0] === "string" && newArgs[0].match(/^\[.*\]$/)) {
      prefix = newArgs.shift() as string;
    }

    return [newArgs, styleString, prefix];
  };

  // 서버 측 로깅 함수
  const serverLog = (method: LogLevel, ...args: LogArgs): void => {
    if (isProduction && method !== "error") return; // 프로덕션에서는 error만 로깅

    try {
      // 서버에서는 스타일 옵션을 무시하고 표준 출력
      const [processedArgs, , prefix] = processArgs(args);
      if (prefix) {
        console[method](prefix, ...processedArgs);
      } else {
        console[method](...processedArgs);
      }
    } catch {}
  };

  // 클라이언트 측 로깅 함수
  const clientLog = (method: LogLevel, ...args: LogArgs): void => {
    if (isProduction) return; // 프로덕션에서는 로깅 안 함

    try {
      const [processedArgs, styleString, prefix] = processArgs(args);

      if (method === "error") {
        // 에러는 항상 빨간색으로 표시
        const errorStyle = "color: red; font-weight: bold";
        if (prefix) {
          console.warn(`%c${prefix}`, errorStyle, ...processedArgs);
        } else {
          console.warn("%c[ERROR]", errorStyle, ...processedArgs);
        }
      } else if (styleString && prefix) {
        // 스타일과 접두사가 모두 있는 경우
        console[method](`%c${prefix}`, styleString, ...processedArgs);
      } else if (styleString) {
        // 스타일만 있는 경우, 첫 번째 인자에 스타일 적용
        if (processedArgs.length > 0 && typeof processedArgs[0] === "string") {
          console[method](`%c${processedArgs[0]}`, styleString, ...processedArgs.slice(1));
        } else {
          // 첫 번째 인자가 문자열이 아닌 경우 별도로 처리
          console[method]("%c▶", styleString, ...processedArgs);
        }
      } else if (prefix) {
        // 접두사만 있는 경우
        console[method](prefix, ...processedArgs);
      } else {
        // 스타일과 접두사가 모두 없는 경우
        console[method](...processedArgs);
      }
    } catch {}
  };

  // 환경에 따라 적절한 로깅 함수 선택
  const log = (method: LogLevel, ...args: LogArgs): void => {
    if (isClient) {
      clientLog(method, ...args);
    } else {
      serverLog(method, ...args);
    }
  };

  // 프리셋 컬러 스타일 함수들
  const colorLog = (color: string, ...args: LogArgs) => {
    const lastArg = args.at(-1);
    if (isObjectRecord(lastArg)) {
      if ("color" in lastArg) {
        // 이미 컬러 옵션이 있으면 그대로 사용
        log("log", ...args);
        return;
      }
    }
    log("log", ...args, { color });
  };

  return {
    log: (...args: LogArgs) => log("log", ...args),
    info: (...args: LogArgs) => log("info", ...args),
    warn: (...args: LogArgs) => log("warn", ...args),
    error: (...args: LogArgs): void => {
      if (isClient) {
        clientLog("error", ...args);
      } else {
        serverLog("error", ...args);
      }
    },
    debug: (...args: LogArgs) => log("debug", ...args),
    trace: (...args: LogArgs) => log("trace", ...args),

    // 컬러 프리셋 메서드들
    success: (...args: LogArgs) => colorLog("#4CAF50", ...args), // 녹색
    primary: (...args: LogArgs) => colorLog("#2196F3", ...args), // 파랑
    secondary: (...args: LogArgs) => colorLog("#9C27B0", ...args), // 보라
    highlight: (...args: LogArgs) => colorLog("#FF9800", ...args), // 주황

    // 스타일 적용 메서드 (좀 더 복잡한 스타일링)
    styled: (styleOptions: LogStyleOptions, ...args: LogArgs) => {
      log("log", ...args, styleOptions);
    },

    // 그룹 기능
    group: (label?: string, styleOptions?: LogStyleOptions): void => {
      if (isProduction) return;
      try {
        if (isClient && styleOptions) {
          const [, styleString] = processArgs([styleOptions]);
          if (styleString && label) {
            console.group(`%c${label}`, styleString);
          } else {
            console.group(label);
          }
        } else {
          console.group(label);
        }
      } catch {}
    },

    // 기존 메서드들...
    groupEnd: (): void => {
      if (isProduction) return;
      try {
        console.groupEnd();
      } catch {}
    },
    time: (label: string): void => {
      if (isProduction) return;
      try {
        console.time(label);
      } catch {}
    },
    timeEnd: (label: string): void => {
      if (isProduction) return;
      try {
        console.timeEnd(label);
      } catch {}
    },
    table: (tabularData: unknown, properties?: readonly string[]): void => {
      if (isProduction || !isClient) return;
      try {
        console.table(tabularData, properties);
      } catch {}
    },
    if: (condition: boolean, ...args: LogArgs): void => {
      if (condition) {
        log("log", ...args);
      }
    },
    level: (level: LogLevel, ...args: LogArgs): void => {
      log(level, ...args);
    },
    server: {
      log: (...args: LogArgs) => serverLog("log", ...args),
      info: (...args: LogArgs) => serverLog("info", ...args),
      warn: (...args: LogArgs) => serverLog("warn", ...args),
      error: (...args: LogArgs) => serverLog("error", ...args),
      debug: (...args: LogArgs) => serverLog("debug", ...args),
      trace: (...args: LogArgs) => serverLog("trace", ...args),
    },
    client: {
      log: (...args: LogArgs) => clientLog("log", ...args),
      info: (...args: LogArgs) => clientLog("info", ...args),
      warn: (...args: LogArgs) => clientLog("warn", ...args),
      error: (...args: LogArgs) => clientLog("error", ...args),
      debug: (...args: LogArgs) => clientLog("debug", ...args),
      trace: (...args: LogArgs) => clientLog("trace", ...args),
    },
  };
};

const logger = createLogger();
export default logger;
