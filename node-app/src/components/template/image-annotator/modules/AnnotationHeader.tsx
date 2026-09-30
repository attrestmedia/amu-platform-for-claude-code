"use client";

import Image from "next/image";
import { Button } from "@amu-labs/ui";

const AnnotationHeader = () => {
  return (
    <header className="flex items-center px-6 h-16 annotation-header">
      {/* 헤더 메뉴 */}
      <ul className="min-w-80 flex header-menu">
        <li className="flex items-center">
          <Button className="mx-1">
            <Image src="/icons/keyboard.svg" alt="키보드 가이드" />
          </Button>
        </li>
        <li className="flex items-center">
          <Button className="mx-1">
            <Image src="/icons/logout.svg" alt="나가기" />
          </Button>
        </li>
      </ul>

      {/* 헤더 버튼 포털 */}
      <div id="header-buttons-portal" />
    </header>
  );
};

export default AnnotationHeader;
