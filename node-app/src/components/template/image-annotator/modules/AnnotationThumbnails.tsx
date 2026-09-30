import React, { useRef, useEffect } from "react";
import Image from "next/image";
import type { ICategory } from "types/catalog";

type AnnotationThumbnailsProps = {
  items: ICategory[];
  onClick: (thumbnail: ICategory, index: number) => void;
  selected: number | null;
};

const AnnotationThumbnails = ({ items, onClick, selected }: AnnotationThumbnailsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedThumbnailRef = useRef<HTMLDivElement>(null);

  const handleWheel = (event: React.WheelEvent) => {
    if (containerRef.current) {
      event.preventDefault();
      containerRef.current.scrollLeft += event.deltaY;
    }
  };

  useEffect(() => {
    if (selectedThumbnailRef.current && containerRef.current) {
      const container = containerRef.current;
      const selectedThumbnail = selectedThumbnailRef.current;

      const containerRect = container.getBoundingClientRect();
      const selectedRect = selectedThumbnail.getBoundingClientRect();

      // Check if the selected thumbnail is outside the visible area of the container
      if (selectedRect.left < containerRect.left || selectedRect.right > containerRect.right) {
        selectedThumbnail.scrollIntoView({
          behavior: "smooth",
          inline: "nearest",
          block: "nearest",
        });
      }
    }
  }, [selected]);

  return (
    <div className="flex w-full my-4 pb-2 overflow-auto annotation-thumbnails" onWheel={handleWheel} ref={containerRef}>
      {items.length > 0 ? (
        items.map((elem, idx) => (
          <div
            key={idx}
            className={`relative bg-black rounded-lg mr-4 last:mr-0 thumbnail-container ${
              selected === idx ? "selected" : ""
            }`}
            style={{
              width: "135px",
              height: "74px",
            }}
            onClick={() => onClick(elem, idx)}
            ref={selected === idx ? selectedThumbnailRef : null}
          >
            <Image
              src={elem.src}
              width={135}
              height={74}
              alt=""
              className={`thumbnail rounded-lg align-top max-w-none h-full object-cover ${
                selected === idx ? "opacity-100 outline outline-2 outline-white -outline-offset-2" : "opacity-50"
              }`}
            />
            {/* If you need the checked-annotation class */}
            {/* <div className="absolute top-1.5 right-1.5 checked-annotation">
              <img className="outline-0 opacity-100" src="..." alt="..." />
            </div> */}
          </div>
        ))
      ) : (
        <div>No Thumbnails Available</div>
      )}
    </div>
  );
};

export default AnnotationThumbnails;
