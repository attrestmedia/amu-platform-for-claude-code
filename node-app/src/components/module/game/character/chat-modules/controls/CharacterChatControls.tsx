"use client";

import { Button } from "@amu-labs/ui";
import { Lang, lang } from "../../../../i18n";
import { Search, HeartPulse, Settings, Rows3, Mic, X, Keyboard, Loader2, LogOut, Flag } from "lucide-react";
import { useUniverseData } from "hooks/game/core";
import { cn } from "src/utils/common";

/**
 * 캐릭터 채팅 하단 컨트롤 버튼 묶음
 */
interface CharacterChatControlsProps {
  className?: string; // 추가 스타일 연결이 필요할 때 사용
  onToggleKnowledgeSearch: () => void; // 지식 검색 패널 토글 (열릴 때 maximize 포함 로직은 부모가 처리)
  onToggleInfoPanel: () => void; // 관계/정보 패널 토글
  onToggleSettingsPanel: () => void; // 설정 패널 토글
  onShowAllProducts?: () => void; // '전체 상품 보기' 클릭 핸들러
  onBack: () => void; // 뒤로가기(정보 패널로) 콜백
  onReport?: () => void;
  // 음성 대화 모드 ↔ 키보드 입력 모드 토글. 장치가 없으면 비활성 상태를 명시한다.
  voiceModeToggle?: {
    enabled: boolean;
    available: boolean;
    checking: boolean;
    mode: "voice" | "text";
    onToggle: () => void;
  };
}

export const CharacterChatControls = ({
  className = "",
  onToggleKnowledgeSearch,
  onToggleInfoPanel,
  onToggleSettingsPanel,
  onShowAllProducts,
  onBack,
  onReport,
  voiceModeToggle,
}: CharacterChatControlsProps) => {
  const { isCommerceUniverse } = useUniverseData();

  return (
    <div
      className={cn(
        "character-chat-controls flex items-center justify-center gap-3",
        "[&>button]:text-white [&>button:hover]:text-white [&>button:hover]:bg-black/10",
        className,
      )}
    >
      {isCommerceUniverse ? (
        <Button variant="ghost" size="xs" rounded="full" onClick={onShowAllProducts}>
          <Rows3 className="icon-xs" />
          <span className="text-xs">전체 상품 보기</span>
        </Button>
      ) : (
        <>
          {/* 지식 검색 버튼 */}
          <Button variant="ghost" size="icon-xs" rounded="full" onClick={onToggleKnowledgeSearch}>
            <Search className="icon-xs" />
            <Lang text={{ ko: "주제 검색", en: "Search" }} className="sr-only" />
          </Button>

          {/* 관계 정보 버튼 */}
          <Button variant="ghost" size="icon-xs" rounded="full" onClick={onToggleInfoPanel}>
            <HeartPulse className="icon-xs" />
            <Lang text={{ ko: "정보", en: "Info" }} className="sr-only" />
          </Button>

          {onReport && (
            <Button
              variant="ghost"
              size="icon-xs"
              rounded="full"
              className="min-h-11 min-w-11"
              onClick={onReport}
              data-testid="open-npc-report"
            >
              <Flag className="icon-xs" />
              <Lang text={{ ko: "NPC 대화 신고", en: "Report NPC conversation" }} className="sr-only" />
            </Button>
          )}
        </>
      )}

      {/* 음성 대화 ↔ 키보드 입력 모드 토글 */}
      {voiceModeToggle?.enabled && voiceModeToggle.available && (
        <Button
          variant="ghost"
          size="icon-xs"
          rounded="full"
          onClick={voiceModeToggle.onToggle}
          aria-pressed={voiceModeToggle.mode === "voice"}
          aria-label={lang({
            ko: voiceModeToggle.mode === "voice" ? "키보드 입력 모드로 전환" : "음성 대화 모드로 전환",
            en: voiceModeToggle.mode === "voice" ? "Switch to keyboard input" : "Switch to voice mode",
          })}
        >
          {voiceModeToggle.mode === "voice" ? <Keyboard className="icon-xs" /> : <Mic className="icon-xs" />}
        </Button>
      )}

      {voiceModeToggle?.enabled && !voiceModeToggle.available && (
        <Button
          variant="ghost"
          size="icon-xs"
          rounded="full"
          disabled
          className="min-h-11 min-w-11 text-white/55"
          title={lang({
            ko: voiceModeToggle.checking ? "마이크 연결 상태 확인 중" : "사용 가능한 마이크가 없습니다",
            en: voiceModeToggle.checking ? "Checking microphone availability" : "No microphone is available",
          })}
          aria-label={lang({
            ko: voiceModeToggle.checking ? "마이크 연결 상태 확인 중" : "마이크 사용 불가",
            en: voiceModeToggle.checking ? "Checking microphone availability" : "Microphone unavailable",
          })}
        >
          {voiceModeToggle.checking ? (
            <Loader2 className="icon-xs animate-spin motion-reduce:animate-none" />
          ) : (
            <span className="relative" aria-hidden="true">
              <Mic className="icon-xs" />
              <X className="absolute -right-1 -top-1 size-3 rounded-full bg-black/70" strokeWidth={3} />
            </span>
          )}
        </Button>
      )}

      {/* 뒤로가기 */}
      <Button variant="ghost" size="icon-xs" rounded="full" onClick={onBack}>
        <LogOut className="icon-xs" />
        <Lang text={{ ko: "돌아가기", en: "Go back" }} className="sr-only" />
      </Button>

      {/* 설정 버튼 */}
      <Button variant="ghost" size="icon-xs" rounded="full" onClick={onToggleSettingsPanel}>
        <Settings className="icon-xs" />
        <Lang text={{ ko: "설정", en: "Settings" }} className="sr-only" />
      </Button>
    </div>
  );
};
