"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Preloader, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { fetchUniverseOwners, saveUniverseOwners } from "libs/api/admin/universeOwners";
import type { CharacterUniverseOwnerEntry } from "types/game/characterUniverse";
import { extractApiErrorMessage, toUnknownRecord } from "utils/common";

const ownerQueryKey = (universeId: string) => ["admin-universe-owners", universeId] as const;

function emailLinesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function comparableEmails(emails: string[]): string {
  return emails.map((email) => email.trim().toLocaleLowerCase()).sort().join("\n");
}

function getOwnerSaveErrorMessage(error: unknown): string {
  const errorRecord = toUnknownRecord(error);
  const response = toUnknownRecord(errorRecord.response);
  const body = toUnknownRecord(response.data);

  if (body.errorCode === "UNIVERSE_OWNER_EMAIL_UNRESOLVED") {
    return lang({
      ko: "일부 이메일에 연결된 계정을 찾지 못했습니다. 주소를 확인한 뒤 다시 저장하세요.",
      en: "Some email addresses could not be matched to accounts. Check the addresses and try again.",
    });
  }

  return extractApiErrorMessage(
    error,
    lang({ ko: "owner 목록을 저장하지 못했습니다.", en: "Could not save the owner list." }),
  );
}

export function UniverseGameOwnersPanel({ universeId }: { universeId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ownerQueryKey(universeId);
  const [editedEmails, setEditedEmails] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const ownersQuery = useQuery({
    queryKey,
    queryFn: () => fetchUniverseOwners(universeId),
    enabled: Boolean(universeId),
    retry: false,
    staleTime: 30_000,
  });

  const owners: CharacterUniverseOwnerEntry[] = ownersQuery.data ?? [];
  const savedEmails = owners.flatMap((owner) => (owner.email ? [owner.email] : []));
  const emailText = editedEmails ?? savedEmails.join("\n");
  const nextEmails = emailLinesToList(emailText);
  const hasChanges = comparableEmails(nextEmails) !== comparableEmails(savedEmails);
  const hasOwnersWithoutEmail = owners.some((owner) => !owner.email);

  const saveMutation = useMutation({
    mutationFn: async (ownerEmails: string[]) => {
      await saveUniverseOwners(universeId, ownerEmails);
      return ownerEmails;
    },
    onSuccess: async (ownerEmails) => {
      setEditedEmails(ownerEmails.join("\n"));
      setFeedback({
        kind: "success",
        message: lang({ ko: "owner 목록을 저장했습니다.", en: "Owner list saved." }),
      });
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: unknown) => {
      setFeedback({ kind: "error", message: getOwnerSaveErrorMessage(error) });
    },
  });

  const handleSave = () => {
    setFeedback(null);
    saveMutation.mutate(nextEmails);
  };

  const id = useId();
  const emailsInputId = `${id}-owner-emails`;
  const emailsHelpId = `${id}-owner-emails-help`;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-4 text-primary-text md:p-5">
      <div>
        <h2 className="font-semibold">
          <Lang text={{ ko: "게임 Universe owner", en: "Game Universe owners" }} />
        </h2>
        <p className="mt-1 text-sm leading-6 text-secondary-text">
          <Lang
            text={{
              ko: "owner는 이 게임 Universe의 캐릭터 생성 권한을 가집니다. 저장하면 아래 이메일 목록으로 owner가 교체됩니다.",
              en: "Owners can create characters in this game Universe. Saving replaces the owner list with the emails below.",
            }}
          />
        </p>
      </div>

      {ownersQuery.isLoading ? (
        <div className="flex min-h-11 items-center gap-2 text-sm text-secondary-text" role="status" aria-live="polite">
          <Preloader variant="spin" size="sm" container />
          <Lang text={{ ko: "owner 목록을 불러오는 중입니다.", en: "Loading owners." }} />
        </div>
      ) : null}

      {ownersQuery.isError ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="text-sm leading-6 text-secondary-text">
            <Lang text={{ ko: "owner 목록을 불러오지 못했습니다.", en: "Could not load owners." }} />
          </p>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            loading={ownersQuery.isFetching}
            disabled={ownersQuery.isFetching}
            onClick={() => void ownersQuery.refetch()}
          >
            <Lang text={{ ko: "다시 시도", en: "Retry" }} />
          </Button>
        </div>
      ) : null}

      {ownersQuery.isSuccess ? (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              <Lang text={{ ko: "현재 owner", en: "Current owners" }} />
            </h3>
            {owners.length > 0 ? (
              <ul className="space-y-2" aria-label={lang({ ko: "현재 owner 목록", en: "Current owner list" })}>
                {owners.map((owner) => (
                  <li key={owner.uid} className="break-all rounded-md border border-border bg-background px-3 py-2 text-sm">
                    {owner.email || owner.uid}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-secondary-text">
                <Lang text={{ ko: "현재 배정된 owner가 없습니다.", en: "There are no assigned owners." }} />
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor={emailsInputId} className="block text-sm font-medium">
              <Lang text={{ ko: "owner 이메일 목록", en: "Owner email list" }} />
            </label>
            <Textarea
              id={emailsInputId}
              aria-describedby={emailsHelpId}
              rows={5}
              value={emailText}
              onChange={(event) => {
                setEditedEmails(event.target.value);
                setFeedback(null);
              }}
              placeholder={lang({ ko: "한 줄에 이메일 하나씩 입력", en: "Enter one email address per line" })}
              disabled={saveMutation.isPending}
            />
            <p id={emailsHelpId} className="text-sm leading-6 text-secondary-text">
              <Lang text={{ ko: "저장할 이메일을 한 줄에 하나씩 입력하세요.", en: "Enter one email address per line." }} />
            </p>
          </div>

          {hasOwnersWithoutEmail && hasChanges ? (
            <p className="rounded-md border border-border px-3 py-2 text-sm leading-6 text-secondary-text" role="alert">
              <Lang
                text={{
                  ko: "이메일을 확인할 수 없는 기존 owner는 새 목록을 저장하면 제외됩니다.",
                  en: "Existing owners without a readable email will be removed when you save the new list.",
                }}
              />
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              className="min-h-11"
              loading={saveMutation.isPending}
              disabled={!hasChanges || saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending ? (
                <Lang text={{ ko: "저장 중…", en: "Saving…" }} />
              ) : (
                <Lang text={{ ko: "owner 목록 저장", en: "Save owner list" }} />
              )}
            </Button>
            {feedback ? (
              <p
                className={
                  feedback.kind === "error"
                    ? "text-sm leading-6 text-destructive"
                    : "text-sm leading-6 text-secondary-text"
                }
                role={feedback.kind === "error" ? "alert" : "status"}
                aria-live={feedback.kind === "error" ? "assertive" : "polite"}
              >
                {feedback.message}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
