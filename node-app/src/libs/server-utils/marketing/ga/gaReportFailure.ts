type GaReportFailureContract = {
  optional?: boolean;
  requiredCustomDimensions?: string[];
};

export function classifyGaReportFailure(config: GaReportFailureContract, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const missingCustomDimension = /customEvent:[a-zA-Z0-9_]+/.test(message)
    && /is not a valid dimension|Did you mean customEvent:/i.test(message);
  if (config.optional && config.requiredCustomDimensions?.length && missingCustomDimension) {
    return {
      skipped: true as const,
      warning: "ga_report_prerequisites_missing" as const,
      requiredCustomDimensions: [...config.requiredCustomDimensions],
    };
  }
  return { error: message };
}
