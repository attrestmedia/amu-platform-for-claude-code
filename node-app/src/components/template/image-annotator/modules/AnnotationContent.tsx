import { useEffect } from "react";
import { useAnnotationState } from "hooks/catalog/useAnnotationState";
import type { ICategoryList } from "types/catalog";
import { ImageAnnotator } from "components/template/image-annotator";
import { logger } from "utils/log";

type AnnotationContentType = {
  annotations: ICategoryList[];
};

const AnnotationContent = ({ annotations }: AnnotationContentType) => {
  const { currentPage, setCurrentPage, setTotalPage } = useAnnotationState();

  const currentPageData = annotations[currentPage - 1] || {}; // 현재 페이지에 해당하는 데이터를 추출

  useEffect(() => {
    logger.log(">> [AnnotationContent] annotations => ", annotations);
    // 렌더링 후에 상태 업데이트
    if (annotations) {
      setTotalPage(annotations.length);

      // 현재 페이지가 totalPages를 초과하지 않도록 보장
      if (currentPage > annotations.length) {
        setCurrentPage(annotations.length);
      }
    }
  }, [annotations, setTotalPage, currentPage, setCurrentPage]);

  return <ImageAnnotator key={currentPage} data={currentPageData} />;
};

export default AnnotationContent;
