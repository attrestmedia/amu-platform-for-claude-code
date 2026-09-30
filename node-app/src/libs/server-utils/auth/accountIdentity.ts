import "server-only";
import crypto from "crypto";
import { NEXTAUTH_SECRET } from "consts/env/server";

export function accountIdentityHash(email: string) {
  return crypto
    .createHmac("sha256", NEXTAUTH_SECRET)
    .update(email.trim().toLowerCase())
    .digest("hex");
}
