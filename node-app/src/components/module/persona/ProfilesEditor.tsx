"use client";

import React, { useMemo, useState } from "react";
import type { IPersonaProfileMap } from "types/ai";
import { Button, Input } from "@amu-labs/ui";
import { FileUpload } from "components/module/upload";

interface ProfilesEditorProps {
  universeId: string;
  pid?: string;
  value: IPersonaProfileMap;
  onChange: (next: IPersonaProfileMap) => void;
}

export function ProfilesEditor({ universeId, pid, value, onChange }: ProfilesEditorProps) {
  // value가 객체가 아닐 때 안전한 기본값으로 폴백 — useMemo로 매 렌더 새 객체 생성 방지
  const profiles = useMemo<IPersonaProfileMap>(
    () => (value && typeof value === "object" ? value : { default: [] }),
    [value],
  );

  // rename 입력 중 포커스 유지용 draft
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});

  const orderedEntries = useMemo(() => {
    const entries = Object.entries(profiles || {});
    // default 먼저, 나머지는 키 정렬
    entries.sort(([a], [b]) => {
      if (a === "default") return -1;
      if (b === "default") return 1;
      return a.localeCompare(b);
    });
    return entries;
  }, [profiles]);

  const addVariant = () => {
    const base = "variant";
    let key = base;
    let i = 1;
    while (profiles[key]) key = `${base}_${i++}`;
    onChange({ ...profiles, [key]: [] });
    setDraftNames((prev) => ({ ...prev, [key]: key }));
  };

  const removeVariant = (k: string) => {
    if (k === "default") return;
    const next: IPersonaProfileMap = { default: [] };
    Object.entries(profiles).forEach(([key, frames]) => {
      if (key !== k) next[key] = frames;
    });
    onChange(next);
    setDraftNames((prev) => {
      const cp = { ...prev };
      delete cp[k];
      return cp;
    });
  };

  const commitRenameVariant = (oldKey: string) => {
    if (oldKey === "default") return;

    const proposed = (draftNames[oldKey] ?? oldKey).trim();
    if (!proposed || proposed === oldKey) return;
    if (profiles[proposed]) {
      // 충돌이면 draft만 되돌려서 "왜 안 되는지" 체감되게
      setDraftNames((prev) => ({ ...prev, [oldKey]: oldKey }));
      return;
    }

    const next: IPersonaProfileMap = { default: [] };
    Object.entries(profiles).forEach(([k, frames]) => {
      if (k === oldKey) next[proposed] = frames;
      else next[k] = frames;
    });

    onChange(next);

    setDraftNames((prev) => {
      const cp = { ...prev };
      delete cp[oldKey];
      cp[proposed] = proposed;
      return cp;
    });
  };

  const updateVariantFrames = (variant: string, urls: string[]) => {
    const cleaned = (urls || []).filter((u) => typeof u === "string" && u.trim().length > 0);
    onChange({ ...profiles, [variant]: cleaned });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600">Profiles (프로필 이미지)</p>
        <Button variant="outline" size="sm" onClick={addVariant}>
          + 변형 추가
        </Button>
      </div>

      {orderedEntries.map(([variant, frames]) => {
        const draft = draftNames[variant] ?? variant;

        return (
          <div key={variant} className="rounded border p-3 space-y-2 bg-white">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 text-xs w-44"
                  value={draft}
                  onChange={(e) => setDraftNames((prev) => ({ ...prev, [variant]: e.target.value }))}
                  onBlur={() => commitRenameVariant(variant)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  disabled={variant === "default"}
                />
                {variant === "default" && <span className="text-xxs text-gray-500">(기본)</span>}
              </div>

              {variant !== "default" && (
                <Button size="sm" onClick={() => removeVariant(variant)}>
                  변형 삭제
                </Button>
              )}
            </div>

            <FileUpload
              universeId={universeId}
              pid={pid}
              kind="persona-profile"
              value={frames || []}
              onChange={(urls: string[]) => updateVariantFrames(variant, urls)}
              multiple
              ui="dropzone"
              deleteRemote
            />
          </div>
        );
      })}
    </div>
  );
}
