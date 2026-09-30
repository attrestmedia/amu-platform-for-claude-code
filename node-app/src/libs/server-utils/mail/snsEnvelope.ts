import "server-only";

import { createVerify, X509Certificate, type KeyLike } from "node:crypto";
import { isUnknownRecord } from "utils/common";

export type SnsEnvelopeType = "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";

export interface SnsEnvelope {
  Type: SnsEnvelopeType;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: "1" | "2";
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  Token?: string;
  SubscribeURL?: string;
}

const CERT_CACHE_TTL_MS = 60 * 60_000;
const CERT_MAX_BYTES = 64 * 1024;
const certCache = new Map<string, { pem: string; expiresAt: number }>();

function requiredString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`SNS_${key.toUpperCase()}_REQUIRED`);
  return value;
}

export function parseSnsEnvelope(value: unknown): SnsEnvelope {
  if (!isUnknownRecord(value)) throw new Error("SNS_BODY_INVALID");
  const Type = requiredString(value, "Type");
  if (!(["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"] as string[]).includes(Type)) {
    throw new Error("SNS_TYPE_INVALID");
  }
  const SignatureVersion = requiredString(value, "SignatureVersion");
  if (SignatureVersion !== "1" && SignatureVersion !== "2") throw new Error("SNS_SIGNATURE_VERSION_INVALID");
  const envelope: SnsEnvelope = {
    Type: Type as SnsEnvelopeType,
    MessageId: requiredString(value, "MessageId"),
    TopicArn: requiredString(value, "TopicArn"),
    Message: requiredString(value, "Message"),
    Timestamp: requiredString(value, "Timestamp"),
    SignatureVersion,
    Signature: requiredString(value, "Signature"),
    SigningCertURL: requiredString(value, "SigningCertURL"),
  };
  if (typeof value.Subject === "string") envelope.Subject = value.Subject;
  if (typeof value.Token === "string") envelope.Token = value.Token;
  if (typeof value.SubscribeURL === "string") envelope.SubscribeURL = value.SubscribeURL;
  if (Type !== "Notification" && (!envelope.Token || !envelope.SubscribeURL)) {
    throw new Error("SNS_CONFIRMATION_FIELDS_REQUIRED");
  }
  return envelope;
}

export function getSnsCanonicalMessage(envelope: SnsEnvelope) {
  const fields = envelope.Type === "Notification"
    ? ["Message", "MessageId", ...(envelope.Subject === undefined ? [] : ["Subject"]), "Timestamp", "TopicArn", "Type"]
    : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  return fields.map((field) => `${field}\n${String(envelope[field as keyof SnsEnvelope])}\n`).join("");
}

export function verifySnsSignatureWithPublicKey(envelope: SnsEnvelope, publicKey: KeyLike | string) {
  const algorithm = envelope.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
  const verifier = createVerify(algorithm);
  verifier.update(getSnsCanonicalMessage(envelope), "utf8");
  verifier.end();
  return verifier.verify(publicKey, Buffer.from(envelope.Signature, "base64"));
}

export function validateSnsServiceUrl(rawUrl: string, region: string, purpose: "certificate" | "confirmation") {
  const url = new URL(rawUrl);
  const expectedHost = `sns.${region}.amazonaws.com`;
  if (
    url.protocol !== "https:" ||
    url.hostname !== expectedHost ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.hash
  ) {
    throw new Error(`SNS_${purpose.toUpperCase()}_URL_INVALID`);
  }
  if (purpose === "certificate") {
    if (url.search || !/^\/SimpleNotificationService-[A-Za-z0-9_-]+\.pem$/.test(url.pathname)) {
      throw new Error("SNS_CERTIFICATE_URL_INVALID");
    }
  }
  return url;
}

async function getSigningCertificate(url: URL) {
  const cached = certCache.get(url.href);
  if (cached && cached.expiresAt > Date.now()) return cached.pem;
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: "error" });
  if (!response.ok) throw new Error(`SNS_CERTIFICATE_FETCH_${response.status}`);
  const pem = await response.text();
  if (Buffer.byteLength(pem, "utf8") > CERT_MAX_BYTES || !pem.includes("BEGIN CERTIFICATE")) {
    throw new Error("SNS_CERTIFICATE_INVALID");
  }
  certCache.set(url.href, { pem, expiresAt: Date.now() + CERT_CACHE_TTL_MS });
  return pem;
}

export async function verifySnsEnvelopeSignature(envelope: SnsEnvelope, region: string) {
  const certUrl = validateSnsServiceUrl(envelope.SigningCertURL, region, "certificate");
  const certificate = new X509Certificate(await getSigningCertificate(certUrl));
  if (!certificate.checkHost("sns.amazonaws.com")) throw new Error("SNS_CERTIFICATE_IDENTITY_INVALID");
  if (!verifySnsSignatureWithPublicKey(envelope, certificate.publicKey)) throw new Error("SNS_SIGNATURE_INVALID");
}

export async function confirmSnsSubscription(envelope: SnsEnvelope, region: string) {
  if (!envelope.SubscribeURL || !envelope.Token) throw new Error("SNS_CONFIRMATION_FIELDS_REQUIRED");
  const url = validateSnsServiceUrl(envelope.SubscribeURL, region, "confirmation");
  if (
    url.pathname !== "/" ||
    url.searchParams.get("Action") !== "ConfirmSubscription" ||
    url.searchParams.get("TopicArn") !== envelope.TopicArn ||
    url.searchParams.get("Token") !== envelope.Token
  ) {
    throw new Error("SNS_CONFIRMATION_QUERY_INVALID");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: "error" });
  if (!response.ok) throw new Error(`SNS_CONFIRMATION_FAILED_${response.status}`);
}
