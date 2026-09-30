import { sampleNumberCount, type DataFigure } from "../../../../../motion-story";

/**
 * 결정적 장면 컴포넌트 — (figure, localMs) → DOM. 시간은 상위가 넘긴다.
 * 시각 숫자는 aria-hidden, 스크린리더에는 최종값 문장만 노출한다 (aria-live 없음).
 */

const formatters = new Map<number, Intl.NumberFormat>();

function formatValue(value: number, precision: number) {
  let formatter = formatters.get(precision);
  if (!formatter) {
    formatter = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: precision, maximumFractionDigits: precision });
    formatters.set(precision, formatter);
  }
  return formatter.format(value);
}

export function NumberCount({ figure, localMs, className }: { figure: DataFigure; localMs: number; className?: string }) {
  const precision = figure.precision ?? 0;
  const shown = sampleNumberCount(0, figure.value, localMs);
  const finalText = `${formatValue(figure.value, precision)}${figure.unit ?? ""}`;
  return (
    <span className={className}>
      <span aria-hidden="true" className="tabular-nums">
        {formatValue(shown, precision)}
        {figure.unit ? <span className="ml-0.5 text-[0.55em] font-semibold">{figure.unit}</span> : null}
      </span>
      <span className="sr-only">{finalText}</span>
    </span>
  );
}
