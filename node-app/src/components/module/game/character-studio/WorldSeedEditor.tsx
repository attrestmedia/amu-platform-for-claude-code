"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button, Input, Label, Preloader, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { approveMyWorldSeed, proposeMyWorldSeed, type WorldSeedProposalResult } from "libs/api/game";
import { toErrorMessage } from "utils/common";
import { WORLD_SEED_FIELD_LIMITS, WORLD_SEED_RULE_LIMIT, type WorldSeedProposal } from "types/game";

type Props = {
  characterId: string;
  universeId: string;
};

function proposalFields(proposal: WorldSeedProposal) {
  return {
    worldName: proposal.worldName,
    premise: proposal.premise,
    rules: [...proposal.rules, ...Array.from({ length: Math.max(0, WORLD_SEED_RULE_LIMIT - proposal.rules.length) }, () => "")].slice(0, WORLD_SEED_RULE_LIMIT),
    startingPlace: proposal.startingPlace,
    firstEvent: proposal.firstEvent,
  };
}

/**
 * @docHint
 * @purpose 첫 캐릭터 이후 World Seed를 검토·수정·승인하는 화면
 * @process proposal 조회  5개 seed 필드 편집  owner 승인  master sheet 이동 또는 skip
 * @domain game.personal-universe
 * @scope user-client
 */
export function WorldSeedEditor({ characterId, universeId }: Props) {
  const [proposal, setProposal] = useState<WorldSeedProposal | null>(null);
  const [fields, setFields] = useState<ReturnType<typeof proposalFields> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProposal() {
      setLoading(true);
      setError("");
      try {
        const result: WorldSeedProposalResult = await proposeMyWorldSeed({ characterId });
        setProposal(result.proposal);
        setFields(proposalFields(result.proposal));
      } catch (caught) {
        setError(toErrorMessage(caught, "세계 제안을 불러오지 못했습니다."));
      } finally {
        setLoading(false);
      }
    }
    void loadProposal();
  }, [characterId]);

  const updateField = (key: keyof Omit<NonNullable<typeof fields>, "rules">, value: string) => {
    setFields((current) => current ? { ...current, [key]: value } : current);
  };

  const approve = async () => {
    if (!proposal || !fields) return;
    setBusy(true);
    setError("");
    try {
      await approveMyWorldSeed({ characterId, proposalId: proposal.proposalId, ...fields });
      window.location.href = `/assets-studio/direction-sheet?characterId=${encodeURIComponent(characterId)}`;
    } catch (caught) {
      setError(toErrorMessage(caught, "세계 저장에 실패했습니다. 입력을 확인하고 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Preloader variant="spin" size="lg" text={<Lang text={{ ko: "나만의 세계 제안을 준비하는 중...", en: "Preparing your world proposal..." }} />} />
      </div>
    );
  }

  if (!proposal || !fields) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
        <div role="alert" className="w-full rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error || <Lang text={{ ko: "세계 제안을 준비할 수 없습니다.", en: "The world proposal is unavailable." }} />}</div>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => { window.location.href = `/assets-studio/direction-sheet?characterId=${encodeURIComponent(characterId)}`; }}>
          <Lang text={{ ko: "기존 단계로 이동", en: "Continue to the existing step" }} />
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-10" data-ruleset-universe={universeId}>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <BookOpen className="size-4" aria-hidden />
            <span><Lang text={{ ko: "STEP 2 · WORLD SEED", en: "STEP 2 · WORLD SEED" }} /></span>
          </p>
          <h1 className="text-2xl font-bold sm:text-3xl">
            <Lang text={{ ko: "이 캐릭터의 세계를 시작해 보세요", en: "Start this character's world" }} />
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-secondary-text sm:text-base">
            <Lang text={{ ko: "제안된 내용을 직접 고친 뒤 승인하면, 비공개 Personal Universe와 첫 Canon이 만들어집니다. 지금 건너뛰어도 캐릭터 생성은 계속됩니다.", en: "Edit the proposal, then approve it to create a private Personal Universe and its first Canon. You can skip this and continue creating the character." }} />
          </p>
        </header>

        {error ? <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}

        <form
          className="space-y-5 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6"
          onSubmit={(event) => { event.preventDefault(); void approve(); }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="world-seed-name"><Lang text={{ ko: "세계 이름", en: "World name" }} /></Label>
              <Input id="world-seed-name" value={fields.worldName} maxLength={WORLD_SEED_FIELD_LIMITS.worldName} onChange={(event) => updateField("worldName", event.target.value)} aria-describedby="world-seed-name-help" />
              <p id="world-seed-name-help" className="text-xs text-secondary-text"><Lang text={{ ko: "이름은 나중에 확장할 수 있습니다.", en: "You can expand the name later." }} /></p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="world-seed-premise"><Lang text={{ ko: "한 문장 설정", en: "One-sentence premise" }} /></Label>
              <Textarea id="world-seed-premise" rows={3} value={fields.premise} maxLength={WORLD_SEED_FIELD_LIMITS.premise} onChange={(event) => updateField("premise", event.target.value)} />
            </div>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium"><Lang text={{ ko: "핵심 규칙 (최대 3개)", en: "Core rules (up to 3)" }} /></legend>
              <div className="space-y-2">
                {fields.rules.map((rule, index) => (
                  <Input
                    key={`world-seed-rule-${index}`}
                    aria-label={lang({ ko: `핵심 규칙 ${index + 1}`, en: `Core rule ${index + 1}` })}
                    value={rule}
                    maxLength={WORLD_SEED_FIELD_LIMITS.rule}
                    onChange={(event) => setFields((current) => current ? { ...current, rules: current.rules.map((item, itemIndex) => itemIndex === index ? event.target.value : item) } : current)}
                    placeholder={lang({ ko: `규칙 ${index + 1}`, en: `Rule ${index + 1}` })}
                  />
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="world-seed-place"><Lang text={{ ko: "시작 장소", en: "Starting place" }} /></Label>
              <Input id="world-seed-place" value={fields.startingPlace} maxLength={WORLD_SEED_FIELD_LIMITS.startingPlace} onChange={(event) => updateField("startingPlace", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="world-seed-event"><Lang text={{ ko: "첫 사건", en: "First event" }} /></Label>
              <Input id="world-seed-event" value={fields.firstEvent} maxLength={WORLD_SEED_FIELD_LIMITS.firstEvent} onChange={(event) => updateField("firstEvent", event.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { window.location.href = `/assets-studio/direction-sheet?characterId=${encodeURIComponent(characterId)}`; }}>
              <ArrowRight className="mr-2 size-4" aria-hidden />
              <Lang text={{ ko: "지금은 건너뛰기", en: "Skip for now" }} />
            </Button>
            <Button type="submit" className="min-h-11" loading={busy} disabled={busy}>
              <ArrowRight className="mr-2 size-4" aria-hidden />
              <Lang text={{ ko: "세계 만들고 계속하기", en: "Create world and continue" }} />
            </Button>
          </div>
          <p className="text-xs leading-5 text-secondary-text">
            <Lang text={{ ko: `현재 ruleset(${proposal.rulesetUniverseId} v${proposal.rulesetVersion})은 캐릭터 mechanics에만 사용됩니다. 공식 Canon을 자동으로 복사하지 않습니다.`, en: `The current ruleset (${proposal.rulesetUniverseId} v${proposal.rulesetVersion}) is used only for character mechanics. Official Canon is not copied automatically.` }} />
          </p>
        </form>
      </div>
    </main>
  );
}
