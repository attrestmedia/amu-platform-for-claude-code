import { intimacyLevelHelper } from "consts/game";
import type { NpcConversationResult } from "types/game/npc-conversation-result";

/**
 * @docHint
 * @purpose 서버 친밀도 정산 결과를 UI DTO와 개인정보 없는 1080×1350 PNG 공유 asset으로 변환
 * @process 수치 clamp  단계 계산  canvas 직접 렌더  Web Share 지원 시 공유·미지원 시 다운로드
 * @domain game.npc-conversation-result
 * @scope client-utility
 */

const SHARE_CARD_WIDTH = 1080;
const SHARE_CARD_HEIGHT = 1350;

function clampIntimacy(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(999, Math.round(number)));
}

export function buildNpcConversationResult(args: {
  npcId: string;
  npcName: string;
  appliedGain: number;
  intimacy: number;
}): NpcConversationResult {
  const intimacyAfter = clampIntimacy(args.intimacy);
  const requestedGain = Math.max(0, Math.round(Number(args.appliedGain) || 0));
  const intimacyBefore = clampIntimacy(intimacyAfter - requestedGain);
  const intimacyGain = intimacyAfter - intimacyBefore;

  return {
    npcId: String(args.npcId || "").trim(),
    npcName: String(args.npcName || "").trim().slice(0, 80) || "NPC",
    intimacyBefore,
    intimacyAfter,
    intimacyGain,
    intimacyLevel: intimacyLevelHelper(intimacyAfter),
    xpGain: 0,
  };
}

export function makeNpcConversationShareFilename(npcName: string) {
  const safeName = String(npcName || "npc")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "npc";
  return `amu-play-${safeName}-conversation-result.png`;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
  context.fill();
}

function drawCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  y: number,
  options: { font: string; color: string },
) {
  context.save();
  context.font = options.font;
  context.fillStyle = options.color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, SHARE_CARD_WIDTH / 2, y);
  context.restore();
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("npc_result_png_export_failed"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export async function renderNpcConversationShareCard(
  result: NpcConversationResult,
): Promise<{ blob: Blob; width: number; height: number; filename: string }> {
  if (typeof document === "undefined") throw new Error("npc_result_canvas_unavailable");

  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("npc_result_canvas_unavailable");

  const background = context.createLinearGradient(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  background.addColorStop(0, "#111827");
  background.addColorStop(0.48, "#172554");
  background.addColorStop(1, "#4c1d95");
  context.fillStyle = background;
  context.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  context.globalAlpha = 0.22;
  context.fillStyle = "#60a5fa";
  context.beginPath();
  context.arc(920, 170, 260, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#c084fc";
  context.beginPath();
  context.arc(130, 1190, 300, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  context.fillStyle = "rgba(255,255,255,0.10)";
  drawRoundedRect(context, 90, 92, 900, 1166, 54);

  drawCenteredText(context, "AMU PLAY", 180, {
    font: "700 34px system-ui, sans-serif",
    color: "#93c5fd",
  });
  drawCenteredText(context, "CONVERSATION COMPLETE", 242, {
    font: "600 25px system-ui, sans-serif",
    color: "#cbd5e1",
  });

  context.fillStyle = "rgba(15,23,42,0.72)";
  drawRoundedRect(context, 220, 315, 640, 190, 42);
  drawCenteredText(context, result.npcName, 386, {
    font: "700 50px system-ui, sans-serif",
    color: "#ffffff",
  });
  drawCenteredText(context, "새로운 대화의 기억", 456, {
    font: "500 27px system-ui, sans-serif",
    color: "#cbd5e1",
  });

  drawCenteredText(context, `+${result.intimacyGain}`, 650, {
    font: "800 152px system-ui, sans-serif",
    color: "#f9a8d4",
  });
  drawCenteredText(context, "INTIMACY", 752, {
    font: "700 30px system-ui, sans-serif",
    color: "#fbcfe8",
  });
  drawCenteredText(context, `${result.intimacyBefore}  →  ${result.intimacyAfter} / 999`, 830, {
    font: "700 37px system-ui, sans-serif",
    color: "#ffffff",
  });

  context.fillStyle = "rgba(255,255,255,0.12)";
  drawRoundedRect(context, 270, 900, 540, 110, 55);
  drawCenteredText(context, result.intimacyLevel.replaceAll("_", " ").toUpperCase(), 955, {
    font: "700 30px system-ui, sans-serif",
    color: "#bfdbfe",
  });

  drawCenteredText(context, "나만의 우주에서 이어지는 관계", 1120, {
    font: "600 27px system-ui, sans-serif",
    color: "#e2e8f0",
  });
  drawCenteredText(context, "allmyuniverse.com/play", 1180, {
    font: "500 23px system-ui, sans-serif",
    color: "#94a3b8",
  });

  return {
    blob: await canvasToPngBlob(canvas),
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    filename: makeNpcConversationShareFilename(result.npcName),
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function shareNpcConversationResult(
  result: NpcConversationResult,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const exported = await renderNpcConversationShareCard(result);
  const file = new File([exported.blob], exported.filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({
        title: `${result.npcName} · AMU Play`,
        text: `AMU Play에서 ${result.npcName}와 친밀도 +${result.intimacyGain}`,
        files: [file],
      });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  downloadBlob(exported.blob, exported.filename);
  return "downloaded";
}
