import React from "react";
import { Rnd, type ResizableDelta } from "react-rnd";
import type { ResizeDirection } from "re-resizable";
import type { DraggableEvent, DraggableData } from "react-draggable";
import clsx from "clsx";
import type { IAnnotation } from "types/catalog";
import { colorMappingClassType, labelMappingClassType } from "utils/catalog/catalog";
import { isDev } from "utils/common";
import { useAnnotationState } from "hooks/catalog/useAnnotationState";
import styles from "./AnnotationBox.module.scss"; // SCSS 모듈 추가

interface AnnotationBoxProps {
  annotation: IAnnotation;
  index: number;
  scale: number;
  isSelected: boolean;
  onClick: () => void;
  onDragStop: (index: number, e: DraggableEvent, data: DraggableData) => void;
  onResizeStop: (
    index: number,
    e: MouseEvent | TouchEvent,
    direction: ResizeDirection,
    ref: HTMLDivElement,
    delta: ResizableDelta,
    position: { x: number; y: number },
  ) => void;
  onLabelChange?: (e: React.ChangeEvent<HTMLInputElement>, index: number) => void;
  onColorChange?: (e: React.ChangeEvent<HTMLInputElement>, index: number) => void;
  onDelete: (index: number) => void;
}

const AnnotationBox = ({
  annotation,
  index,
  scale,
  isSelected,
  onClick,
  onDragStop,
  onResizeStop,
  onLabelChange,
  onColorChange,
}: AnnotationBoxProps) => {
  const { currentMode } = useAnnotationState();
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (currentMode === "masking") return;
    e.stopPropagation(); // 이벤트 전파 방지
    onClick(); // 부모에 전달된 onClick 호출
  };

  const boxColor = colorMappingClassType(annotation.classType);

  return (
    <>
      <Rnd
        bounds="parent"
        size={{ width: annotation.width * scale, height: annotation.height * scale }}
        position={{ x: annotation.x * scale, y: annotation.y * scale }}
        className={clsx("annotation-box", isSelected && "selected")} // 선택된 상태에 따라 클래스 추가
        onDragStop={currentMode !== "masking" ? (e, d) => onDragStop(index, e, d) : undefined}
        onResizeStop={
          currentMode !== "masking"
            ? (e, direction, ref, delta, position) =>
                onResizeStop(index, e, direction, ref as HTMLDivElement, delta, position)
            : undefined
        }
        disableDragging={currentMode === "masking"} // 드래그 비활성화
        enableResizing={currentMode !== "masking"} // 리사이즈 비활성화
        style={{
          border: `${isSelected ? "2px" : "1px"} solid ${boxColor}`,
          zIndex: isSelected ? 20 : 10, // 선택된 어노테이션이 다른 것보다 위에 표시되도록 z-index 조정
          cursor: currentMode !== "masking" ? "move" : "pointer", // 마스킹 모드일 때 기본 커서, 아닐 때 드래그 커서
        }}
        onClick={handleClick}
      >
        <div
          className={clsx(
            "absolute inset-0 whitespace-nowrap flex items-center justify-between gap-[5px]",
            styles.annotationBoxHeader,
          )}
          style={
            {
              "--annotation-color": boxColor,
              "--handle-correct": "-4px",
            } as React.CSSProperties
          }
        >
          {onLabelChange ? (
            <span
              className={clsx(
                "absolute -top-6 -left-[1px] text-white border-0 rounded-lg text-xxs capitalize",
                styles.annotationLabel,
              )}
              style={{ backgroundColor: boxColor }}
            >
              <input
                type="text"
                value={labelMappingClassType(annotation.classType)}
                onChange={(e) => onLabelChange(e, index)}
                readOnly
                className="bg-transparent"
              />
            </span>
          ) : (
            <span
              className={clsx(
                "absolute -top-6 -left-[1px] text-white border-0 rounded-lg py-[0.15rem] px-[0.35rem] pb-[0.2rem] text-xxs capitalize",
                styles.annotationLabel,
              )}
              style={{ backgroundColor: boxColor }}
            >
              {labelMappingClassType(annotation.classType)}
            </span>
          )}

          {isSelected && (
            <div className={clsx("absolute inset-0", styles.annotationBoxHandles)}>
              <div className={styles.handle1}></div>
              <div className={styles.handle2}></div>
              <div className={styles.handle3}></div>
              <div className={styles.handle4}></div>
            </div>
          )}

          {onColorChange && (
            <input type="color" value={boxColor} onChange={(e) => onColorChange(e, index)} className="bg-transparent" />
          )}
        </div>
      </Rnd>
      {isSelected && isDev && (
        <div
          className="fixed top-16 right-[calc(1.5rem+4px)] bg-black/50 text-xxs overflow-y-auto p-2"
          style={{ border: `1px solid ${boxColor}` }}
        >
          <ul className="m-0 p-[0.15rem]">
            <li>ID: {index}</li>
            <li>width: {annotation.width}</li>
            <li>height: {annotation.height}</li>
            <li>x pos: {annotation.x}</li>
            <li>y pos: {annotation.y}</li>
            <li>class type: {annotation.classType}</li>
            <li>color: {boxColor}</li>
            <li>label: {labelMappingClassType(annotation.classType)}</li>
          </ul>
        </div>
      )}
    </>
  );
};

export default AnnotationBox;
