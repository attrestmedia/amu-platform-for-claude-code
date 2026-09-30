"use client";

import React, { useState } from "react";
import { Button, Input } from "@amu-labs/ui";
import { Check, X, Edit } from "lucide-react";
import { cn } from "utils/common";

interface NicknameEditorProps {
  currentNickname?: string;
  originalName: string;
  onSave: (nickname: string) => Promise<void>;
  className?: string;
  buttonClassName?: string;
  maxLength?: number;
}

function NicknameEditor({
  currentNickname = "",
  originalName,
  onSave,
  className,
  buttonClassName,
  maxLength = 20,
}: NicknameEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState(currentNickname);
  const [isLoading, setIsLoading] = useState(false);

  const handleStartEdit = () => {
    setNickname(currentNickname);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setNickname(currentNickname);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      await onSave(nickname.trim());
      setIsEditing(false);
    } catch (error) {
      console.error("별명 저장 실패:", error);
      // 에러 처리는 부모 컴포넌트에서 toast 등으로 처리
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={handleKeyPress}
          maxLength={maxLength}
          placeholder={originalName}
          className="h-8 text-sm bg-black/20 border-[transparent]"
          autoFocus
          disabled={isLoading}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSave}
          disabled={isLoading}
          className={cn("h-8 w-8 p-0 text-white", buttonClassName)}
        >
          <Check size={14} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={isLoading}
          className={cn("h-8 w-8 p-0 text-white", buttonClassName)}
        >
          <X size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span>
        {currentNickname || originalName}
        {currentNickname && <span className="text-gray-400 text-xs ml-2">({originalName})</span>}
      </span>
      <Button
        size="sm"
        onClick={handleStartEdit}
        className="h-6 w-6 p-0 rounded-full"
        variant="secondary"
        title="별명 편집"
      >
        <Edit size={12} />
      </Button>
    </div>
  );
}

export default NicknameEditor;
