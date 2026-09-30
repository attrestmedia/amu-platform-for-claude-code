"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Link2 } from "lucide-react";
import { Button, Label, Preloader, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  approveMyPersonalCharacterJoin,
  getMyPersonalCharacterJoinContext,
  proposeMyPersonalCharacterJoin,
  type PersonalCharacterJoinContext,
  type PersonalCharacterJoinProposalResult,
} from "libs/api/game";
import { PERSONAL_CANON_RELATION_TYPE_VALUES, PERSONAL_CHARACTER_JOIN_REASON_LIMIT } from "types/game";
import type { CanonReferenceEntityType } from "types/game";
import { toErrorMessage } from "utils/common";

type Props = {
  characterId: string;
  universeId: string;
};

const TARGET_LABELS: Record<CanonReferenceEntityType, { ko: string; en: string }> = {
  character: { ko: "캐릭터", en: "Character" },
  event: { ko: "사건", en: "Event" },
  region: { ko: "장소", en: "Region" },
  faction: { ko: "세력", en: "Faction" },
  mystery: { ko: "미스터리", en: "Mystery" },
  object: { ko: "물건", en: "Object" },
};

const RELATION_LABELS: Record<(typeof PERSONAL_CANON_RELATION_TYPE_VALUES)[number], { ko: string; en: string }> = {
  ally: { ko: "동료", en: "Ally" },
  friend: { ko: "친구", en: "Friend" },
  rival: { ko: "라이벌", en: "Rival" },
  mentor: { ko: "멘토", en: "Mentor" },
  family: { ko: "가족", en: "Family" },
  guardian: { ko: "수호자", en: "Guardian" },
  acquaintance: { ko: "아는 사이", en: "Acquaintance" },
};

/**
 * @docHint
 * @purpose 두 번째 이후 캐릭터를 기존 Personal Canon에 연결하는 owner 저작 화면
 * @process 기존 Canon 요약  연결 대상 선택  사유 편집  proposal 검증  owner 승인
 * @domain game.personal-universe
 * @scope user-client
 */
export function PersonalCharacterJoinEditor({ characterId, universeId }: Props) {
  const [context, setContext] = useState<PersonalCharacterJoinContext | null>(null);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [relationType, setRelationType] = useState<(typeof PERSONAL_CANON_RELATION_TYPE_VALUES)[number]>("ally");
  const [reason, setReason] = useState("");
  const [proposal, setProposal] = useState<PersonalCharacterJoinProposalResult["proposal"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getMyPersonalCharacterJoinContext(characterId)
      .then((result) => {
        setContext(result);
        if (result.mode === "already-joined") window.location.href = `/assets-studio/direction-sheet?characterId=${encodeURIComponent(characterId)}`;
      })
      .catch((caught) => setError(toErrorMessage(caught, "기존 세계를 불러오지 못했습니다.")))
      .finally(() => setLoading(false));
  }, [characterId]);

  const target = useMemo(
    () => context?.targets.find((item) => `${item.targetRefType}:${item.targetRefId}` === selectedTarget) || null,
    [context?.targets, selectedTarget],
  );

  const approve = async () => {
    if (!target || !context || !reason.trim()) {
      setError("연결 대상과 연결 사유를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const proposed = await proposeMyPersonalCharacterJoin({
        characterId,
        targetRefType: target.targetRefType,
        targetRefId: target.targetRefId,
        relationType,
        reason: reason.trim(),
      });
      setProposal(proposed.proposal);
      await approveMyPersonalCharacterJoin({
        characterId,
        proposalId: proposed.proposal.proposalId,
        targetRefType: target.targetRefType,
        targetRefId: target.targetRefId,
        relationType,
        reason: reason.trim(),
      });
      window.location.href = `/assets-studio/direction-sheet?characterId=${encodeURIComponent(characterId)}`;
    } catch (caught) {
      setError(toErrorMessage(caught, "세계 합류 검증에 실패했습니다. 다른 연결을 선택해 주세요."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Preloader variant="spin" size="lg" text={<Lang text={{ ko: "내 세계의 연결 대상을 불러오는 중...", en: "Loading your world's connections..." }} />} /></div>;
  }

  if (!context || context.mode !== "join") {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
        <div role="alert" className="w-full rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error || <Lang text={{ ko: "합류 단계를 준비할 수 없습니다.", en: "The join step is unavailable." }} />}</div>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => { window.location.href = `/assets-studio/direction-sheet?characterId=${encodeURIComponent(characterId)}`; }}><Lang text={{ ko: "기존 단계로 이동", en: "Continue to the existing step" }} /></Button>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-10" data-ruleset-universe={universeId}>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><Link2 className="size-4" aria-hidden /><span><Lang text={{ ko: "STEP 2 · JOIN YOUR WORLD", en: "STEP 2 · JOIN YOUR WORLD" }} /></span></p>
          <h1 className="text-2xl font-bold sm:text-3xl"><Lang text={{ ko: `${context.character.name}을(를) 어디에 연결할까요?`, en: `Where should ${context.character.name} connect?` }} /></h1>
          <p className="max-w-2xl text-sm leading-6 text-secondary-text sm:text-base"><Lang text={{ ko: "세계는 이미 자동으로 선택되어 있습니다. 기존 Canon에서 한 가지 이상 연결 대상을 고르고, 이 인물이 왜 연결되는지 직접 확정해 주세요.", en: "Your world is already selected. Choose at least one existing Canon target and explain why this character connects to it." }} /></p>
        </header>

        {error ? <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
        {context.targets.length === 0 ? (
          <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"><Lang text={{ ko: "연결할 수 있는 기존 Canon이 아직 없습니다. 첫 캐릭터의 World Seed를 먼저 확정해 주세요.", en: "There are no existing Canon targets yet. Confirm the first character's World Seed first." }} /></div>
        ) : null}

        <form className="space-y-5 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6" onSubmit={(event) => { event.preventDefault(); void approve(); }}>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold"><Lang text={{ ko: "연결 대상 (하나 이상)", en: "Connection target (at least one)" }} /></legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {context.targets.map((item) => {
                const key = `${item.targetRefType}:${item.targetRefId}`;
                const selected = selectedTarget === key;
                return (
                  <button key={key} type="button" aria-pressed={selected} onClick={() => { setSelectedTarget(key); setProposal(null); setError(""); }} className={`min-h-20 rounded-xl border p-4 text-left motion-reduce:transition-none ${selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-background hover:border-primary/60"}`}>
                    <span className="block text-xs font-semibold text-primary"><Lang text={TARGET_LABELS[item.targetRefType]} /></span>
                    <span className="mt-1 block text-sm font-semibold">{item.title}</span>
                    {item.summary ? <span className="mt-1 block text-xs leading-5 text-secondary-text">{item.summary}</span> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2"><Label htmlFor="join-relation-type"><Lang text={{ ko: "관계 유형", en: "Relation type" }} /></Label><select id="join-relation-type" value={relationType} onChange={(event) => { setRelationType(event.target.value as typeof relationType); setProposal(null); }} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="ally">{lang(RELATION_LABELS.ally)}</option>{PERSONAL_CANON_RELATION_TYPE_VALUES.filter((item) => item !== "ally").map((item) => <option key={item} value={item}>{lang(RELATION_LABELS[item])}</option>)}</select></div>

          <div className="space-y-2"><Label htmlFor="join-preview"><Lang text={{ ko: "확정 전 메모", en: "Confirmation note" }} /></Label><Textarea id="join-preview" rows={3} value={reason} maxLength={PERSONAL_CHARACTER_JOIN_REASON_LIMIT} onChange={(event) => { setReason(event.target.value); setProposal(null); }} aria-describedby="join-preview-help" /><p id="join-preview-help" className="text-xs text-secondary-text"><Lang text={{ ko: "이 문장은 Personal Canon의 관계 사유로 저장됩니다.", en: "This sentence is saved as the reason in your Personal Canon." }} /></p></div>

          {proposal ? <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm"><Lang text={{ ko: "연결 proposal을 만들었습니다. 승인 시 새 캐릭터와 관계 정의가 Personal Canon에 순서대로 확정됩니다.", en: "The connection proposal is ready. Approval will publish the character and relation definition to your Personal Canon in order." }} /></div> : null}
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { window.location.href = `/assets-studio/direction-sheet?characterId=${encodeURIComponent(characterId)}`; }}><ArrowRight className="mr-2 size-4" aria-hidden /><Lang text={{ ko: "나중에 연결하기", en: "Connect later" }} /></Button><Button type="submit" className="min-h-11" loading={busy} disabled={busy || !target || !reason.trim()}><ArrowRight className="mr-2 size-4" aria-hidden /><Lang text={{ ko: "검증하고 세계에 합류", en: "Validate and join world" }} /></Button></div>
        </form>
      </div>
    </main>
  );
}
