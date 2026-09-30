"use client";

import { useEffect, useRef } from "react";

type AppVersionPayload = {
  app?: string;
  version?: string;
  buildId?: string;
  gitCommit?: string;
  buildTime?: string;
};

declare global {
  interface Window {
    __AMU_SERVICE_WORKER__?: {
      enabled: boolean;
      registration?: ServiceWorkerRegistration;
      version?: AppVersionPayload;
      updateReady?: boolean;
      unregister: () => Promise<void>;
      checkVersion: () => Promise<AppVersionPayload | null>;
    };
  }
}

const ENABLED_FLAG = process.env.NEXT_PUBLIC_ENABLE_SERVICE_WORKER;
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const VERSION_URL = "/app-version.json";
const SW_URL = "/sw.js";

function isServiceWorkerEnabled() {
  if (process.env.NODE_ENV !== "production") return false;
  if (ENABLED_FLAG === "false" || ENABLED_FLAG === "0") return false;
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

function emitServiceWorkerEvent(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(`amu:service-worker:${name}`, { detail }));
}

async function fetchAppVersion() {
  const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as AppVersionPayload | null;
}

async function unregisterAll() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

function hasPendingCriticalFlow() {
  const active = document.querySelector(
    [
      "[data-amu-generation-pending='true']",
      "[data-amu-payment-flow='true']",
      "[data-amu-unsaved='true']",
      "textarea[data-dirty='true']",
      "form[data-dirty='true']",
    ].join(","),
  );
  return Boolean(active);
}

export default function ServiceWorkerRegistrar() {
  const versionRef = useRef<AppVersionPayload | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isServiceWorkerEnabled()) {
      window.__AMU_SERVICE_WORKER__ = {
        enabled: false,
        unregister: unregisterAll,
        checkVersion: fetchAppVersion,
      };
      return;
    }

    let cancelled = false;

    const checkVersion = async () => {
      try {
        const next = await fetchAppVersion();
        if (!next?.version) return next;

        const prev = versionRef.current;
        versionRef.current = next;

        if (prev?.version && prev.version !== next.version) {
          window.__AMU_SERVICE_WORKER__ = {
            ...(window.__AMU_SERVICE_WORKER__ || {}),
            enabled: true,
            version: next,
            updateReady: true,
            unregister: unregisterAll,
            checkVersion,
          };

          emitServiceWorkerEvent("version-ready", {
            previous: prev,
            next,
            hasPendingCriticalFlow: hasPendingCriticalFlow(),
          });
        }

        return next;
      } catch (error) {
        emitServiceWorkerEvent("version-check-failed", { message: error instanceof Error ? error.message : String(error) });
        return null;
      }
    };

    const register = async () => {
      try {
        const initialVersion = await checkVersion();
        const registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
        if (cancelled) return;

        window.__AMU_SERVICE_WORKER__ = {
          enabled: true,
          registration,
          version: initialVersion || undefined,
          updateReady: false,
          unregister: unregisterAll,
          checkVersion,
        };

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              window.__AMU_SERVICE_WORKER__ = {
                ...(window.__AMU_SERVICE_WORKER__ || {}),
                enabled: true,
                registration,
                updateReady: true,
                unregister: unregisterAll,
                checkVersion,
              };
              emitServiceWorkerEvent("update-ready", { hasPendingCriticalFlow: hasPendingCriticalFlow() });
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          emitServiceWorkerEvent("controllerchange");
        });

        intervalRef.current = window.setInterval(() => {
          void registration.update();
          void checkVersion();
        }, CHECK_INTERVAL_MS);

        emitServiceWorkerEvent("registered", { scope: registration.scope, version: initialVersion });
      } catch (error) {
        emitServiceWorkerEvent("register-failed", { message: error instanceof Error ? error.message : String(error) });
      }
    };

    void register();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return null;
}
