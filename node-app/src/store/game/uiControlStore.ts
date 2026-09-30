import { create } from "zustand";
import { OPENAI_TTS_SPEED_RANGE } from "consts/ai";
import type { ICommerceProduct } from "types/commerce";
import type { IExtendedNpcData } from "types/game";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game
 * @scope client
 */

// UI 컨트롤 스토어 인터페이스
interface UiControlStore {
  // 맵 표시 상태
  showMap: boolean;

  stageChatSpeaker: IExtendedNpcData | null; // 현재 스테이지에서 챗을 담당할 NPC

  autoAiResponse: boolean; // 캐릭터 만남 시 자동 AI 응답 여부
  assistantVoiceEnabled: boolean; // AI 답변 TTS 사용 여부
  assistantVoiceAutoplay: boolean; // AI 답변 TTS 자동 재생 여부
  assistantVoiceSpeed: number | null; // null이면 서버/유니버스 기본 TTS 속도 사용
  voiceAnalysisEnabled: boolean; // 마이크 입력 원음(발음) 분석 사용 여부 (false=STT만, 빠름)
  conversationHintsEnabled: boolean; // 대화 힌트 표시 여부
  initialContactGuardUntil: number; // 초기 로드 가드 만료 시각

  // 상품 상세(커머스) UI 상태
  productDetailOpen: boolean;
  selectedProduct: ICommerceProduct | null;
  productDetailSolo: boolean; // 단일 상품 상세 모드

  // 상품 확인 다이얼로그 쿨다운
  productConfirmOpen: boolean;
  pendingProduct: ICommerceProduct | null;
  pendingProductSource: "click" | "contact" | null;
  productCooldownUntil: number;

  isInputLocked: boolean; // 전역 키보드/네비 잠금
  inputLockReason?: string | null; // 디버깅/충돌 방지용

  // 초기 로드 가드 시작 & 해제
  armInitialContactGuard: (ms: number) => void;
  clearInitialContactGuard: () => void;

  // 맵 표시 상태
  toggleMap: () => void;
  setShowMap: (show: boolean) => void; // 맵 표시 상태 직접 설정

  setStageChatSpeaker: (npc: IExtendedNpcData | null) => void;

  // 자동 AI 응답 모드 관련
  toggleAutoAiResponse: () => void;
  setAutoAiResponse: (enabled: boolean) => void;

  // AI 답변 음성(TTS) 관련
  toggleAssistantVoice: () => void;
  toggleAssistantVoiceAutoplay: () => void;
  setAssistantVoiceSpeed: (speed: number | null) => void;
  setVoiceAnalysisEnabled: (enabled: boolean) => void;
  setConversationHintsEnabled: (enabled: boolean) => void;

  // 상품 확인 다이얼로그 관련
  openProduct: (p: ICommerceProduct, opts?: { solo?: boolean }) => void;
  closeProduct: () => void;
  askOpenProduct: (p: ICommerceProduct, source: "click" | "contact") => void;
  confirmOpenProduct: () => void;
  cancelOpenProduct: () => void;
  startProductCooldown: (ms: number) => void;

  lockInput: (reason?: string) => void;
  unlockInput: (reason?: string) => void;
}

/**
 * 게임 UI 컨트롤을 위한 전역 상태 스토어
 * - 맵 표시 관련 상태 관리
 * - 기타 UI 컨트롤 상태 확장 가능
 */
export const useUiControlStore = create<UiControlStore>((set, get) => ({
  // 초기 상태: 맵 표시하지 않음
  showMap: false,
  stageChatSpeaker: null,
  autoAiResponse: false,
  assistantVoiceEnabled: true,
  assistantVoiceAutoplay: true,
  assistantVoiceSpeed: null,
  voiceAnalysisEnabled: false,
  conversationHintsEnabled: true,
  initialContactGuardUntil: 0,
  isInputLocked: false,
  inputLockReason: null,
  productDetailSolo: false,

  // 맵 표시 상태 토글 함수
  toggleMap: () => set((state) => ({ showMap: !state.showMap })),

  armInitialContactGuard: (ms) => set({ initialContactGuardUntil: Date.now() + Math.max(0, ms) }),
  clearInitialContactGuard: () => set({ initialContactGuardUntil: 0 }),

  // 맵 표시 상태 직접 설정 함수
  setShowMap: (show) => set({ showMap: show }),
  setStageChatSpeaker: (npc) => set({ stageChatSpeaker: npc }),
  toggleAutoAiResponse: () => set((state) => ({ autoAiResponse: !state.autoAiResponse })),
  setAutoAiResponse: (enabled) => set({ autoAiResponse: enabled }),
  toggleAssistantVoice: () => set((state) => ({ assistantVoiceEnabled: !state.assistantVoiceEnabled })),
  toggleAssistantVoiceAutoplay: () =>
    set((state) => ({ assistantVoiceAutoplay: !state.assistantVoiceAutoplay })),
  setAssistantVoiceSpeed: (speed) => {
    if (speed == null) {
      set({ assistantVoiceSpeed: null });
      return;
    }

    const value = Number(speed);
    if (!Number.isFinite(value)) return;

    set({
      assistantVoiceSpeed: Math.min(
        OPENAI_TTS_SPEED_RANGE.max,
        Math.max(OPENAI_TTS_SPEED_RANGE.min, Number(value.toFixed(2))),
      ),
    });
  },
  setVoiceAnalysisEnabled: (enabled) => set({ voiceAnalysisEnabled: enabled }),
  setConversationHintsEnabled: (enabled) => set({ conversationHintsEnabled: enabled }),

  // 상품 UI 상태
  productDetailOpen: false,
  selectedProduct: null,
  openProduct: (p, opts) =>
    set({
      productDetailOpen: true,
      selectedProduct: p,
      productDetailSolo: !!opts?.solo,
    }),
  closeProduct: () =>
    set({
      productDetailOpen: false,
      selectedProduct: null,
      productDetailSolo: false,
    }),

  // 쿨다운 관련 상태
  productConfirmOpen: false,
  pendingProduct: null,
  pendingProductSource: null,
  productCooldownUntil: 0,

  // 쿨다운 체크
  askOpenProduct: (p, source) => {
    const now = Date.now();

    // 쿨다운
    if (
      (source === "contact" && now < get().initialContactGuardUntil) || // 가드 시간 동안(접촉 유발 팝업일 경우)
      now < get().productCooldownUntil || // 쿨다운 중
      get().productDetailOpen || // 시트 열렸을 때
      get().productConfirmOpen // 다이얼로그가 이미 열렸을 때
    )
      return;

    set({
      productConfirmOpen: true,
      pendingProduct: p,
      pendingProductSource: source,
    });
  },

  // 다이얼로그 오픈
  confirmOpenProduct: () => {
    const p = get().pendingProduct;
    if (!p) return;
    set({ productConfirmOpen: false, pendingProduct: null, pendingProductSource: null });
    // 실제 상세 시트 오픈
    set({ productDetailOpen: true, selectedProduct: p });
  },

  // 다이얼로그에서 취소
  cancelOpenProduct: () => set({ productConfirmOpen: false, pendingProduct: null, pendingProductSource: null }),

  // 쿨다운 시작
  startProductCooldown: (ms) => set({ productCooldownUntil: Date.now() + ms }),

  lockInput: (reason) => {
    // 같은 이유의 중복 호출은 무시
    const { isInputLocked, inputLockReason } = get();
    if (isInputLocked && inputLockReason === reason) return;
    set({ isInputLocked: true, inputLockReason: reason ?? "unknown" });
  },

  unlockInput: (reason) => {
    // 내가 잠근 경우에만 해제 (다른 모듈 충돌 방지)
    const { inputLockReason } = get();
    if (!inputLockReason || (reason && inputLockReason !== reason)) return;
    set({ isInputLocked: false, inputLockReason: null });
  },
}));

export default useUiControlStore;
