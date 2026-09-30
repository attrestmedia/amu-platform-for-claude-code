import Image from "next/image";
import type { FC } from "react";
import { cn } from "utils/common";

interface AvatarThumbnailProps {
  src: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  alt?: string;
  className?: string;
  imgClassName?: string;
  onClick?: () => void;
}

const AvatarThumbnail: FC<AvatarThumbnailProps> = ({ src, alt, size = "md", className, imgClassName, onClick }) => {
  const sizeClasses = {
    xs: "icno-xs",
    sm: "icno-sm",
    md: "icon-md",
    lg: "icon-lg",
    xl: "icon-xl",
  };

  return (
    <span
      className={cn(
        "relative rounded-full overflow-hidden border-[2px] border-white",
        sizeClasses[size],
        onClick && "cursor-pointer active:opacity-80 transition-opacity",
        className,
      )}
      onClick={onClick}
    >
      <Image
        src={src}
        alt={alt || ""}
        className={cn("object-cover object-top object-top bg-white", imgClassName)}
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        priority
      />
    </span>
  );
};

export default AvatarThumbnail;
