import "server-only";

import crypto from "node:crypto";
import sharp from "sharp";
import {
  MOTION_GUIDE_ACTION_KEYS,
  MOTION_GUIDE_FRAME_COUNT,
  MOTION_GUIDE_FRAME_COUNTS,
  MOTION_GUIDE_MVP_DIRECTIONS,
  MOTION_GUIDE_VERSION,
  type MotionGuideActionKeyType,
  type MotionGuideDirectionType,
} from "consts/game/motionGuideSkeletons";
import {
  getMotionGuideGameAsset,
  listMotionGuideGameAssets,
  upsertMotionGuideGameAsset,
} from "libs/database/game";
import {
  buildR2PublicUrl,
  deleteR2Object,
  getR2ObjectBuffer,
  getR2PublicBucket,
  headR2Object,
  isR2StorageEnabled,
  putR2PublicObject,
} from "libs/server-utils/storage/r2Storage";
import type { BaseImageType } from "types/app";
import type { IGameAssetDoc, SpriteDirectionType } from "types/game";
import { toUnknownRecord } from "utils/common/typeUtils";
import { renderMotionGuideSvg, type RenderMotionGuideArgs } from "utils/game/motionGuideSvg";

export { renderMotionGuideSvg } from "utils/game/motionGuideSvg";

export type MotionGuideRefType = {
  actionKey: MotionGuideActionKeyType;
  direction: SpriteDirectionType;
  version: number;
  frameCount: number;
  url: string;
  sha256: string;
  assetId: string;
};

const ACTION_SET = new Set<string>(MOTION_GUIDE_ACTION_KEYS);
const DIRECTION_SET = new Set<string>([
  "down",
  "up",
  "left",
  "right",
  "down-left",
  "up-left",
  "up-right",
  "down-right",
]);

export function isMotionGuideActionKey(value: unknown): value is MotionGuideActionKeyType {
  return ACTION_SET.has(String(value || "").trim());
}

export function isMotionGuideDirection(value: unknown): value is SpriteDirectionType {
  return DIRECTION_SET.has(String(value || "").trim());
}

function sha256(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function renderMotionGuidePng(args: RenderMotionGuideArgs) {
  const svg = renderMotionGuideSvg(args);
  const buffer = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const metadata = await sharp(buffer).metadata();
  return {
    svg,
    buffer,
    sha256: sha256(buffer),
    width: Number(metadata.width || 0),
    height: Number(metadata.height || 0),
  };
}

function toMotionGuideRef(asset: IGameAssetDoc | null | undefined): MotionGuideRefType | null {
  if (!asset || asset.assetType !== "motion-guide" || asset.status !== "published") return null;
  const guide = toUnknownRecord(toUnknownRecord(asset.meta).motionGuide);
  if (!isMotionGuideActionKey(guide.actionKey) || !isMotionGuideDirection(guide.direction)) return null;
  const sha = String(asset.storage?.sha256 || "");
  const url = String(asset.storage?.url || "");
  if (!sha || !url) return null;
  return {
    actionKey: guide.actionKey,
    direction: guide.direction,
    version: Number(guide.version || 0),
    frameCount: Number(guide.frameCount || 0),
    url,
    sha256: sha,
    assetId: asset.gameAssetId,
  };
}

export async function persistMotionGuide(args: RenderMotionGuideArgs & { updatedBy: string }) {
  if (!isR2StorageEnabled()) throw new Error("r2_storage_required");
  const version = Math.max(1, Math.round(args.version || MOTION_GUIDE_VERSION));
  const frameCount = args.frameCount || MOTION_GUIDE_FRAME_COUNT;
  if (!(MOTION_GUIDE_FRAME_COUNTS as readonly number[]).includes(frameCount)) {
    throw new Error("motion_guide_frame_count_invalid");
  }
  const rendered = await renderMotionGuidePng({ ...args, version, frameCount });
  const frameSuffix = frameCount === MOTION_GUIDE_FRAME_COUNT ? "" : `-f${frameCount}`;
  const key = `game/motion-guides/${args.actionKey}/${args.direction}-v${version}${frameSuffix}.png`;
  const bucket = getR2PublicBucket();
  const existingAsset = await getMotionGuideGameAsset({
    actionKey: args.actionKey,
    direction: args.direction,
    version,
    frameCount,
  });
  const existingAssetSha = String(existingAsset?.storage?.sha256 || "");
  if (existingAssetSha && existingAssetSha !== rendered.sha256) {
    throw new Error("motion_guide_version_conflict");
  }

  const previousHead = await headR2Object({ bucket, key });
  if (previousHead?.sha256 && previousHead.sha256 !== rendered.sha256) {
    throw new Error("motion_guide_r2_version_conflict");
  }

  let uploaded = false;
  if (!previousHead) {
    await putR2PublicObject({
      key,
      body: rendered.buffer,
      contentType: "image/png",
      sha256: rendered.sha256,
    });
    uploaded = true;
  }
  const verified = await headR2Object({ bucket, key });
  if (
    !verified ||
    verified.bytes !== rendered.buffer.length ||
    verified.contentType !== "image/png" ||
    verified.sha256 !== rendered.sha256
  ) {
    if (uploaded) await deleteR2Object({ bucket, key }).catch(() => false);
    throw new Error("motion_guide_r2_verification_failed");
  }

  try {
    const asset = await upsertMotionGuideGameAsset({
      actionKey: args.actionKey,
      direction: args.direction,
      version,
      frameCount,
      name: `${args.actionKey} ${args.direction} motion guide v${version}`,
      status: "published",
      sourceType: "generated",
      tags: ["motion-guide", args.actionKey, args.direction],
      categories: ["game-asset", "motion-guide"],
      storage: {
        driver: "r2",
        access: "public",
        bucket,
        key,
        url: buildR2PublicUrl(key),
        mimeType: "image/png",
        width: rendered.width,
        height: rendered.height,
        bytes: rendered.buffer.length,
        sha256: rendered.sha256,
        ext: "png",
      },
      meta: {
        motionGuide: {
          actionKey: args.actionKey,
          direction: args.direction,
          version,
          frameCount,
          renderer: "svg-skeleton-v1",
          ownership: "platform",
          generatedResultOwnership: "user",
        },
      },
      createdBy: "system",
      updatedBy: args.updatedBy,
    });
    return { asset, ref: toMotionGuideRef(asset), created: !existingAsset && !previousHead };
  } catch (error) {
    if (uploaded) {
      const raced = await getMotionGuideGameAsset({ actionKey: args.actionKey, direction: args.direction, version, frameCount }).catch(() => null);
      if (String(raced?.storage?.sha256 || "") !== rendered.sha256) {
        await deleteR2Object({ bucket, key }).catch(() => false);
      }
    }
    throw error;
  }
}

export async function listMotionGuides(args: {
  actionKeys?: MotionGuideActionKeyType[];
  directions?: SpriteDirectionType[];
  version?: number;
  frameCount?: number;
} = {}) {
  const assets = await listMotionGuideGameAssets(args);
  return assets.map(toMotionGuideRef).filter((item): item is MotionGuideRefType => Boolean(item));
}

export async function loadMotionGuideReference(args: {
  actionKey: string;
  direction: SpriteDirectionType;
  version: number;
  frameCount?: number;
}): Promise<{ image: BaseImageType; ref: MotionGuideRefType } | null> {
  if (args.version <= 0 || !isMotionGuideActionKey(args.actionKey)) return null;
  const asset = await getMotionGuideGameAsset({
    actionKey: args.actionKey,
    direction: args.direction,
    version: args.version,
    frameCount: args.frameCount || MOTION_GUIDE_FRAME_COUNT,
  });
  const ref = toMotionGuideRef(asset);
  if (!ref || asset?.storage?.driver !== "r2" || asset.storage.access !== "public") return null;
  const bucket = String(asset.storage.bucket || "");
  const key = String(asset.storage.key || "");
  const buffer = bucket && key ? await getR2ObjectBuffer({ bucket, key }) : null;
  if (!buffer || sha256(buffer) !== ref.sha256) throw new Error("motion_guide_storage_invalid");
  return { image: { mimeType: "image/png", data: buffer.toString("base64") }, ref };
}

export const DEFAULT_MOTION_GUIDE_BATCH = {
  actionKeys: MOTION_GUIDE_ACTION_KEYS,
  directions: MOTION_GUIDE_MVP_DIRECTIONS,
  version: MOTION_GUIDE_VERSION,
  frameCount: MOTION_GUIDE_FRAME_COUNT,
} as const satisfies {
  actionKeys: readonly MotionGuideActionKeyType[];
  directions: readonly MotionGuideDirectionType[];
  version: number;
  frameCount: number;
};
