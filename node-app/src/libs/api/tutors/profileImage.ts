import { DEFAULT_IMAGE_MODEL_BY_PROVIDER } from "consts/ai";
import fetchClient from "libs/api/fetchClient";
import type { BaseImageType } from "types/app";
import type {
  PersonaFormValuesType,
  TutorProfileImageGenerateRequest,
  TutorProfileImageGenerateResponse,
} from "types/ai";
import { fileToDataUrl } from "utils/app/imageFile";
import {
  getPrimaryProfileImage,
  resolveTutorProfileImageTemplateKey,
  setPrimaryProfileImage,
} from "utils/app/tutorProfileImage";

const BASE = "/tutors/profile-image";
const TUTOR_PROFILE_REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export function createTutorProfileImageRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tutor-profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseBaseImageDataUrl(dataUrl: string): BaseImageType | null {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1] || "image/png",
    data: match[2] || "",
  };
}

export async function buildTutorProfileReferenceImages(imageUrl: string): Promise<BaseImageType[]> {
  const url = String(imageUrl || "").trim();
  if (!url) return [];

  if (url.startsWith("data:")) {
    const parsed = parseBaseImageDataUrl(url);
    return parsed ? [parsed] : [];
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error("reference_image_fetch_failed");

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("reference_image_invalid_type");
  if (blob.size > TUTOR_PROFILE_REFERENCE_IMAGE_MAX_BYTES) throw new Error("reference_image_too_large");

  const parsed = parseBaseImageDataUrl(await fileToDataUrl(blob));
  return parsed ? [parsed] : [];
}

export async function generateTutorProfileImage(payload: TutorProfileImageGenerateRequest): Promise<TutorProfileImageGenerateResponse> {
  const clientRequestId = String(payload.clientRequestId || "").trim() || createTutorProfileImageRequestId();
  const response = await fetchClient.post<{ success: boolean; data: TutorProfileImageGenerateResponse["data"]; billing: { coins: number } }>(
    BASE,
    { ...payload, clientRequestId },
    { responseType: "auto", loading: "global" },
  );

  if (!response.data?.success) {
    throw new Error("tutor_profile_image_generate_failed");
  }

  return {
    data: response.data.data,
    billing: {
      coins: Number(response.data.billing?.coins || 0),
    },
  };
}

export async function prepareTutorProfileImageForSave(args: {
  persona: PersonaFormValuesType;
  clientRequestId?: string;
}): Promise<{
  nextPersona: PersonaFormValuesType;
  mode: "existing" | "text-generated";
  billingCoins: number;
}> {
  const currentImageUrl = getPrimaryProfileImage(args.persona?.profiles);
  if (currentImageUrl) {
    return {
      nextPersona: args.persona,
      mode: "existing",
      billingCoins: 0,
    };
  }

  const generated = await generateTutorProfileImage({
    brief: "",
    templateKey: resolveTutorProfileImageTemplateKey(args.persona?.personaType),
    variables: {},
    modelName: DEFAULT_IMAGE_MODEL_BY_PROVIDER.google,
    aspectRatio: "2:3",
    size: "1K",
    clientRequestId: args.clientRequestId,
    persona: args.persona,
  });

  return {
    nextPersona: {
      ...args.persona,
      profiles: setPrimaryProfileImage(args.persona?.profiles, generated.data.imageUrl),
    },
    mode: "text-generated",
    billingCoins: Number(generated.billing?.coins || 0),
  };
}

export async function editTutorProfileImage(args: {
  persona: PersonaFormValuesType;
  referenceImageUrl: string;
  instruction: string;
  clientRequestId?: string;
}): Promise<{
  nextPersona: PersonaFormValuesType;
  imageUrl: string;
  billingCoins: number;
}> {
  const referenceImageUrl = String(args.referenceImageUrl || "").trim();
  const instruction = String(args.instruction || "").trim();
  if (!referenceImageUrl) throw new Error("reference_image_required");
  if (!instruction) throw new Error("edit_instruction_required");

  // baseImages(참고 이미지 base64)는 클라이언트에서 변환하지 않는다.
  // private Gen Studio 이미지(worker/signed URL)를 브라우저에서 fetch하면 CORS/인증 문제로 실패하므로,
  // 서버가 referenceImageUrl에서 직접 해석한다.
  const generated = await generateTutorProfileImage({
    brief: instruction,
    templateKey: resolveTutorProfileImageTemplateKey(args.persona?.personaType),
    variables: {},
    modelName: DEFAULT_IMAGE_MODEL_BY_PROVIDER.google,
    aspectRatio: "2:3",
    size: "1K",
    baseImages: [],
    referenceImageUrl,
    clientRequestId: args.clientRequestId,
    persona: args.persona,
  });
  const imageUrl = String(generated.data.imageUrl || "").trim();
  if (!imageUrl) throw new Error("tutor_profile_image_edit_failed");

  return {
    nextPersona: {
      ...args.persona,
      profiles: setPrimaryProfileImage(args.persona?.profiles, imageUrl),
    },
    imageUrl,
    billingCoins: Number(generated.billing?.coins || 0),
  };
}
