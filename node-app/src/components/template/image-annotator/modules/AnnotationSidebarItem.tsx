import React from "react";
import Image from "next/image";
import { CircleProgress } from "@amu-labs/ui";
import { THEME } from "consts/catalog";

interface AnnotationSidebarItemProps {
  src: string;
  name?: string;
  process?: number;
  current?: number;
  total?: number;
}

const AnnotationSidebarItem = ({ src, name, process, current, total }: AnnotationSidebarItemProps) => {
  return (
    <div className="flex items-center bg-primary p-4 rounded-lg profile-item">
      {/* 프로필 썸네일 컨테이너 */}
      <div className="relative w-[42px] h-[42px] profile-thumb">
        <Image
          src={src}
          alt={name ? name : ""}
          width={50}
          height={50}
          className="absolute top-1 left-1 w-[34px] h-[34px] object-cover rounded-full"
        />
        <CircleProgress
          size={42}
          progress={process || 0}
          strokeWidth={5}
          gradientId="worker-process"
          stopColors={[
            { offset: "0%", stopColor: THEME.COLORS.blue1 },
            { offset: "100%", stopColor: THEME.COLORS.blue1 },
          ]}
        />
      </div>

      {/* 프로필 정보 컨테이너 */}
      <div className="ml-4 profile-info">
        {/* 진행률 퍼센트 표시 */}
        <p className="progress-value">
          <span className="text-base font-bold value">{process}</span>
          <span className="text-xxs unit">%</span>
        </p>

        {/* 진행 상태 카운트 표시 */}
        <p className="mt-1 text-xxs progress-count">
          <span className="current">{current}</span>
          <span className="opacity-35 total before:content-['/'] before:mx-1">{total}</span>
        </p>
      </div>
    </div>
  );
};

export default AnnotationSidebarItem;
