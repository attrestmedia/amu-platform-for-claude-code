import "styles/modules/loading-dots.scss";

export function LoadingDots() {
  return (
    <span className="loading-dots" aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}
