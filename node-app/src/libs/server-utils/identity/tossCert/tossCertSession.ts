import "server-only";
import { createDecipheriv, publicEncrypt, randomBytes, randomUUID, constants as cryptoConstants } from "node:crypto";
import { TOSS_CERT_BASE64_PUBLIC_KEY } from "./tossCertConfig";
import { TossCertSessionIntegrityError } from "./tossCertErrors";

// Ported from toss/toss-cert-examples nodejs/src/functions.js at
// 0e61e76ccc4c7639f7691ba2d2b82814b1626c27. AES test vectors are in that commit's test_data/aes_test_data.
export type TossCertSession = { sessionKey: string; decrypt(encrypted: string): string };
export type TossCertSessionDependencies = {
  publicKey?: string;
  randomBytes?: (size: number) => Buffer;
  randomUUID?: () => string;
};

function decodeBase64(value: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new TossCertSessionIntegrityError();
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new TossCertSessionIntegrityError();
  return decoded;
}

export function createTossCertSession(dependencies: TossCertSessionDependencies = {}): TossCertSession {
  const getRandomBytes = dependencies.randomBytes ?? randomBytes;
  const sessionId = (dependencies.randomUUID ?? randomUUID)();
  const secretKey = getRandomBytes(32).toString("base64");
  const iv = getRandomBytes(12).toString("base64");
  const secretKeyBytes = Buffer.from(secretKey, "base64");
  const ivBytes = Buffer.from(iv, "base64");
  const sessionAesKey = `AES_GCM$${secretKey}$${iv}`;
  const publicKey = dependencies.publicKey ?? TOSS_CERT_BASE64_PUBLIC_KEY;

  let encryptedSessionKey: Buffer;
  try {
    encryptedSessionKey = publicEncrypt(
      {
        key: `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,
        padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha1",
      },
      Buffer.from(sessionAesKey, "utf8"),
    );
  } catch {
    throw new TossCertSessionIntegrityError();
  }

  return {
    sessionKey: `v1$${sessionId}$${encryptedSessionKey.toString("base64")}`,
    decrypt(encrypted: string) {
      try {
        const parts = encrypted.split("$");
        if (parts.length !== 3 || parts[0] !== "v1" || parts[1] !== sessionId) {
          throw new TossCertSessionIntegrityError();
        }

        const combined = decodeBase64(parts[2]);
        if (combined.length <= 16 || secretKeyBytes.length !== 32 || ivBytes.length !== 12) {
          throw new TossCertSessionIntegrityError();
        }

        const ciphertext = combined.subarray(0, combined.length - 16);
        const authTag = combined.subarray(combined.length - 16);
        const decipher = createDecipheriv("aes-256-gcm", secretKeyBytes, ivBytes);
        decipher.setAAD(secretKeyBytes);
        decipher.setAuthTag(authTag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
      } catch {
        throw new TossCertSessionIntegrityError();
      }
    },
  };
}
