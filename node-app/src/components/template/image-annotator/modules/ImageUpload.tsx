import React, { useState } from "react";
import type { ICategoryList } from "types/catalog";
import fetchClient from "libs/api/fetchClient";
import { FileUpload } from "components/module/upload";
import { Button, dialog } from "@amu-labs/ui";
import { toErrorMessage } from "utils/common/typeUtils";

type UploadImagesResponseType = {
  success?: boolean;
  error?: string;
  data?: { updatedAnnotations: ICategoryList[] };
};

interface ImageUploadProps {
  userId: string;
  onUploadSuccess: (categoryName: string, updatedAnnotations: ICategoryList[]) => void;
}

const ImageUpload = ({ userId, onUploadSuccess }: ImageUploadProps) => {
  // 업로드된 파일 URL 관리
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // 폼 데이터 상태 관리
  const [categoryName, setCategoryName] = useState("");
  const [subCategoryName, setSubCategoryName] = useState("");

  // 파일 변경 핸들러
  const handleFileChange = (urls: string[]) => {
    setUploadedFiles(urls);
  };

  // 업로드 완료 후 서버에 전송
  const handleSubmit = async () => {
    if (uploading) return;

    if (!categoryName.trim() || !subCategoryName.trim()) {
      void dialog.alert("카테고리 이름과 서브카테고리 이름을 입력해주세요.");
      return;
    }

    if (uploadedFiles.length === 0) {
      void dialog.alert("업로드할 파일을 선택해주세요.");
      return;
    }

    setUploading(true);
    try {
      const { data: result } = await fetchClient.post<UploadImagesResponseType>(
        "/app/catalog/upload-images",
        {
          userId,
          categoryName,
          subCategoryName,
          files: uploadedFiles,
        },
        { loading: "global" },
      );
      if (!result?.success || !result.data) throw new Error(result?.error || "업로드 처리 실패");

      // 성공 콜백 실행
      onUploadSuccess(categoryName, result.data.updatedAnnotations);

      // 상태 초기화
      setCategoryName("");
      setSubCategoryName("");
      setUploadedFiles([]);
    } catch (error: unknown) {
      void dialog.alert({ variant: "danger", message: `업로드 실패: ${toErrorMessage(error, "업로드 처리 실패")}` });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 카테고리 입력 폼 */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">
            카테고리 이름:
            <input
              type="text"
              name="categoryName"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-default shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="카테고리 이름을 입력하세요"
              required
            />
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            서브카테고리 이름:
            <input
              type="text"
              name="subCategoryName"
              value={subCategoryName}
              onChange={(e) => setSubCategoryName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-default shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="서브카테고리 이름을 입력하세요"
              required
            />
          </label>
        </div>
      </div>

      {/* 파일 업로드 */}
      <FileUpload
        endpoint="/catalog/upload-images"
        kind="catalog-image"
        value={uploadedFiles}
        onChange={handleFileChange}
        multiple={true}
        accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
        ui="dropzone"
        maxFiles={50}
      />

      {/* 제출 버튼 */}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={
            uploading || uploadedFiles.length === 0 || !categoryName.trim() || !subCategoryName.trim()
          }
          loading={uploading}
          className="px-4 py-2 bg-blue-600 text-white rounded-default hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          업로드 완료
        </Button>
      </div>
    </div>
  );
};

export default ImageUpload;
