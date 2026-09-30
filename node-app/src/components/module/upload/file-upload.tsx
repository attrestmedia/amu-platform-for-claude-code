"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@amu-labs/ui";
import fetchClient from "libs/api/fetchClient";
import { cn } from "utils/common";
import { toErrorMessage } from "utils/common/typeUtils";

type UploadResult = { url: string; filename: string };
type UploadResponseType = { success?: boolean; error?: string; data?: UploadResult };
type DeleteResponseType = { success?: boolean; error?: string };

async function uploadOne(params: { endpoint: string; file: File; kind?: string; pid?: string }): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", params.file);
  if (params.kind) fd.append("kind", params.kind);
  if (params.pid) fd.append("pid", params.pid);

  const { data: json } = await fetchClient.post<UploadResponseType>(params.endpoint, fd);
  if (!json?.success || !json.data) throw new Error(json?.error || "upload_failed");
  return json.data;
}

async function deleteOne(params: { endpoint: string; url: string }) {
  const { data: json } = await fetchClient.delete<DeleteResponseType>(params.endpoint, {
    params: { url: params.url },
  });
  if (!json?.success) throw new Error(json?.error || "delete_failed");
}

export type FileUploadValue = string[]; // urls

export interface FileUploadProps {
  // 둘 중 하나만 있으면 됨
  endpoint?: string;
  universeId?: string;

  pid?: string;
  kind: string;

  value: string[];
  onChange: (next: string[]) => void;

  multiple?: boolean;
  accept?: string;
  disabled?: boolean;

  ui?: "dropzone" | "button";
  buttonLabel?: string;
  uploadingLabel?: string;
  maxFiles?: number;

  deleteRemote?: boolean; // 삭제 시 서버 파일도 제거
  transformFileBeforeUpload?: (file: File) => File | null | Promise<File | null>;
}

// 공통 파일 업로드 컴포넌트
// - ui="dropzone": 드래그앤드롭/클릭 업로드 + 목록 관리
// - ui="button": 작은 업로드 버튼 (프레임 1칸용)
export function FileUpload({
  endpoint: endpointProp,
  universeId,
  pid,
  kind,
  value,
  onChange,
  deleteRemote = false,
  multiple = true,
  accept = "image/*",
  disabled,
  ui = "dropzone",
  buttonLabel = "업로드",
  uploadingLabel = "업로드중...",
  maxFiles = 50,
  transformFileBeforeUpload,
}: FileUploadProps) {
  // pid 없을 때 draftPid를 컴포넌트 수명 동안 유지 (useState lazy 초기화로 render 중 ref 쓰기 회피)
  const [draftPid] = useState(() => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return `draft_${id}`;
  });
  const effectivePid = pid || draftPid;

  const endpoint = useMemo(() => {
    if (endpointProp) return endpointProp;
    if (universeId) return `/universe/${encodeURIComponent(universeId)}/upload`;
    return "/upload"; // universeId가 없으면 공통 업로드 API 사용
  }, [endpointProp, universeId]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>("");

  const openPicker = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const applyFiles = useCallback(
    async (files: FileList | File[]) => {
      if (disabled) return;
      setError("");

      const arr = Array.from(files || []);
      if (arr.length === 0) return;

      // maxFiles 방어
      const remain = Math.max(0, maxFiles - (value?.length || 0));
      const selected = multiple ? arr.slice(0, remain) : arr.slice(0, 1);
      const uploadFiles: File[] = [];

      try {
        for (const file of selected) {
          const nextFile = transformFileBeforeUpload ? await transformFileBeforeUpload(file) : file;
          if (nextFile) uploadFiles.push(nextFile);
        }
      } catch (e: unknown) {
        setError(toErrorMessage(e, "upload_prepare_failed"));
        return;
      }

      if (uploadFiles.length === 0) return;

      setUploading(true);
      try {
        const uploadedUrls: string[] = [];
        for (const f of uploadFiles) {
          const r = await uploadOne({ endpoint, file: f, kind, pid: effectivePid || undefined });
          uploadedUrls.push(r.url);
        }

        if (multiple) {
          onChange([...(value || []), ...uploadedUrls]);
        } else {
          // 단일 업로드 교체 시, 기존 파일 원격 삭제(옵션)
          const prev = (value || [])[0];
          const nextSingle = uploadedUrls;

          if (deleteRemote && prev && prev !== nextSingle[0]) {
            try {
              await deleteOne({ endpoint, url: prev });
            } catch (e: unknown) {
              setError(toErrorMessage(e, "delete_failed"));
            }
          }

          onChange(nextSingle);
        }
      } catch (e: unknown) {
        setError(toErrorMessage(e, "upload_failed"));
      } finally {
        setUploading(false);
      }
    },
    [disabled, endpoint, kind, deleteRemote, effectivePid, maxFiles, multiple, onChange, transformFileBeforeUpload, value],
  );

  const onPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) await applyFiles(files);
      e.target.value = "";
    },
    [applyFiles],
  );

  const removeAt = useCallback(
    async (idx: number) => {
      const targetUrl = (value || [])[idx];
      const next = (value || []).filter((_, i) => i !== idx);

      if (deleteRemote && targetUrl && endpoint) {
        try {
          await deleteOne({ endpoint, url: targetUrl });
          onChange(next); // 서버 삭제 성공 후 UI에서 제거
        } catch (e: unknown) {
          setError(toErrorMessage(e, "delete_failed"));
          return; // 실패면 UI 유지
        }
        return;
      }

      onChange(next);
    },
    [deleteRemote, endpoint, onChange, value],
  );

  // Dropzone handlers
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setDragOver(true);
    },
    [disabled],
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (disabled) return;
      const files = e.dataTransfer.files;
      if (files && files.length) {
        await applyFiles(files);
      }
    },
    [applyFiles, disabled],
  );

  // button UI: 프레임 옆에 붙는 작은 업로드 버튼
  if (ui === "button") {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={false}
          onChange={onPick}
          className="hidden"
          disabled={disabled || uploading}
        />
        <Button variant="outline" size="sm" onClick={openPicker} disabled={disabled || uploading}>
          {uploading ? uploadingLabel : buttonLabel}
        </Button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }

  // dropzone UI
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={onPick}
        className="hidden"
        disabled={disabled || uploading}
      />

      <div
        className={cn(
          "rounded-lg border border-border/70 bg-muted/20 p-3 text-primary-text transition",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          dragOver && "border-primary bg-primary/10",
        )}
        onClick={openPicker}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm">
            <div className="font-medium">드래그앤드롭 또는 클릭하여 업로드</div>
            <div className="text-xs text-muted-foreground">
              {multiple ? "여러 장 업로드 가능" : "1장만 업로드"} / 업로드 후 URL이 자동으로 적용됩니다.
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{uploading ? "업로드중..." : ""}</div>
        </div>
        {error && <div className="mt-2 text-xs text-danger">{error}</div>}
      </div>

      {value?.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {value.map((u, i) => (
            <div key={`${u}-${i}`} className="overflow-hidden rounded border border-border/70 bg-surface">
              <div className="aspect-square bg-muted/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`uploaded-${i}`} className="w-full h-full object-cover" />
              </div>
              <div className="p-2 flex items-center justify-between gap-2">
                <div className="truncate text-xxs text-muted-foreground">{u}</div>
                <Button variant="blank" className="text-xxs text-danger" onClick={() => removeAt(i)}>
                  삭제
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">업로드된 파일이 없습니다.</p>
      )}
    </div>
  );
}
