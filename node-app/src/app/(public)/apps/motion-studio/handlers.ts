import type { IMotionEditorSlideData, IMotionEditorSlideContent, IMotionEditorSlideItem } from "types/app";

// 순차적 ID 생성 함수
export const generateNextId = (slides: IMotionEditorSlideData["content"]): string => {
  const currentIds = slides.map((slide) => parseInt(slide.id, 10));
  const maxId = currentIds.length > 0 ? Math.max(...currentIds) : 0;
  return (maxId + 1).toString();
};

// 슬라이드 추가 핸들러
export const handleAddSlide = (
  slideData: IMotionEditorSlideData,
  setSlideData: React.Dispatch<React.SetStateAction<IMotionEditorSlideData>>,
  generateNextIdFn: () => string
) => {
  const newSlide: IMotionEditorSlideContent = {
    id: generateNextIdFn(),
    content: [{ text: "", color: "#000000", fontSize: "1.5rem", position: { x: 0, y: 0 } }],
    imageName: "",
    objectFit: "cover",
    objectPosition: "center",
  };
  setSlideData((prev) => ({
    ...prev,
    content: [...prev.content, newSlide],
  }));
};

// 슬라이드 삭제 핸들러
export const handleDeleteSlide = (
  id: string,
  setSlideData: React.Dispatch<React.SetStateAction<IMotionEditorSlideData>>
) => {
  setSlideData((prev) => {
    const newContent = prev.content
      .filter((slide) => slide.id !== id)
      .map((slide, index) => ({
        ...slide,
        id: (index + 1).toString(),
      }));
    return {
      ...prev,
      content: newContent,
    };
  });
};

// 슬라이드 업데이트 핸들러
export const handleUpdateSlide = (
  id: string,
  key: keyof IMotionEditorSlideContent,
  value: IMotionEditorSlideContent[keyof IMotionEditorSlideContent],
  setSlideData: React.Dispatch<React.SetStateAction<IMotionEditorSlideData>>
) => {
  setSlideData((prev) => ({
    ...prev,
    content: prev.content.map((slide) => (slide.id === id ? { ...slide, [key]: value } : slide)),
  }));
};

// 슬라이드 내용 아이템 업데이트 핸들러
export const handleUpdateContentItem = (
  slideId: string,
  contentIndex: number,
  key: keyof IMotionEditorSlideItem,
  value: IMotionEditorSlideItem[keyof IMotionEditorSlideItem],
  setSlideData: React.Dispatch<React.SetStateAction<IMotionEditorSlideData>>
) => {
  setSlideData((prev) => ({
    ...prev,
    content: prev.content.map((slide) => {
      if (slide.id === slideId) {
        const updatedContent = slide.content.map((item, idx) =>
          idx === contentIndex ? { ...item, [key]: value } : item
        );
        return { ...slide, content: updatedContent };
      }
      return slide;
    }),
  }));
};

// 텍스트 추가 핸들러
export const handleAddText = (
  slideId: string,
  setSlideData: React.Dispatch<React.SetStateAction<IMotionEditorSlideData>>
) => {
  setSlideData((prev) => ({
    ...prev,
    content: prev.content.map((slide) => {
      if (slide.id === slideId) {
        return {
          ...slide,
          content: [...slide.content, { text: "", color: "#000000", fontSize: "1.5rem", position: { x: 0, y: 0 } }],
        };
      }
      return slide;
    }),
  }));
};

// 텍스트 삭제 핸들러
export const handleDeleteText = (
  slideId: string,
  contentIndex: number,
  setSlideData: React.Dispatch<React.SetStateAction<IMotionEditorSlideData>>
) => {
  setSlideData((prev) => ({
    ...prev,
    content: prev.content.map((slide) => {
      if (slide.id === slideId) {
        const newContentItems = slide.content.filter((_, idx) => idx !== contentIndex);
        return { ...slide, content: newContentItems };
      }
      return slide;
    }),
  }));
};

// 슬라이드의 텍스트 위치 및 크기 업데이트 핸들러
export const handleUpdatePosition = (
  slideId: string,
  contentIndex: number,
  position: { x: number; y: number },
  size: { width: number; height: number },
  setSlideData: React.Dispatch<React.SetStateAction<IMotionEditorSlideData>>
) => {
  setSlideData((prev) => ({
    ...prev,
    content: prev.content.map((slide) => {
      if (slide.id === slideId) {
        const updatedContent = slide.content.map((item, idx) =>
          idx === contentIndex ? { ...item, position, size } : item
        );
        return { ...slide, content: updatedContent };
      }
      return slide;
    }),
  }));
};

// 슬러그 생성 함수 추가
export const generateSlug = (length: number = 10): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let slug = "";
  for (let i = 0; i < length; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
};
