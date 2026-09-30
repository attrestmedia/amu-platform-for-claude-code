"use client";

import React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { IExtendedNpcData } from "types/game";
import { cn } from "utils/common";

type ChatBackgroundProps = {
  character: IExtendedNpcData;
  userName: string;
  showUserCharacter: boolean;
  npcSrc: string | null;
  userSrc: string | null;
};

export function ChatBackground({
  character,
  userName,
  showUserCharacter,
  npcSrc,
  userSrc,
}: ChatBackgroundProps) {
  const showUser = Boolean(showUserCharacter && userSrc);

  const src = showUser ? userSrc : npcSrc;
  const alt = showUser ? userName || "User" : character.name;
  const key = showUser ? `user-${userSrc}` : `char-${character.pid}`;

  return (
    <div
      className={cn("character-chat-bg absolute inset-x-0 top-0 z-0 w-full overflow-hidden")}
      style={{ height: "var(--chat-stable-h, 100%)" }}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0"
        >
          {src ? (
            <Image
              src={src}
              alt={alt}
              fill
              className="object-cover object-top"
              sizes="(max-width: 560px) 100vw, 560px"
              priority
            />
          ) : (
            // src가 비어있으면 next/image가 에러를 던질 수 있어서 placeholder 처리
            <div className="absolute inset-0 bg-black/40" />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
