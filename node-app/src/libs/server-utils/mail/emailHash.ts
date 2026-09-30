import { createHmac } from "node:crypto";

export function normalizeMailRecipient(email: string) {
  return email.trim().toLowerCase();
}

export function getMailRecipientHash(email: string, secret: string) {
  if (!secret) throw new Error("MAIL_HASH_SECRET_REQUIRED");
  return createHmac("sha256", secret)
    .update(`mail-suppression:v1:${normalizeMailRecipient(email)}`, "utf8")
    .digest("hex");
}
