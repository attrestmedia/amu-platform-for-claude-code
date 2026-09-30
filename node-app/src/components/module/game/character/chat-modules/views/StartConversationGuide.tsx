"use client";

import { Lang } from "components/module/i18n";
import { motion } from "framer-motion";
import type { IExtendedNpcData } from "types/game";
import { CharacterSpriteAvatar } from "../CharacterSpriteAvatar";

interface Props {
  character: IExtendedNpcData;
  portraitSrc?: string | null;
}

const StartConversationGuide = ({ character, portraitSrc }: Props) => {
  return (
    <motion.div
      key="start-conversation-guide"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center flex-1 text-center px-4"
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 max-w-sm mx-auto border border-white/20"
      >
        <CharacterSpriteAvatar
          sprite={character.sprite}
          portraitSrc={portraitSrc}
          alt={character.name || ""}
          className="block w-12 h-12 mb-2 mx-auto rounded-full border-none"
          imageClassName="object-cover object-top"
        />
        <h3 className="text-white text-lg font-semibold mb-2">{character.name}</h3>
        <p className="text-white/80 text-sm leading-relaxed">
          <Lang text={{ ko: "이 캐릭터와 대화를 시작하세요!", en: "Start a conversation with this character!" }} />
        </p>
      </motion.div>
    </motion.div>
  );
};

export default StartConversationGuide;
