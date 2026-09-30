"use client";

import { useState, useEffect } from "react";
import { AnnotationSidebar, AnnotationContent, ImageUpload, ProfileForm } from "./modules";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAnnotationState } from "hooks/catalog/useAnnotationState";
import { getProfile } from "libs/api/user";
import { getCategoryList, getProductData } from "libs/services/catalog";
import type { IProfile } from "types/catalog";
import type { ICategoryList } from "types/catalog";
import { Button } from "@amu-labs/ui";
import { logger } from "utils/log";

export default function AnnotationApp() {
  const { userId, setUserId, categoryName, setCategoryName } = useAnnotationState();

  // 선택된 유저의 카테고리 목록 관리
  // const [categories, setCategories] = useState<string[]>([]);
  const [isUseGuide, setIsUseGuide] = useState<boolean>(false);

  const queryClient = useQueryClient();

  // 현재 사용자 ID 설정 (default: "guest")
  const currentUserId = userId || "guest";

  // 유저 아이디 설정
  useEffect(() => {
    setUserId(currentUserId); // 유저 아이디 업데이트
  }, [currentUserId, setUserId]);

  // 현재 사용자에 해당하는 카테고리 목록 가져오기
  const { data: categoryList } = useQuery<string[] | null, Error>({
    queryKey: ["categories", currentUserId],
    queryFn: () => getCategoryList(currentUserId),
    retry: false,
  });

  useEffect(() => {
    if (categoryList) {
      // setCategories(categoryList);
      if (categoryList.length > 0 && !categoryName) {
        setCategoryName(categoryList[0]);
      }
      logger.log("categoryList => ", categoryList);
    }
  }, [categoryList, categoryName, setCategoryName]);

  // 프로필 가져오기
  const {
    data: profile,
    error: profileError,
    isLoading: isProfileLoading,
    refetch: refetchProfile,
  } = useQuery<IProfile | null, Error>({
    queryKey: ["profiles", currentUserId],
    queryFn: () => getProfile(currentUserId),
    retry: false, // 에러 발생 시 자동 재시도 방지
  });

  // 어노테이션 데이터 가져오기
  const {
    data: annotations,
    error: annotationsError,
    isLoading: isAnnotationsLoading,
    refetch: refetchAnnotations,
  } = useQuery<ICategoryList[] | null, Error>({
    queryKey: ["annotations", currentUserId, categoryName],
    queryFn: () => getProductData(currentUserId, categoryName!),
    enabled: !!profile && !!categoryName, // 프로필과 선택된 카테고리가 있을 때만 실행
    staleTime: 5000, // 5초 동안 데이터를 신선한 상태로 유지
    refetchOnWindowFocus: false, // 포커스 전환 시 데이터를 다시 가져오지 않음
  });

  // 프로필 생성 성공 시 프로필 데이터 업데이트
  const handleProfileSuccess = (newProfile: IProfile) => {
    // React Query 캐시에 새로운 프로필 데이터 설정
    queryClient.setQueryData(["profiles", currentUserId], newProfile);
  };

  // 이미지 업로드 성공 시 어노테이션 데이터 업데이트
  const handleImageUploadSuccess = (categoryName: string, updatedAnnotations: ICategoryList[]) => {
    logger.log("Image upload success for category:", categoryName);
    logger.log("Updated Annotations:", updatedAnnotations);
    // 선택된 카테고리 이름을 업데이트
    setCategoryName(categoryName);

    // **캐시를 업데이트하거나 데이터를 페칭하는 기능 중 둘 중 하나만 사용하는 것이 좋음
    // 새로운 카테고리 이름을 사용하여 캐시 업데이트
    // queryClient.setQueryData(["annotations", currentUserId, categoryName], updatedAnnotations);

    // 쿼리 무효화하여 최신 데이터 가져오기
    queryClient.invalidateQueries({
      queryKey: ["annotations", currentUserId, categoryName],
    });
  };

  // 디버깅을 위한 로깅
  useEffect(() => {
    logger.log("Profile Data:", profile);
    logger.log("Annotations Data:", annotations);
    logger.log("Selected Category:", categoryName);
  }, [profile, annotations, categoryName]);

  if (isProfileLoading || (profile && isAnnotationsLoading)) return <div>Loading...</div>;

  return (
    <>
      {/* 프로필 오류 메시지 */}
      {profileError && (
        <div>
          <p>Error: {profileError.message}</p>
          {/* 래퍼 함수를 사용하여 TypeScript 오류 해결 */}
          <Button onClick={() => refetchProfile()}>재시도</Button>
        </div>
      )}

      {/* 프로필이 없을 때 프로필 폼 표시 */}
      {!profile && !isProfileLoading && <ProfileForm userId={currentUserId} onSuccess={handleProfileSuccess} />}

      {/* 어노테이션 오류 메시지 */}
      {annotationsError && (
        <div>
          <p>Error: {annotationsError.message}</p>
          <Button onClick={() => refetchAnnotations()}>재시도</Button>
        </div>
      )}

      {/* 프로필은 있지만 어노테이션 데이터가 없을 때 이미지 업로드 UI 표시 */}
      {profile &&
        (annotations === null || annotations === undefined || annotations.length === 0) &&
        !isAnnotationsLoading && (
          <div>
            <h2>제품 데이터가 없습니다. 이미지를 업로드하여 제품을 생성하세요.</h2>
            <ImageUpload userId={currentUserId} onUploadSuccess={handleImageUploadSuccess} />
          </div>
        )}

      {/* 프로필과 어노테이션 데이터가 있을 때 UI 표시 */}
      {profile && annotations && annotations.length > 0 && (
        <>
          <AnnotationSidebar isUseGuide={isUseGuide} setIsUseGuide={setIsUseGuide} profile={profile} />
          <div className="w-[calc(100%-19.5rem)] content-container">
            <AnnotationContent annotations={annotations} />
            {/* <SelectBox options={categories} selectedOption={categoryName} onSelect={setCategoryName} /> */}
          </div>
        </>
      )}
    </>
  );
}
