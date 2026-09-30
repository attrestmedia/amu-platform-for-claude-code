"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, User, Bot, Copy, Check } from "lucide-react";
import type { IChatMessage, IPersonaSprite } from "types/ai";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";
import { copyClipboard } from "utils/helper";
import { Button, RichTextRenderer } from "@amu-labs/ui";
import { CharacterSpriteAvatar } from "../CharacterSpriteAvatar";

interface ConversationHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: IChatMessage[];
  characterName: string;
  userCharacterName: string;
  characterSprite: IPersonaSprite | null;
  userSprite: IPersonaSprite | null;
  characterPortraitSrc: string | null;
  userPortraitSrc: string | null;
}

const ConversationHistoryModal = ({
  isOpen,
  onClose,
  messages,
  characterName,
  userCharacterName,
  characterSprite,
  userSprite,
  characterPortraitSrc,
  userPortraitSrc,
}: ConversationHistoryModalProps) => {
  const [isCopied, setIsCopied] = useState(false);

  // 대화 내용을 지정된 형식으로 변환하는 함수
  const formatConversationForCopy = () => {
    return messages
      .map((message) => {
        const senderName = message.isUser ? userCharacterName : characterName;
        const timestamp = new Date(message.timestamp ?? Date.now()).toLocaleString("ko-KR", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: true,
        });

        return `${senderName}\n${timestamp}\n${message.text}`;
      })
      .join("\n\n"); // 각 메시지 사이에 빈 줄 추가
  };

  // 복사 핸들러 함수
  const handleCopyConversation = async () => {
    try {
      const formattedText = formatConversationForCopy();

      if (!formattedText.trim()) {
        return;
      }

      // copyClipboard 유틸 사용
      copyClipboard(formattedText, "대화 기록이 클립보드에 복사되었습니다!");

      // 복사 완료 시각적 피드백
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("대화 기록 복사 실패:", error);
      // 에러 피드백 (선택사항)
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-black/90 rounded-xl border border-white/20 max-w-2xl w-full max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between p-4 border-b border-white/20">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <div className="flex items-center gap-1">
                <h2 className="text-white font-bold text-md">
                  <Lang text={{ ko: "대화 기록", en: "Conversation History" }} />
                </h2>
                <span className="text-white/60 text-sm">
                  ({messages.length} <Lang text={{ ko: "개", en: "messages" }} />)
                </span>
              </div>
            </div>
            <div className="flex items-center">
              {/* 전체 대화 복사 버튼 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyConversation}
                disabled={messages.length === 0}
                className={cn(isCopied && "text-green-300")}
              >
                {isCopied ? (
                  <>
                    <Check className="icon-xs" />
                    <Lang text={{ ko: "복사됨!", en: "Copied!" }} />
                  </>
                ) : (
                  <>
                    <Copy className="icon-xs" />
                    <Lang text={{ ko: "전체 복사", en: "Copy All" }} />
                  </>
                )}
              </Button>

              {/* 닫기 버튼 */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="icon-sm" />
              </Button>
            </div>
          </div>

          {/* 대화 목록 */}
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
            {messages.length > 0 ? (
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "flex gap-3 p-3 rounded-lg",
                      message.isUser ? "bg-primary/10 border border-primary/20" : "bg-white/5 border border-white/10",
                    )}
                  >
                    {/* 캐릭터 아바타 */}
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/20">
                        <CharacterSpriteAvatar
                          sprite={message.isUser ? userSprite : characterSprite}
                          portraitSrc={message.isUser ? userPortraitSrc : characterPortraitSrc}
                          alt={message.isUser ? userCharacterName : characterName}
                          className="w-10 h-10 rounded-full"
                          imageClassName="object-cover object-top"
                        />
                      </div>
                    </div>

                    {/* 메시지 내용 */}
                    <div className="flex-1 min-w-0">
                      {/* 발신자 정보 */}
                      <div className="flex items-start flex-col mb-1">
                        <div className="flex items-center gap-1">
                          {message.isUser ? (
                            <User className="w-3 h-3 text-primary" />
                          ) : (
                            <Bot className="w-3 h-3 text-blue-400" />
                          )}
                          <span
                            className={cn("text-sm font-medium", message.isUser ? "text-primary" : "text-blue-400")}
                          >
                            {message.isUser ? userCharacterName : characterName}
                          </span>
                        </div>

                        {/* 타임스탬프 */}
                        {message.timestamp && (
                          <span className="text-xs text-white/40">{message.timestamp.toLocaleString()}</span>
                        )}
                      </div>

                      {/* 메시지 텍스트 */}
                      <RichTextRenderer
                        content={message.text}
                        compact
                        className="text-white text-sm leading-relaxed break-keep"
                      />

                      {/* 번역 텍스트 */}
                      {message.translation && (
                        <div className="mt-2 p-2 bg-black/30 rounded border border-white/10">
                          <div className="text-xs text-white/60 mb-1">
                            <Lang text={{ ko: "번역:", en: "Translation:" }} />
                          </div>
                          <RichTextRenderer content={message.translation} compact className="text-white/80 text-sm" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/60">
                  <Lang text={{ ko: "아직 대화 기록이 없습니다", en: "No conversation history yet" }} />
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ConversationHistoryModal;
