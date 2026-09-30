import React, { useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@amu-labs/ui";
import { labelMappingClassType } from "utils/catalog/catalog";
import { useAnnotationState } from "hooks/catalog/useAnnotationState";

type ClassKeyMapping = {
  key: string;
  label: string;
  color: string;
};

type AnnotationButtonsProps = {
  handlePreviousFrame: () => void;
  handleNextFrame: () => void;
  handleAddAnnotation: () => void;
  handleDeleteAnnotation: () => void;
  handleAddClass: (className: string) => void;
  classKeyMaps: ClassKeyMapping[];
};

const AnnotationButtons = ({
  handlePreviousFrame,
  handleNextFrame,
  handleAddAnnotation,
  handleDeleteAnnotation,
  handleAddClass,
  classKeyMaps,
}: AnnotationButtonsProps) => {
  const { currentClassType, setCurrentClassType } = useAnnotationState();
  const shortcutItemsRef = useRef<HTMLDivElement>(null);

  const handleButtonClick = (key: string) => {
    setCurrentClassType(key);
    handleAddClass(labelMappingClassType(key));
  };

  useEffect(() => {
    // 가로 스크롤을 위한 이벤트 핸들러
    const handleWheel = (event: WheelEvent) => {
      if (shortcutItemsRef.current) {
        event.preventDefault();
        shortcutItemsRef.current.scrollLeft += event.deltaY;
      }
    };

    const shortcutItems = shortcutItemsRef.current;
    if (shortcutItems) {
      shortcutItems.addEventListener("wheel", handleWheel);
    }

    return () => {
      if (shortcutItems) {
        shortcutItems.removeEventListener("wheel", handleWheel);
      }
    };
  }, []);

  return (
    <ul className="flex shortcut-menu">
      {/* 프레임 조작 버튼 */}
      <li className="flex items-center">
        <span className="text-xs font-bold mr-1 label">Frame</span>
        <div className="flex shortcut-items frame">
          <Button onClick={handlePreviousFrame} title="W" className="mx-1">
            <Image src="/icons/arrow_left.svg" alt="" />
          </Button>
          <Button onClick={handleNextFrame} title="E" className="mx-1">
            <Image src="/icons/arrow_right.svg" alt="" />
          </Button>
        </div>
      </li>

      {/* 객체 조작 버튼 */}
      <li className="flex items-center ml-8">
        <span className="text-xs font-bold mr-1 label">Object</span>
        <div className="flex shortcut-items object">
          <Button onClick={handleAddAnnotation} title="A" className="mx-1">
            <Image src="/icons/plus.svg" alt="" />
          </Button>
          <Button onClick={handleDeleteAnnotation} title="DEL" className="mx-1">
            <Image src="/icons/minus.svg" alt="" />
          </Button>
        </div>
      </li>

      {/* 클래스 선택 버튼 */}
      <li className="flex items-center ml-8">
        <span className="text-xs font-bold mr-1 label">Class</span>
        <div className="flex overflow-auto py-1 shortcut-items class" ref={shortcutItemsRef}>
          {classKeyMaps?.map((mapping, idx) => (
            <Button
              key={mapping.key}
              onClick={() => handleButtonClick(mapping.key)}
              className={`mx-1 capitalize btn-${idx + 1} ${currentClassType === mapping.key ? "text-white" : ""}`}
              style={{
                background: currentClassType === mapping.key ? mapping.color : "",
              }}
              title={(idx + 1).toString()}
            >
              {mapping.label}
            </Button>
          ))}
        </div>
      </li>
    </ul>
  );
};

export default AnnotationButtons;
