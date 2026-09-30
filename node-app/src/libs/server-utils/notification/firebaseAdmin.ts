import "server-only";
import admin from "firebase-admin";

const FCM_ENABLED =
  String(process.env.FCM_ENABLED || "false")
    .trim()
    .toLowerCase() === "true";
const FCM_PROJECT_ID = String(process.env.FCM_PROJECT_ID || "").trim();

let initialized = false;

function ensureInitialized() {
  if (!FCM_ENABLED) {
    throw new Error("fcm_disabled");
  }

  if (admin.apps.length > 0) {
    initialized = true;
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    ...(FCM_PROJECT_ID ? { projectId: FCM_PROJECT_ID } : {}),
  });

  initialized = true;
}

export function getFirebaseMessaging() {
  if (!initialized) ensureInitialized();
  return admin.messaging();
}
