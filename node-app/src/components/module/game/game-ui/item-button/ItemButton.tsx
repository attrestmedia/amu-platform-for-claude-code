"use client";

import { Button } from "@amu-labs/ui";
import { useState } from "react";
import { cn } from "utils/common";
import { CheckIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import type { ItemType } from "./type";
import { ITEM_TYPE_DATA } from "./type";

interface ItemBoxButtonProps {
  name: ItemType;
  title?: string;
  sizes?: string;
  actived?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}

const ItemButton = ({
  name,
  title = "",
  actived,
  disabled,
  sizes = "40px",
  className,
  onClick,
}: ItemBoxButtonProps) => {
  // 컴포넌트 인스턴스의 고유 키를 생성하여 중복 렌더링 방지 — useState lazy 초기화로 render-purity 위반 회피
  const [buttonId] = useState(() => `item-button-${Math.random().toString(36).substring(2, 11)}`);

  return (
    <Button
      variant="text"
      className={cn("relative w-12 h-12 p-1 rounded-xl transition duration-150 hover:scale-110", className)}
      onClick={onClick}
      data-button-id={buttonId}
      title={title}
    >
      <div className="relative w-full h-full">
        <Image
          src={ITEM_TYPE_DATA[name].path}
          alt={ITEM_TYPE_DATA[name].name}
          fill
          sizes={sizes}
          className={cn("object-contain", disabled && "opacity-50 grayscale")}
          priority
        />
      </div>
      {actived && (
        <span className="flex items-center justify-center absolute top-0 right-[-0.15rem] border-2 border-white rounded-full w-5 h-5 bg-secondary text-white">
          <CheckIcon />
        </span>
      )}
    </Button>
  );
};

export default ItemButton;
