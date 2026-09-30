"use client";
import { useMemo, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Laugh, Smile, Frown, Angry, Meh, Zap, Shield, Brain, Sun, MoonStar, Star, Heart } from "lucide-react";
import { PERSONA_MOOD_TYPES, PERSONA_MOOD_COLOR_MAP, type PersonaMoodType } from "consts/game";
import { cn } from "utils/common";

type Props = {
  systemCodes?: string[] | null;
  className?: string;
};

type MoodData = { icon: ReactNode; color: string; mood: string };

// 무드별 아이콘 매핑
const MOOD_ICON_MAP: Record<PersonaMoodType, React.ReactNode> = {
  neutral: <Meh size={16} />,
  confident: <Shield size={16} />,
  calm: <MoonStar size={16} />,
  passionate: <Zap size={16} />,
  mysterious: <MoonStar size={16} />,
  optimistic: <Sun size={16} />,
  intellectual: <Brain size={16} />,
  charismatic: <Star size={16} />,
  cheerful: <Smile size={16} />,
  anxious: <Frown size={16} />,
  sensitive: <Heart size={16} />,
  aloof: <Angry size={16} />,
  distracted: <Laugh size={16} />,
  lethargic: <Meh size={16} />,
  cynical: <Frown size={16} />,
  irritable: <Angry size={16} />,
};

export default function ChatMoodIndicator({ systemCodes, className }: Props) {
  const moodIconData = useMemo<MoodData | null>(() => {
    const codes = systemCodes ?? [];
    if (codes.length === 0) return null;

    const moodCode = codes.find((c) => typeof c === "string" && c.startsWith("mood-"));
    if (moodCode) {
      const key = moodCode.replace("mood-", "") as PersonaMoodType;
      // 배열에서 유효한 무드인지 확인
      const isValidMood = PERSONA_MOOD_TYPES.includes(key);
      const safeKey: PersonaMoodType = isValidMood ? key : "neutral";
      // 색상 매핑에서 tailwind 클래스 생성
      const colorName = PERSONA_MOOD_COLOR_MAP[safeKey];

      return {
        icon: MOOD_ICON_MAP[safeKey],
        color: `text-${colorName}-400`,
        mood: safeKey,
      };
    }

    // 시스템 코드 처리
    if (codes.includes("end-chat")) return { icon: <Angry size={16} />, color: "text-red-400", mood: "Bad" };
    if (codes.includes("negative")) return { icon: <Frown size={16} />, color: "text-orange-400", mood: "Negative" };
    if (codes.includes("positive")) return { icon: <Smile size={16} />, color: "text-green-400", mood: "Positive" };
    if (codes.includes("good")) return { icon: <Laugh size={16} />, color: "text-green-400", mood: "Good" };

    return null;
  }, [systemCodes]);

  return (
    <AnimatePresence>
      {moodIconData && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: 10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={cn("inline-flex items-center gap-1 bg-black/20 px-2 py-1 rounded-lg", className)}
        >
          <div className={cn("transition-colors duration-200", moodIconData.color)}>{moodIconData.icon}</div>
          <span className={cn("text-white/70 text-sm font-medium", moodIconData.color)}>{moodIconData.mood}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
