import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain prompt
 * @scope client
 */

export type Block = {
  id: string;
  type: "text" | "code"; // 명확하게 타입 지정
  content: string;
  fileInfo?: string; // 파일 정보 추가 (선택적)
};

type Comment = {
  id: string;
  blockId: string;
  selectedText: string;
  comment: string;
};

type HistoryItem = {
  id: string;
  timestamp: Date;
  blocks: Block[];
  comments: Comment[];
};

type EditorState = {
  blocks: Block[];
  comments: Comment[];
  history: HistoryItem[];
  addBlock: (block: Block, index?: number) => void; // index 인자 추가
  addComment: (comment: Comment) => void;
  updateBlock: (id: string, newContent: string, fileInfo?: string) => void;
  deleteBlock: (id: string) => void;
  saveHistory: () => void;
  loadHistory: () => void;
};

const usePromptEditorStore = create<EditorState>((set, get) => ({
  blocks: [],
  comments: [],
  history: [],
  addBlock: (block, index) =>
    set((state) => {
      const newBlocks = [...state.blocks];
      if (typeof index === "number" && index >= 0 && index <= newBlocks.length) {
        newBlocks.splice(index, 0, block);
      } else {
        newBlocks.push(block);
      }
      return { blocks: newBlocks };
    }),
  addComment: (comment) => set((state) => ({ comments: [...state.comments, comment] })),
  updateBlock: (id, newContent, fileInfo) =>
    set((state) => ({
      blocks: state.blocks.map((block) =>
        block.id === id
          ? {
              ...block,
              content: newContent,
              ...(fileInfo !== undefined ? { fileInfo } : {}),
            }
          : block,
      ),
    })),
  deleteBlock: (id) =>
    set((state) => ({
      blocks: state.blocks.filter((block) => block.id !== id),
      comments: state.comments.filter((comment) => comment.blockId !== id),
    })),
  saveHistory: () => {
    const currentHistory: HistoryItem = {
      id: uuidv4(),
      timestamp: new Date(),
      blocks: get().blocks,
      comments: get().comments,
    };
    const updatedHistory = [...get().history, currentHistory];
    set({ history: updatedHistory });
    try {
      localStorage.setItem("promptHistory", JSON.stringify(updatedHistory));
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        logger.warn("LocalStorage quota exceeded. Removing oldest history entry.");
        // 가장 오래된 항목을 삭제한 후 다시 저장
        updatedHistory.shift();
        try {
          localStorage.setItem("promptHistory", JSON.stringify(updatedHistory));
        } catch (error) {
          logger.error("Failed to save history after removing oldest entry.", error);
        }
      } else {
        logger.error(e);
      }
    }
  },

  loadHistory: () => {
    const historyData = localStorage.getItem("promptHistory");
    if (historyData) {
      set({ history: JSON.parse(historyData) });
    }
  },
}));

export default usePromptEditorStore;
