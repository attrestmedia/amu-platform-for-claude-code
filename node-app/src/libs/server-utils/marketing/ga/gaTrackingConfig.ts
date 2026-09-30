import "server-only";
import { getUniverseMarketingAnalyticsSettings } from "libs/database/universe";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import {
  DEFAULT_GA_APP_MEASUREMENT_ID,
  pickLegacyGaMeasurementId,
} from "libs/marketing/analytics/gaMeasurementIdContract";
import { logger } from "utils/log";

const DEFAULT_GA_TRACKING_UNIVERSE_ID = "amu";

function toBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "on", "enabled"].includes(text);
}

export async function getGaTrackingSettings(universeId = DEFAULT_GA_TRACKING_UNIVERSE_ID) {
  try {
    const universeSettings = await getUniverseMarketingAnalyticsSettings(universeId);
    if (universeSettings?.measurementId) {
      return {
        measurementId: universeSettings.measurementId,
        trackingEnabled: universeSettings.trackingEnabled !== false,
        source: "universe" as const,
      };
    }
  } catch (error) {
    logger.warn("[gaTracking] universe marketing settings unavailable; checking legacy credential", {
      universeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const credential = await getDecryptedCredential(universeId, "google_analytics");
    const extras = credential?.extras || {};
    const legacyMeasurementId = pickLegacyGaMeasurementId(extras);
    if (legacyMeasurementId) {
      return {
        measurementId: legacyMeasurementId,
        trackingEnabled: toBool(extras.enabled),
        source: "legacy_credential" as const,
      };
    }

    return {
      measurementId: DEFAULT_GA_APP_MEASUREMENT_ID,
      trackingEnabled: credential ? toBool(extras.enabled) : true,
      source: "default" as const,
    };
  } catch (error) {
    logger.warn("[gaTracking] legacy credential measurement id unavailable", {
      universeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      measurementId: DEFAULT_GA_APP_MEASUREMENT_ID,
      trackingEnabled: true,
      source: "default" as const,
    };
  }
}

export async function resolveGaTrackingMeasurementId(universeId = DEFAULT_GA_TRACKING_UNIVERSE_ID) {
  const settings = await getGaTrackingSettings(universeId);
  return settings.trackingEnabled ? settings.measurementId : "";
}
