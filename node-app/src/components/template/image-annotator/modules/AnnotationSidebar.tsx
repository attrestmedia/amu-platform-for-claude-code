"use client";

import { useState } from "react";
import Image from "next/image";
import { AnnotationSidebarItem } from "components/template/image-annotator";
import { Button, CircleProgress } from "@amu-labs/ui";
import { useAnnotationState } from "hooks/catalog/useAnnotationState";
import type { IProfile } from "types/catalog";
import { logger } from "utils/log";

type AnnotationSidebarProps = {
  isUseGuide: boolean;
  setIsUseGuide: React.Dispatch<React.SetStateAction<boolean>>;
  profile: IProfile;
};

const AnnotationSidebar = ({ isUseGuide, setIsUseGuide, profile }: AnnotationSidebarProps) => {
  const { appMode } = useAnnotationState();
  const [isShowAllShortcuts, setIsShowAllShortcuts] = useState<boolean>(false);

  const handleUseGuideClose = () => {
    setIsUseGuide(false);
  };

  logger.log("appMode => ", appMode);

  return (
    <aside className="flex flex-col bg-white rounded-lg w-64 p-4 annotation-sidebar">
      {/* 사이드바 헤더 섹션 */}
      <div className="sidebar-header">
        <h3 className="flex items-center justify-between text-lg">
          {!isUseGuide ? (
            `${appMode !== "view" ? "수동 라벨링 작업 현황" : "검수 현황"}`
          ) : (
            <>
              기본 사용법
              <Button onClick={handleUseGuideClose} style={{ background: "transparent" }}>
                <div className="relative w-5 h-5 inline-block">
                  <Image src="/icons/arrow_left.svg" alt="" fill sizes="20px" style={{ transform: "rotate(90deg)" }} />
                </div>
              </Button>
            </>
          )}
        </h3>
        {!isUseGuide && (
          <div className="relative flex justify-center my-8 annotation-process">
            <CircleProgress size={180} progress={86.7} strokeWidth={12} />
            <ul className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center annotation-process-detail">
              <li className="progress-value">
                <span className="text-2xl font-bold value">86.7</span>
                <span className="text-xxs unit">%</span>
              </li>
              <li className="text-sm progress-count">
                <span className="current">1358</span>
                <span className="opacity-35 total before:content-['/'] before:mx-1">2000</span>
              </li>
            </ul>
          </div>
        )}
      </div>

      {!isUseGuide ? (
        <div className="max-h-[calc(100vh-24.5rem)] pr-2 -mr-2 overflow-auto annotation-workers">
          <ul className="space-y-4 worker-list">
            <li>
              <AnnotationSidebarItem src={profile.src} name={profile.name} />
            </li>
          </ul>
        </div>
      ) : (
        <div className="flex flex-col justify-between h-full shortcut-guide-container">
          {/* 단축키 가이드 */}
          <ul className="flex flex-wrap mx-[-0.5rem] mt-4 shortcut-guide">
            <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
              <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">W</Button>
              <span className="text-xxs mt-2 shortcut-label">
                이전
                <br />
                프레임
              </span>
            </li>
            {appMode !== "view" ? (
              <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">
                  A/M
                </Button>
                <span className="text-xxs mt-2 shortcut-label">
                  라벨/마스킹
                  <br />
                  모드 변경
                </span>
              </li>
            ) : (
              <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">R</Button>
                <span className="text-xxs mt-2 shortcut-label">일괄 재작업</span>
              </li>
            )}
            <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
              <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">E</Button>
              <span className="text-xxs mt-2 shortcut-label">
                다음
                <br />
                프레임
              </span>
            </li>
            {appMode !== "view" ? (
              <>
                <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                  <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">
                    123
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">
                    라벨 종류
                    <br />
                    입력
                  </span>
                </li>
                <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                  <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">
                    L
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">
                    이전 마스킹
                    <br />
                    영역 로드
                  </span>
                </li>
                <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                  <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">
                    Z
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">
                    이전 프레임
                    <br />
                    라벨/마킹 복사
                  </span>
                </li>
                <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                  <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">
                    S
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">저장</span>
                </li>
                <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                  <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">
                    X
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">
                    라벨/마킹
                    <br />
                    삭제
                  </span>
                </li>
                <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                  <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">
                    C
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">
                    현재 프레임
                    <br />
                    라벨/마킹
                    <br />
                    초기화
                  </span>
                </li>
                <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                  <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base border border-dashed border-white/25 bg-transparent label-btn">
                    <Image src="/icons/create_label.svg" alt="" className="absolute top-0 left-0 w-full h-full" />
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">라벨 생성</span>
                </li>
                <li className="w-full my-4 flex flex-col items-center text-center move-keys">
                  <Button className="w-auto h-auto bg-transparent move-keys-btn">
                    <Image src="/icons/move_key_icons.svg" alt="" />
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">라벨 이동</span>
                </li>
              </>
            ) : (
              <>
                <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                  <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">
                    F1
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">삭제</span>
                </li>
                <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                  <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">
                    F2
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">승인</span>
                </li>
                <li className="flex flex-col items-center w-[calc(33.33333%-1rem)] m-2 text-center">
                  <Button className="relative items-start justify-start w-16 h-16 font-extrabold p-2 text-base">
                    F3
                  </Button>
                  <span className="text-xxs mt-2 shortcut-label">재작업</span>
                </li>
              </>
            )}
          </ul>

          {/* 단축키 가이드 푸터 */}
          <div className="p-4 text-center shortcut-guide-footer">
            <Button onClick={() => setIsShowAllShortcuts(true)}>단축키 전체보기</Button>
          </div>

          {/* 모든 단축키 모달 */}
          {isShowAllShortcuts && (
            <div className="fixed top-0 left-0 right-0 bottom-0 flex items-center justify-center bg-black/80 z-[999] all-shortcut-container">
              <div className="w-full max-w-[80rem] bg-white p-4 rounded-xl shortcut-modal">
                <div className="flex justify-between mb-4 pb-4 border-b border-white/25 shortcut-modal-header">
                  <h3>전체 단축키</h3>
                  <Button onClick={() => setIsShowAllShortcuts(false)}>
                    <Image src="/icons/close.svg" alt="" />
                  </Button>
                </div>
                <div className="shortcut-modal-body">
                  <Image src="/images/all_shortcut_key_guide.jpg" alt="" className="w-full h-auto" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

export default AnnotationSidebar;
