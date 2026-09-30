import crypto from "node:crypto";

function deriveKey(raw: string): Buffer {
  if (!raw) throw new Error("Credential encryption key is missing");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  if (raw.length === 32) return Buffer.from(raw);
  return crypto.scryptSync(raw, "amu-credentials", 32);
}

export function encryptSecretWithKey(plain: string, rawKey: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(rawKey), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecretWithKey(packed: string, rawKey: string): string {
  if (!packed) return "";
  const [version, ivBase64, tagBase64, dataBase64] = packed.split(":");
  if (version !== "v1") throw new Error("Unsupported secret version");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(rawKey),
    Buffer.from(ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataBase64, "base64")), decipher.final()]).toString("utf8");
}
