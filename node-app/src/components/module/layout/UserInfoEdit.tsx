"use client";
import React, { useCallback, useRef, useState, useMemo } from "react";
import { Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@amu-labs/ui";
import { AvatarThumbnail } from "components/module/image";
import { FileUpload } from "components/module/upload";
import FixedAspectImageCropDialog from "components/module/image/FixedAspectImageCropDialog";
import { useUserData } from "hooks/auth";
import { useLangChange } from "hooks/i18n";
import { toast } from "sonner";
import { Lang, lang } from "components/module/i18n";
import type { IUserInfo } from "types/user";
import { logger } from "utils/log";
import { toDisplayLang } from "utils/language";
import { useGlobalStore } from "store/global";
import type { LanguageType } from "types/language";
import { Edit2, User } from "lucide-react";
import { cn } from "utils/common";
import { fileToDataUrl } from "utils/app/imageFile";

interface UserInfoEditProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  isOnboarding?: boolean; // 온보딩 모드 (처음 가입 시)
  forceEditMode?: boolean; // 강제 편집 모드
}

type PendingProfileImageCrop = {
  sourceName: string;
  resolve: (file: File | null) => void;
};

function UserInfoEdit({
  isOpen,
  onOpenChange,
  onComplete,
  isOnboarding = false,
  forceEditMode = false,
}: UserInfoEditProps) {
  const currentLanguage = useGlobalStore((state) => state.language);
  const { updateUserInfo, userData } = useUserData();
  const { changeLanguage } = useLangChange();
  const profileImageCropRef = useRef<PendingProfileImageCrop | null>(null);

  // 편집 모드 상태 (온보딩일 때는 항상 편집 모드)
  const [isEditMode, setIsEditMode] = useState(isOnboarding);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profileImageCropOpen, setProfileImageCropOpen] = useState(false);
  const [profileImageCropSource, setProfileImageCropSource] = useState("");
  const [formData, setFormData] = useState<IUserInfo>({
    name: "",
    age: 0,
    birthdate: "",
    gender: "none",
    interests: "",
    language: currentLanguage,
    profileImageUrl: "",
  });

  // 오늘 날짜(yyyy-mm-dd) – 미래 생일 입력 방지용
  const todayStr = useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  // 다이얼로그 열릴 때 기존 정보 로드 및 모드 초기화 — adjusting state during render 패턴
  const userInfo = userData?.userInfo;
  const [trackedOpenInfo, setTrackedOpenInfo] = useState<{ open: boolean; info: typeof userInfo }>({
    open: isOpen,
    info: userInfo,
  });
  if (trackedOpenInfo.open !== isOpen || trackedOpenInfo.info !== userInfo) {
    setTrackedOpenInfo({ open: isOpen, info: userInfo });
    if (isOpen) {
      setFormData({
        name: userInfo?.name || "",
        age: userInfo?.age ?? 0,
        birthdate: userInfo?.birthdate || "",
        gender: (userInfo?.gender as "man" | "woman" | "none") || "none",
        interests: userInfo?.interests || "",
        language: (userInfo?.language as LanguageType) || currentLanguage,
        profileImageUrl: userInfo?.profileImageUrl || "",
      });
      setIsEditMode(isOnboarding || forceEditMode);
    }
  }

  // 공통 변경 핸들러
  const handleChange = (field: keyof IUserInfo, value: string | number | boolean | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value as IUserInfo[typeof field] }));
  };

  const handleProfileImageCropOpenChange = useCallback((open: boolean) => {
    setProfileImageCropOpen(open);
    if (open) return;

    const pending = profileImageCropRef.current;
    profileImageCropRef.current = null;
    pending?.resolve(null);
    setProfileImageCropSource("");
  }, []);

  const prepareProfileImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(lang({ ko: "이미지 파일만 업로드할 수 있어요.", en: "Only image files can be uploaded." }));
      return null;
    }

    try {
      const preview = await fileToDataUrl(file);
      setProfileImageCropSource(preview);
      setProfileImageCropOpen(true);

      return await new Promise<File | null>((resolve) => {
        profileImageCropRef.current = {
          sourceName: file.name || "profile-image.png",
          resolve,
        };
      });
    } catch (error) {
      logger.error("프로필 이미지 편집 준비 실패:", error);
      toast.error(lang({ ko: "이미지를 편집기로 불러오지 못했습니다.", en: "Failed to open the image editor." }));
      return null;
    }
  }, []);

  const handleProfileImageCropConfirm = useCallback((result: { blob: Blob }) => {
    const pending = profileImageCropRef.current;
    profileImageCropRef.current = null;
    const baseName = pending?.sourceName.replace(/\.[^.]+$/, "") || "profile-image";
    const file = new File([result.blob], `${baseName}-square.png`, { type: result.blob.type || "image/png" });

    pending?.resolve(file);
    setProfileImageCropOpen(false);
    setProfileImageCropSource("");
  }, []);

  // 생년월일 → 나이 자동 계산(+ 미래 날짜 방지)
  const handleBirthdateChange = (birthdate: string) => {
    if (!birthdate) {
      setFormData((prev) => ({ ...prev, birthdate: "", age: 0 }));
      return;
    }

    try {
      const birth = new Date(birthdate);
      const today = new Date();

      // 미래 날짜면 무시
      if (birth.getTime() > today.getTime()) {
        toast.error(lang({ ko: "미래 날짜는 선택할 수 없어요.", en: "You can't pick a future date." }));
        return;
      }

      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      if (age < 0) age = 0;

      handleChange("birthdate", birthdate);
      handleChange("age", age);
    } catch {
      handleChange("birthdate", "");
      handleChange("age", 0);
    }
  };

  // 언어 변경(즉시 UI 반영 + 폼에도 저장)
  const handleLanguageChange = (newLanguage: LanguageType) => {
    changeLanguage(newLanguage);
    setFormData((prev) => ({ ...prev, language: newLanguage }));
  };

  // 폼 유효성: 이름/생년월일은 필수 + 생일은 오늘 이하여야 함
  const isFormValid = useMemo(() => {
    const nameOk = (formData.name || "").trim().length > 0;
    const bd = formData.birthdate || "";
    const bdOk = !!bd && new Date(bd).getTime() <= new Date(todayStr).getTime();
    return nameOk && bdOk;
  }, [formData.name, formData.birthdate, todayStr]);

  // 저장
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      await updateUserInfo({
        name: formData.name?.trim(),
        age: formData.age,
        birthdate: formData.birthdate,
        gender: formData.gender,
        interests: formData.interests,
        language: formData.language as LanguageType | undefined,
        profileImageUrl: formData.profileImageUrl || "",
      });

      // 저장이 끝났다면 현재 언어 상태도 일치시키기
      if (formData.language === "ko" || formData.language === "en") {
        changeLanguage(formData.language);
      }

      toast.success(
        isOnboarding
          ? lang({ ko: "환영합니다! 정보가 저장되었습니다.", en: "Welcome! Your information has been saved." })
          : lang({ ko: "정보가 성공적으로 수정되었습니다.", en: "Information updated successfully." }),
      );

      onOpenChange(false);
      onComplete?.();
    } catch (error) {
      logger.error("정보 저장 실패:", error);
      toast.error(lang({ ko: "저장에 실패했습니다. 다시 시도해 주세요.", en: "Failed to save. Please try again." }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 성별 텍스트 변환
  const getGenderText = (gender: string) => {
    switch (gender) {
      case "woman":
        return <Lang text={{ ko: "여자", en: "Woman" }} />;
      case "man":
        return <Lang text={{ ko: "남자", en: "Man" }} />;
      default:
        return <Lang text={{ ko: "선택안함", en: "Prefer not to say" }} />;
    }
  };

  // 언어 텍스트 변환
  const getLanguageText = (language: string) => toDisplayLang(language === "ko" ? "ko" : "en");

  return (
    <Dialog open={isOpen} onOpenChange={isOnboarding ? undefined : onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-md w-[calc(100%-2rem)] overflow-y-auto"
        disableOutsideClick={isOnboarding}
        hideClose={isOnboarding}
      >
        <DialogHeader>
          <DialogTitle>
            {isOnboarding ? (
              <Lang text={{ ko: "프로필 설정", en: "Profile Setup" }} />
            ) : (
              <Lang text={{ ko: "내 정보", en: "My Information" }} />
            )}
          </DialogTitle>
          <DialogDescription>
            {isOnboarding ? (
              <Lang text={{ ko: "아래의 필수 정보를 입력해주세요.", en: "Please enter the required information." }} />
            ) : isEditMode ? (
              <Lang text={{ ko: "정보를 수정하고 저장하세요.", en: "Update and save your information." }} />
            ) : (
              <Lang text={{ ko: "회원님의 정보입니다.", en: "Your profile information." }} />
            )}
          </DialogDescription>
        </DialogHeader>

        {/* 뷰 모드 */}
        {!isEditMode && (
          <div className="space-y-6 mt-4">
            <div className="space-y-2">
              <Label>
                <Lang text={{ ko: "프로필 이미지", en: "Profile Image" }} />
              </Label>
              {formData.profileImageUrl ? (
                <AvatarThumbnail
                  src={formData.profileImageUrl}
                  alt={formData.name || ""}
                  size="lg"
                  className="border-border"
                  imgClassName="scale-100 origin-center"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-6 w-6" />
                </div>
              )}
            </div>

            {/* 이름 */}
            <div className="space-y-1">
              <Label>
                <Lang text={{ ko: "이름", en: "Name" }} />
              </Label>
              <p className="text-base font-medium">{formData.name || "-"}</p>
            </div>

            {/* 생년월일 & 나이 */}
            <div className="space-y-1">
              <Label>
                <Lang text={{ ko: "생년월일", en: "Date of Birth" }} />
              </Label>
              <p className="text-base font-medium">
                {formData.birthdate || "-"}
                {formData.birthdate && formData.age && formData.age > 0 && (
                  <span className="text-sm text-gray-500 ml-2">
                    ({formData.age}
                    <Lang text={{ ko: "세", en: " years old" }} />)
                  </span>
                )}
              </p>
            </div>

            {/* 성별 */}
            <div className="space-y-1">
              <Label>
                <Lang text={{ ko: "성별", en: "Gender" }} />
              </Label>
              <p className="text-base font-medium">{getGenderText(formData.gender || "none")}</p>
            </div>

            {/* 관심사 */}
            <div className="space-y-1">
              <Label>
                <Lang text={{ ko: "관심사", en: "Interests" }} />
              </Label>
              <p className="text-base font-medium">{formData.interests || "-"}</p>
            </div>

            {/* 사용 언어 */}
            <div className="space-y-1">
              <Label>
                <Lang text={{ ko: "사용 언어", en: "User Language" }} />
              </Label>
              <p className="text-base font-medium">{getLanguageText(formData.language || "ko")}</p>
            </div>

            {/* 버튼 그룹 */}
            <div className="flex gap-2 pt-4">
              <Button onClick={() => setIsEditMode(true)}>
                <Edit2 className="h-4 w-4" />
                <Lang text={{ ko: "편집", en: "Edit" }} />
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <Lang text={{ ko: "닫기", en: "Close" }} />
              </Button>
            </div>
          </div>
        )}

        {/* 편집 모드 */}
        {isEditMode && (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>
                <Lang text={{ ko: "프로필 이미지", en: "Profile Image" }} />
              </Label>
              <div className="flex flex-col items-center gap-3 pb-8">
                {formData.profileImageUrl ? (
                  <AvatarThumbnail
                    src={formData.profileImageUrl}
                    alt={formData.name || ""}
                    size="xl"
                    className="border-border"
                    imgClassName="scale-100 origin-center"
                  />
                ) : (
                  <div className="flex icon-xl items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="icon-md" />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <FileUpload
                    ui="button"
                    kind="profile"
                    pid="avatar"
                    multiple={false}
                    accept="image/png,image/jpeg,image/webp"
                    value={formData.profileImageUrl ? [formData.profileImageUrl] : []}
                    onChange={(urls) => handleChange("profileImageUrl", urls[0] || "")}
                    buttonLabel={lang({ ko: "이미지 선택/편집", en: "Choose / Edit Image" })}
                    uploadingLabel={lang({ ko: "업로드 중...", en: "Uploading..." })}
                    transformFileBeforeUpload={prepareProfileImageUpload}
                  />
                  {formData.profileImageUrl && (
                    <Button variant="outline" size="sm" onClick={() => handleChange("profileImageUrl", "")}>
                      <Lang text={{ ko: "이미지 제거", en: "Remove Image" }} />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* 이름 */}
            <div className="space-y-2">
              <Label required label={<Lang text={{ ko: "이름", en: "Name" }} />}>
                <Input
                  id="name"
                  type="text"
                  value={formData.name || ""}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder={lang({ ko: "이름 또는 별명을 입력해주세요", en: "Enter your name or nickname" })}
                  required
                />
              </Label>
            </div>

            {/* 생년월일 */}
            <div className="space-y-2">
              <Label required label={<Lang text={{ ko: "생년월일", en: "Date of Birth" }} />}>
                <Input
                  id="birthdate"
                  type="date"
                  value={formData.birthdate || ""}
                  onChange={(e) => handleBirthdateChange(e.target.value)}
                  max={todayStr}
                  required
                />
              </Label>
              {formData.birthdate && formData.age && formData.age > 0 && (
                <p className="text-sm text-gray-500">
                  <Lang text={{ ko: "나이", en: "Age" }} />: {formData.age}
                  <Lang text={{ ko: "세", en: " years old" }} />
                </p>
              )}
            </div>

            {/* 성별 */}
            <div className="space-y-2">
              <Label>
                <Lang text={{ ko: "성별", en: "Gender" }} />
              </Label>
              <div className="flex gap-2" role="group" aria-label="Gender">
                <Button
                  onClick={() => handleChange("gender", "woman")}
                  aria-pressed={formData.gender === "woman"}
                  className={cn(
                    "flex-1 h-8 px-3 rounded-full text-xs font-medium transition-all",
                    formData.gender === "woman"
                      ? "bg-secondary text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  <Lang text={{ ko: "여자", en: "Woman" }} />
                </Button>
                <Button
                  onClick={() => handleChange("gender", "man")}
                  aria-pressed={formData.gender === "man"}
                  className={cn(
                    "flex-1 h-8 px-3 rounded-full text-xs font-medium transition-all",
                    formData.gender === "man"
                      ? "bg-secondary text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  <Lang text={{ ko: "남자", en: "Man" }} />
                </Button>
                <Button
                  onClick={() => handleChange("gender", "none")}
                  aria-pressed={formData.gender === "none"}
                  className={cn(
                    "flex-1 h-8 px-3 rounded-full text-xs font-medium transition-all",
                    formData.gender === "none"
                      ? "bg-secondary text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  <Lang text={{ ko: "선택안함", en: "Not to say" }} />
                </Button>
              </div>
            </div>

            {/* 관심사 */}
            <div className="space-y-2">
              <Label required label={<Lang text={{ ko: "관심사", en: "Interests" }} />}>
                <Input
                  id="interests"
                  type="text"
                  value={formData.interests || ""}
                  onChange={(e) => handleChange("interests", e.target.value)}
                  placeholder={lang({ ko: "관심사를 입력해주세요", en: "Enter your interests" })}
                />
              </Label>
            </div>

            {/* 언어 선택 */}
            <div className="space-y-2">
              <Label>
                <Lang text={{ ko: "사용 언어", en: "User Language" }} />
              </Label>
              <div className="flex gap-2" role="group" aria-label="Language">
                <Button
                  onClick={() => handleLanguageChange("ko")}
                  aria-pressed={formData.language === "ko"}
                  className={cn(
                    "flex-1 h-8 px-3 rounded-full text-xs font-medium transition-all",
                    formData.language === "ko"
                      ? "bg-secondary text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  한국어
                </Button>
                <Button
                  onClick={() => handleLanguageChange("en")}
                  aria-pressed={formData.language === "en"}
                  className={cn(
                    "flex-1 h-8 px-3 rounded-full text-xs font-medium transition-all",
                    formData.language === "en"
                      ? "bg-secondary text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  English
                </Button>
              </div>
            </div>

            {/* 버튼 그룹 */}
            <div className="flex gap-2 pt-4">
              {!isOnboarding && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    // 편집 취소 시 뷰 모드로 전환
                    setIsEditMode(false);
                    // 원래 데이터로 복원
                    const u = userData?.userInfo;
                    setFormData({
                      name: u?.name || "",
                      age: u?.age ?? 0,
                      birthdate: u?.birthdate || "",
                      gender: (u?.gender as "man" | "woman" | "none") || "none",
                      interests: u?.interests || "",
                      language: (u?.language as LanguageType) || currentLanguage,
                      profileImageUrl: u?.profileImageUrl || "",
                    });
                  }}
                >
                  <Lang text={{ ko: "취소", en: "Cancel" }} />
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={isSubmitting || !isFormValid}>
                {isSubmitting ? (
                  <Lang text={{ ko: "저장 중...", en: "Saving..." }} />
                ) : (
                  <Lang text={{ ko: "저장하기", en: "Save" }} />
                )}
              </Button>
            </div>
          </form>
        )}
        <FixedAspectImageCropDialog
          open={profileImageCropOpen}
          imageSrc={profileImageCropSource}
          aspectRatio={1}
          downloadBaseFileName="user-profile-square"
          onOpenChange={handleProfileImageCropOpenChange}
          onConfirm={handleProfileImageCropConfirm}
          disabled={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}

export default UserInfoEdit;
