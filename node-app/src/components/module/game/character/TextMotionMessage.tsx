"use client";

import { useEffect, useRef, useState, memo, useCallback } from "react";
import type { ReactNode } from "react";
import { gsap } from "gsap";
import type { IPersonaSprite } from "types/ai";
import { cn, splitIntoSentences } from "utils/common";
import { CharacterSpriteAvatar } from "./chat-modules/CharacterSpriteAvatar";

type TextMotionAvatar = {
  sprite?: IPersonaSprite | null;
  portraitSrc?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
};

interface TextMotionMessageProps {
  text: string;
  animate?: boolean; // 애니메이션 적용 여부
  className?: string;
  contentClassName?: string;
  onComplete?: () => void;
  onAnimationStart?: () => void;
  messageId: string; // 메시지 고유 ID
  animationType?: "typewriter" | "subtitle"; // 애니메이션 타입
  subtitleDuration?: number; // 문장 표시 후 대기 시간
  subtitleTransition?: number; // 문장 전환 시 fade 효과 적용 시간
  subtitleIndicator?: boolean; // 인디케이터 표시
  typewriterSpeed?: number; // 타자기 효과에서 텍스트가 표시되는 속도
  avatar?: TextMotionAvatar | null;
  renderContent?: (text: string) => ReactNode;
}

const TextMotionMessage = memo(
  ({
    text,
    animate = true,
    className,
    contentClassName,
    onComplete,
    onAnimationStart,
    messageId,
    animationType = "typewriter",
    subtitleDuration = 3,
    subtitleTransition = 0.5,
    subtitleIndicator = false,
    typewriterSpeed = 0.06,
    avatar,
    renderContent,
  }: TextMotionMessageProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [displayText, setDisplayText] = useState(animate ? "" : text);
    const [animationComplete, setAnimationComplete] = useState(!animate);
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
    const [sentences, setSentences] = useState<string[]>([]);

    // 자막용 타자기 효과 전용 상태
    const [isTyping, setIsTyping] = useState(false);
    const [currentTypingText, setCurrentTypingText] = useState("");

    // 애니메이션 상태 추적
    const animationRef = useRef<gsap.core.Timeline | gsap.core.Tween | null>(null);

    // 이미 애니메이션이 완료된 메시지 ID 추적을 위한 ref
    const animatedMessageIdRef = useRef<string | null>(null);

    // onComplete를 ref로 관리하여 재생성 방지
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    // 타자기 효과 애니메이션
    const startTypewriterAnimation = useCallback(
      (
        text: string,
        options: {
          onComplete?: () => void;
          onUpdate?: (currentText: string) => void;
          duration?: number;
          setAsMainAnimation?: boolean; // 메인 애니메이션으로 설정할지 여부
        } = {},
      ) => {
        const { onComplete, onUpdate, duration = text.length * typewriterSpeed, setAsMainAnimation = true } = options;

        let currentIndex = 0;

        const typewriterTween = gsap.to(
          {},
          {
            duration,
            ease: "none",
            onUpdate: function () {
              const progress = this.progress();
              const newIndex = Math.floor(text.length * progress);

              if (newIndex !== currentIndex) {
                currentIndex = newIndex;
                const currentText = text.substring(0, currentIndex);

                // 기본 업데이트 (기존 동작)
                if (setAsMainAnimation) {
                  setDisplayText(currentText);
                }

                // 커스텀 업데이트 콜백
                if (onUpdate) {
                  onUpdate(currentText);
                }
              }
            },
            onComplete: function () {
              if (setAsMainAnimation) {
                setDisplayText(text);
                setAnimationComplete(true);
                animatedMessageIdRef.current = messageId;
                if (onCompleteRef.current) onCompleteRef.current();
              }

              // 커스텀 완료 콜백
              if (onComplete) {
                onComplete();
              }
            },
          },
        );

        // 메인 애니메이션인 경우에만 ref에 저장
        if (setAsMainAnimation) {
          animationRef.current = typewriterTween;
        }

        return typewriterTween;
      },
      [messageId, typewriterSpeed],
    );

    // 자막 스타일 애니메이션 함수
    const startSubtitleAnimation = useCallback(
      (sentences: string[]) => {
        if (!containerRef.current) {
          console.warn("Container ref is null, skipping animation");
          setAnimationComplete(true);
          if (onCompleteRef.current) onCompleteRef.current();
          return;
        }

        const container = containerRef.current;
        const timeline = gsap.timeline({
          onComplete: () => {
            setAnimationComplete(true);
            animatedMessageIdRef.current = messageId;
            setIsTyping(false);
            if (onCompleteRef.current) onCompleteRef.current();
          },
        });

        sentences.forEach((sentence, index) => {
          const isLastSentence = index === sentences.length - 1;

          timeline
            // 문장 인덱스 설정 및 초기화
            .call(() => {
              setCurrentSentenceIndex(index);
              setCurrentTypingText("");
              setDisplayText("");
              setIsTyping(true);
            })
            // fade in
            .fromTo(
              container,
              { opacity: 0, y: 20 },
              {
                opacity: 1,
                y: 0,
                duration: subtitleTransition,
                ease: "power2.out",
              },
            );

          // 타자기 애니메이션을 별도로 생성해서 추가
          const typewriterTween = startTypewriterAnimation(sentence, {
            duration: sentence.length * 0.04,
            setAsMainAnimation: false,
            onUpdate: (currentText) => {
              setCurrentTypingText(currentText);
            },
            onComplete: () => {
              setDisplayText(sentence);
              setCurrentTypingText(sentence);
              setIsTyping(false);
            },
          });

          // Tween 객체를 직접 추가
          timeline.add(typewriterTween);

          // 문장 표시 시간 (타자기 효과 완료 후 대기)
          timeline.to({}, { duration: subtitleDuration - 0.5 });

          // 마지막 문장이 아닌 경우에만 fade out 추가
          if (!isLastSentence) {
            timeline.to(container, {
              opacity: 0,
              y: -20,
              duration: subtitleTransition,
              ease: "power2.in",
            });
          }
        });

        animationRef.current = timeline;
      },
      [messageId, subtitleDuration, subtitleTransition, startTypewriterAnimation],
    );

    useEffect(() => {
      // 이미 애니메이션이 완료된 동일한 메시지인 경우 재애니메이션 방지
      if (animatedMessageIdRef.current === messageId && animationComplete) {
        return;
      }

      // 이전 애니메이션 정리
      if (animationRef.current) {
        animationRef.current.kill();
      }

      // 애니메이션을 적용하지 않는 경우
      if (!animate) {
        setDisplayText(text);
        setAnimationComplete(true);
        animatedMessageIdRef.current = messageId;
        if (onCompleteRef.current) onCompleteRef.current();
        return;
      }

      // 자막 모드에서만 문장 분할을 수행한다.
      const splitSentences = animationType === "subtitle" ? splitIntoSentences(text) : [];
      setSentences(splitSentences);
      setCurrentSentenceIndex(0);

      // 초기화
      setDisplayText("");
      setCurrentTypingText(""); // 자막용 텍스트 초기화
      setIsTyping(false); // 타이핑 상태 초기화
      setAnimationComplete(false);

      if (text.length > 0) {
        // 애니메이션 시작 알림
        if (onAnimationStart) {
          onAnimationStart();
        }

        if (animationType === "subtitle") {
          startSubtitleAnimation(splitSentences);
        } else {
          // 기존 방식 그대로 사용 (기본 옵션)
          startTypewriterAnimation(text);
        }
      }

      return () => {
        if (animationRef.current) {
          animationRef.current.kill();
          // 중단 시 상태 정리
          setAnimationComplete(true);
          setDisplayText(text);
          setIsTyping(false);
          setCurrentTypingText("");
        }
      };
    }, [
      text,
      animate,
      messageId,
      animationType,
      animationComplete,
      startSubtitleAnimation,
      startTypewriterAnimation,
      onAnimationStart,
    ]);

    const currentText = animationType === "subtitle" ? (animationComplete ? text : currentTypingText) : displayText;

    return (
      <div className={cn("animated-message", avatar && "flex items-start gap-4", className)}>
        {avatar && (
          <CharacterSpriteAvatar
            sprite={avatar.sprite}
            portraitSrc={avatar.portraitSrc}
            alt={avatar.alt}
            className={cn("w-10 h-10 shrink-0 rounded-full border border-white/20 mt-1", avatar.className)}
            imageClassName={cn("object-cover object-top", avatar.imageClassName)}
          />
        )}

        <div className={cn("min-w-0", avatar && "flex-1", contentClassName)}>
          <div ref={containerRef} className="animated-message-content will-change-contents min-h-[1.5em] max-w-[30rem]">
            {renderContent ? renderContent(currentText) : currentText}

            {/* 타자기 커서 표시 */}
            {animate &&
              !animationComplete &&
              (animationType === "typewriter" || (animationType === "subtitle" && isTyping)) && (
                <span className="typing-cursor inline-block w-[2px] h-[1em] bg-current ml-[2px] animate-blink"></span>
              )}
          </div>

          {/* 자막 모드 진행 표시 */}
          {subtitleIndicator &&
            animate &&
            animationType === "subtitle" &&
            sentences.length > 1 &&
            !animationComplete && (
              <div className="flex justify-center mt-2 space-x-1">
                {sentences.map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors duration-300",
                      index === currentSentenceIndex ? "bg-current opacity-100" : "bg-current opacity-30",
                    )}
                  />
                ))}
              </div>
            )}
        </div>
      </div>
    );
  },
  // 메모이제이션 비교 함수 - 메시지 ID가 같으면 리렌더링 방지
  (prevProps, nextProps) => {
    return (
      prevProps.messageId === nextProps.messageId &&
      prevProps.text === nextProps.text &&
      prevProps.animationType === nextProps.animationType &&
      prevProps.animate === nextProps.animate &&
      prevProps.className === nextProps.className &&
      prevProps.contentClassName === nextProps.contentClassName &&
      prevProps.subtitleDuration === nextProps.subtitleDuration &&
      prevProps.subtitleTransition === nextProps.subtitleTransition &&
      prevProps.subtitleIndicator === nextProps.subtitleIndicator &&
      prevProps.typewriterSpeed === nextProps.typewriterSpeed &&
      prevProps.renderContent === nextProps.renderContent &&
      prevProps.avatar?.sprite === nextProps.avatar?.sprite &&
      prevProps.avatar?.portraitSrc === nextProps.avatar?.portraitSrc &&
      prevProps.avatar?.alt === nextProps.avatar?.alt &&
      prevProps.avatar?.className === nextProps.avatar?.className &&
      prevProps.avatar?.imageClassName === nextProps.avatar?.imageClassName
    );
  },
);

// 표시 이름 설정 (개발 도구에서 식별하기 위함)
TextMotionMessage.displayName = "TextMotionMessage";

export default TextMotionMessage;
