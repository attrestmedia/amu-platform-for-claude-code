# S01 「머리를 자른 다음 날」 — Production Brief (draft)

> **⚠ v1 기준 문서 — 재작성 필요 (2026-10-12).** `00_the-world-genesis-design.md` v2에서 하린의 출발점이 "팔로워 48만 모델"에서 "모델·인플루언서 지망생"으로 바뀌었다.
> 이 Brief의 전제(광고 계약 종료·팔로워 48만)는 v2와 충돌한다. 핵심 판단(반응 vs 구매)은 v2.1 공식 플레이 8장 이후 소재 풀 「살게요 92%」로 이동했다. 새 S01 후보는 공식 플레이 Ch1 「팔로워 0명」 — v3부터 하린 시점 + "멘토가 해 줄 말" 선택지(00 §13 결정 6).

* 문서 상태: `draft` — 규약 §8 Production Brief. **사용자 승인 전 P13 제작 입력으로 쓰지 않는다**
* 작성: 2026-10-12
* 기준: `INTERACTIVE-NARRATIVE-STANDARD.md` v1.0 (규약) · 상위 설계 [`00_the-world-genesis-design.md`](./00_the-world-genesis-design.md)
* 코드 기준: 이 브랜치의 node-app은 최신이 아니다. 필드 매핑(`→ InteractiveStory.*`)은 규약 §8 기준이며, 최신 `interactiveStory.ts`로 재확인한다.

---

## 1. 판정 요약 (P0~P2)

### 1.1 P0 Intelligence Candidate

| 필드 | 값 |
| --- | --- |
| Topic | 크리에이터·인플루언서 창업에서 관심(팔로워·반응)과 구매 수요의 차이 |
| Core Insight | 무비용 반응은 관심을 보여줄 뿐 구매를 보장하지 않는다. 만들기 전에 비용을 치르는 작은 행동으로 수요를 확인할 수 있다 |
| User Need | 자기 브랜드·사이드 프로젝트·첫 상품을 고민하는 사람이 "반응이 좋으니 되겠지"로 큰 결정을 내리는 위험 |
| Source/Evidence | Magazine Knowledge Unit 후보 `Demand Before Build`·`Fake Door Test`(`magazine_knowledge_article.md` §19 예시) — **저장 여부·evidenceRefs 미확인** |
| Freshness | Evergreen Principle 성격(시점 의존 수치 없음). 수치를 쓰지 않는다 |
| Target Audience | 크리에이터 경제·창업·패션에 관심 있는 Home 숏폼 사용자 |
| Expected Value | "반응 = 수요"라는 판단 기준을 바꿈 |
| Potential Expansion | 최소 주문 수량(S02) → 원가·가격(S03) |
| 관련 기존 Story | 없음 (첫 Story) |

### 1.2 P1 Worthiness Gate

| 축 | 판정 | 근거 |
| --- | --- | --- |
| Narrative Potential | 높음 | 계약 종료라는 사건 + 첫 출시 결정 |
| Human Tension | 높음 | 안정된 수입 vs 자기 이름의 도전 |
| Character Relevance | 높음 | 하린의 Misbelief("관심 = 수요")와 정면으로 맞닿음 |
| Choice Potential | 높음 | 발표·검증·유보 세 길 모두 합리적 |
| Continuity Potential | 높음 | 최소 주문 수량(S02), 강 실장 관계(S04) |
| **Knowledge Value** | **높음** | 스토리를 빼도 "만들기 전에 지갑으로 확인하라"는 판단 기준은 그대로 가치가 있다 |

**판정: pass** — 단, Knowledge Claim의 `source` 바인딩이 P12 승인 조건이다(§5).

### 1.3 P2 Narrative Conversion

| 항목 | 값 |
| --- | --- |
| `coreQuestion` | **팔로워가 많으면, 내 브랜드는 팔릴까?** |
| `humanTension` | 남의 브랜드의 얼굴로 안정적으로 살 것인가, 실패할 수 있는 내 이름으로 시작할 것인가 |
| `beliefShift.currentBelief` | "좋아요·투표에서 '살게요'가 많으면 잘 팔릴 것이다" |
| `beliefShift.desiredBelief` | "관심과 구매는 다른 신호다. 크게 만들기 전에, 돈이나 시간을 내는 작은 행동으로 수요를 먼저 확인한다" |
| `beliefShift.evidence` | K1·K2 (§5) |
| `beliefShift.nextAction` | 내 아이디어가 있다면, 만들기 전에 "사전 예약·대기 신청" 같은 작은 확인부터 해 본다 |
| `narrativePremise` | **하린이** 자기 이름의 브랜드를 시작하려 **하지만**, 가장 큰 광고 계약이 끊긴 지금 실패할 여유가 없어서, 크게 발표할지·작게 확인할지·잠시 버틸지 **선택해야 한다** |

---

## 2. Brief 필드 (규약 §8)

```text
storyId                tw-harin-s01-after-the-cut
storyVersion           1                               # 출판 후 불변
universeId             the-world
title                  { ko: "머리를 자른 다음 날", en: "The Day After the Cut" }
summary                { ko: "숏컷으로 바꾼 다음 날, 가장 큰 광고 계약이 끝났다. 팔로워 48만의 모델 하린은 자기 이름의 옷을 만들 수 있을까?",
                         en: "The day after Harin cut her hair short, her biggest ad contract ended. Can a model with 480K followers sell clothes under her own name?" }
sourceRefs[]           [ { kind: magazine_intelligence, ref: <Demand Before Build KU id — 확인 필요> },
                         { kind: magazine_intelligence, ref: <Fake Door Test KU id — 확인 필요> } ]
seriesArcId            tw-arc-harin-out-of-frame
canonRevisionRef       not_applicable: the-world 공식 Canon 미등록 — 00 문서 §1.2·§2 제안 승인 후 revision id 기입
coreQuestion           §1.3
humanTension           §1.3
beliefShift            §1.3
narrativePremise       §1.3
characters[]           { tw-char-harin, roles:[Protagonist, Entry], new, stateSnapshotRef: 00 §2.1, assetRefs: 캐릭터 시트 + 액션 A1~A9 }
                       { tw-char-kang,  roles:[Challenger],        new, stateSnapshotRef: 00 §2.2, assetRefs: 캐릭터 시트 + 액션 4종 }
                       { tw-char-moon,  roles:[Guide, Bridge],     new, stateSnapshotRef: 00 §2.3, assetRefs: 캐릭터 시트 + 액션 4종 }
entryCharacterId       tw-char-harin
bridgeCharacterId      tw-char-moon                    # Entry ≠ Bridge → Baton Pass(세계 확장)
primaryConflict        Safety vs Opportunity
secondaryConflict      Truth vs Belief (투표 결과 vs 실제 지갑)
subplots[]             { tw-sub-harin-seen-vs-maker,  Character,           seed,   payoffHorizon: S06 }
                       { tw-sub-kang-secret,          Relationship,        seed,   payoffHorizon: S04 }
                       { tw-sub-textile-row-survival, World/Knowledge,     seed,   payoffHorizon: S05~S06 }
knowledgeClaims[]      §5
designBeats[]          §3
storyBeats[]           §4
immediateConsequence   선택 2의 result — 경로별로 "반응과 지갑의 차이"를 다른 방식으로 목격한다
deferredConsequence    harin_launch_path·harin_kang_stance 플래그와 강 실장 affinity가 S02 도입부와 S04 협찬 장면에서 다르게 드러난다
entryState · exitState §6
canonChangeProposals[] §6.3 (모두 draft, admin 승인 필요)
nextStorySeeds[]       §6.4 (최대 3)
batonPass              Problem → 최소 주문 수량(문 사장)
surfaces               home_feed · play                # 진입 맥락은 표시용
primaryCta             "다른 선택으로 다시 보기"        # Play CTA는 공개 단계 열린 사용자에게만(§7)
successMetric          ISC-008 확정 전 — 후보: story_complete, 재시도(다른 선택), 다음 Story 시작
complianceGate         §8
```

> `summary`의 "팔로워 48만"은 **Fiction**(작중 설정)이다. 실제 통계로 읽히지 않도록 다른 수치와 비교·비율을 붙이지 않는다.

---

## 3. Design Beats (P7 — 10단 상세)

`visualAsset`의 A1~A9는 하린 액션 시트(00 §2.5). K는 Knowledge Claim(§5). 선택이 있는 Beat는 굵게 표시했다.

| beatId | 단계 | pov | goal / opposition | knowledgeRevealed | emotionalDelta / relationshipDelta | setup / payoff | choice | visualAsset | exitHook |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DB01 | Cold Open | 하린 | 새 모습에 익숙해지기 / — | — | 해방감 | setup: 숏컷의 의미 | none | A1 거울·숏컷 | "어제 머리를 잘랐다." |
| DB02 | Trigger | 하린 | — / 계약 종료 알림 | — | 해방 → 충격 | setup: 이미지 유지 조항 | none | A2 휴대폰 알림 | "오늘, 가장 큰 계약이 끝났다." |
| DB03 | Goal | 하린 | 디자인 노트를 세상에 내놓기 / 두려움 | — | 충격 → 결심의 씨앗 | setup: 3년 된 디자인 노트 | none | A4 노트 스케치 | 휴대폰이 울린다 — 강 실장 |
| **DB04** | Conflict | 하린 | 자기 길 / 강 실장의 재계약 제안 | — | 망설임 / 강 실장 ±1 | setup: `tw-sub-kang-secret`(강의 목소리에 섞인 피로) | **선택 1** | A3 통화 | 어떻게 답하든, 하린은 숫자가 필요하다 |
| DB05 | Investigation | 하린 | 수요 증명 / 문 사장의 의심 | **K1** | 자신감 → 당황 / 문 사장 첫 만남 | setup: 문 사장의 인플루언서 불신 | none | 스토리 투표 화면(가상 UI) → A6 | "그거 누르는 데 돈 들어요?" |
| DB06 | Complication | 하린 | 샘플 의뢰 / 최소 주문 수량 | **K3** | 당황 → 계산 | setup: `300장` (S02 payoff) · `tw-sub-textile-row-survival`(골목의 빈 가게들) | none | A7 원단 + 샘플실 배경 | 다섯 디자인 × 300장 = 1,500벌 |
| **DB07** | Decision | 사용자 | 첫 걸음 고르기 / 실패 여유 없음 | **K2** | 긴장 | — | **선택 2** | A9 결심한 정면 | 선택 직후 결과로 |
| DB08 | Consequence | 하린 | — | K1 재확인(경로별) | 경로별 (§4 result) | payoff: DB05 투표 92% | none (= `StoryChoice.result`) | A5 / A6 / A4 | 하린은 노트를 다시 연다 |
| DB09 | Resolution | 하린 | Core Question에 답하기 | K1·K2 정리 | 안도 | payoff: DB03 노트 | none | A8 안도 | 노트의 새 문장 |
| DB10 | Bridge | 문 사장 | — / 다음 문제 | — | 기대 + 긴장 | setup: S02 Seed | none | 문 사장 메시지 화면 | "근데 300장부터인 건 알지?" |

Narrative Impact Graph 참조(규약 §9.3):

- `DB08.dependsOn = [DB04, DB07]` · `DB10.affects = [S02.DB01]`
- `DB05.knowledgeClaimRefs = [K1]` · `DB06.knowledgeClaimRefs = [K3]` · `DB07.knowledgeClaimRefs = [K2]`
- `DB04.characterStateRefs = [tw-char-kang.relation]` · `DB06.canonEventRefs = [tw-loop-moq-300]`

---

## 4. Story Beats — 숏폼 장면 원고 (→ `InteractiveStory.beats`)

**형식 메모**: Home은 세로 숏폼(9:16) 장면 카드로 넘긴다. 규약 §8의 `StoryBeat`는 `prompt + choices`만 갖는다.
아래 `scenes`는 **ISC-001 계약 v1에 제안하는 확장 필드**다(00 §7 결정 4). 계약이 확장되기 전에는 각 Beat의 `scenes` 텍스트를 이어 붙인 것이 `prompt`가 된다.
대사는 큰따옴표, 독백·지문은 그대로 쓴다. 장면당 문장은 3줄 이내로 쓴다(숏폼 가독성).

### Beat `b1-the-cut` (DB01~DB04)

| scene | 미디어 | 텍스트 (ko) | 모션 |
| --- | --- | --- | --- |
| s1 | A1 — 거울 속 숏컷 | 어제 머리를 잘랐다. / 7년 만에 처음으로, 내가 고른 모양이다. | 텍스트 한 줄씩 페이드 업 |
| s2 | A2 — 휴대폰 알림 클로즈업 | [계약 종료 안내] / 오늘, 가장 큰 계약이 끝났다. | 알림 배너 슬라이드 다운 → 화면 정지 |
| s3 | 계약서 일부(가상 문서, 브랜드명 없음) | '모델은 계약 기간 동안 현재의 헤어 이미지를 유지한다.' | 해당 문장만 하이라이트 |
| s4 | A4 — 디자인 노트 | 아무도 모르는 노트가 있다. / 3년 동안 그린 옷, 마흔두 벌. / 이번엔… 내 이름으로. | 스케치 선이 그려지는 모션 |
| s5 | A3 — 통화 | "하린 씨. 머리, 다시 기르겠다고만 하면 재계약 얘기해 볼 수 있어요." / "대답은 내일까지 주세요." — 강 실장 | 말풍선 등장 |
| s6 | A3 | 강 실장의 목소리가 평소보다 지쳐 있다. | (선택 직전 정지) |

**선택 1 — 강 실장에게 뭐라고 답할까?**

| choiceId | label | result (즉시 결과) | narrativeEffects (후보) |
| --- | --- | --- | --- |
| `c1-listen` | { ko: "재계약 조건부터 들어본다", en: "Hear the renewal terms first" } | { ko: "강 실장이 조건을 읽어 준다. 6개월, 이미지 유지. 안정적인 숫자다. \"생각할 시간을 주세요.\" 수화기 너머 목소리가 조금 풀린다.", en: "Kang reads the terms: six months, keep the look. Safe numbers. \"Give me some time.\" His voice softens a little." } | `relation.affinity.adjust` → `tw-char-kang` +1 · `world.flag.set` `harin_kang_stance = listened` |
| `c1-declare` | { ko: "내 브랜드를 하겠다고 말한다", en: "Tell him she's starting her own brand" } | { ko: "긴 침묵. \"팔로워 숫자만 믿고요?\" 강 실장은 화내지 않는다. \"그럼 숫자로 보여 주세요.\"", en: "A long silence. \"Just on follower count?\" Kang doesn't get angry. \"Then show me in numbers.\"" } | `relation.affinity.adjust` → `tw-char-kang` −1 · `world.flag.set` `harin_kang_stance = declared` |

- 두 선택 모두 합리적이다: 조건을 듣는 것은 정보를 얻는 행동이고, 선언은 자기 결정을 지키는 행동이다. 어느 쪽도 오답이 아니다.
- affinity 변화는 ±1로 작게 둔다(관계 급변 금지, Verifier Relationship). 이후 Story는 같은 장면으로 합류한다.

### Beat `b2-the-vote` (DB05~DB07)

| scene | 미디어 | 텍스트 (ko) | 모션 |
| --- | --- | --- | --- |
| s1 | 가상 SNS 스토리 투표 UI(브랜드·플랫폼 로고 없음) | "내 이름으로 옷이 나오면 살 거예요?" / 살게요 92% | 퍼센트 바가 차오름 |
| s2 | A6 → 원단 거리 배경 | 숫자는 충분해 보였다. / 샘플을 만들어 줄 사람을 찾아 원단 거리 끝까지 갔다. | 배경 패럴랙스 |
| s3 | 문 사장 등장 (액션: 의심) | 문 사장이 휴대폰 화면을 힐끗 본다. / "그거, 누르는 데 돈 들어요?" | 대사 강조(탁) |
| s4 | A6 | "…아뇨." / "그럼 아직 아무도 안 산 거예요. 산다고 한 거지." | — |
| s5 | 샘플실 내부, A7 원단 | "샘플은 만들어 줄게. 근데 공장에 넘기면 한 디자인에 300장부터야." | 숫자 300 강조 |
| s6 | 계산 메모(손글씨) | 다섯 디자인 × 300장 = 1,500벌. / 92%가 진짜면, 아무것도 아닌 숫자. / 아니면, 스튜디오에 쌓일 1,500벌. | 계산이 한 줄씩 써짐 |
| s7 | A9 결심 | 오늘 밤 안에 첫 걸음을 정해야 한다. | (선택 직전 정지) |

**선택 2 — 하린의 첫 걸음은?**

| choiceId | label | 이 선택의 이점 / 대가 (기획 메모, 화면 비노출) | result (즉시 결과) | narrativeEffects (후보) |
| --- | --- | --- | --- | --- |
| `c2-live` | { ko: "라이브로 크게 발표한다", en: "Announce it big on a live stream" } | 이점: 화제성·속도, 팬과의 관계를 즉시 활용 / 대가: 반응을 수요로 착각하기 쉽다 | { ko: "라이브 접속자가 폭발한다. 댓글창은 '무조건 산다'로 가득하다. 그런데 출시 알림 신청 링크를 누른 사람은 댓글의 한 줌이다. 하린은 처음으로 두 숫자를 나란히 놓고 본다.", en: "The live stream explodes. Comments flood with \"I'm buying it, no matter what.\" But only a handful tap the launch-alert link. For the first time, Harin sets the two numbers side by side." } | `world.flag.set` `harin_launch_path = big_reveal` · `story.beat.complete` |
| `c2-preorder` | { ko: "50벌만 사전 예약을 받아 본다", en: "Take pre-orders for just 50 pieces" } | 이점: 지갑으로 확인 / 대가: 작은 숫자가 공개돼 체면이 깎일 수 있고 느리다 | { ko: "\"아직 만들기 전이에요. 50벌만, 사전 예약 받을게요.\" 하루 뒤, 31벌. 투표 92%에 비하면 초라하다. 그런데 31명은 이름과 사이즈를 남겼다. 어떤 옷을 원하는지도.", en: "\"I haven't made them yet. Just 50 pieces, pre-order only.\" A day later: 31. Small next to the 92% vote. But 31 people left their names and sizes — and which piece they wanted." } | `world.flag.set` `harin_launch_path = preorder_test` · `story.beat.complete` |
| `c2-steady` | { ko: "작은 광고 일로 버티며 천천히 준비한다", en: "Take smaller ad jobs and prepare slowly" } | 이점: 현금 안정·실패 비용 낮음 / 대가: 기회와 속도를 잃고, 다시 '얼굴'로 사는 시간이 길어진다 | { ko: "헤어 조항 없는 작은 광고 몇 개를 잡는다. 촬영장 대기실에서 강 실장이 지나가듯 말한다. \"그 투표 말이에요. 광고주들도 투표는 안 믿어요. 구매 데이터를 보죠.\"", en: "She lands a few small ad jobs with no hair clause. In a waiting room on set, Kang says in passing, \"About that poll — advertisers don't trust polls either. They look at purchase data.\"" } | `world.flag.set` `harin_launch_path = steady` · `story.beat.complete` |

- **Quiz 방지 점검**: `c2-preorder`가 판단 이동과 가장 가깝지만, 공개되는 작은 숫자(31)라는 실제 대가가 있다. `c2-live`는 화제성과 팬 관계라는 실제 이점이 있고, `c2-steady`는 현금 안정이라는 실제 이점이 있다. **세 경로 모두 "반응과 지갑은 다르다"를 각자의 방식으로 목격한다**. 정답을 고르는 구조가 아니라 같은 진실에 다른 길로 도착하는 구조다.
- `c2-preorder`는 "만들 예정임을 밝힌 사전 예약"이다. 존재하지 않는 상품을 있는 척 파는 Fake Door 방식이 아니다(하린의 도덕적 경계).
- 선택 전에 결과 수치·효과를 노출하지 않는다(규약 §6.4).

### Beat `b3-the-note` (DB09~DB10, 공통 합류)

| scene | 미디어 | 텍스트 (ko) | 모션 |
| --- | --- | --- | --- |
| s1 | A4 — 노트 새 페이지 | 노트 맨 앞장에 한 줄을 적었다. | — |
| s2 | 손글씨 클로즈업 | **좋아요는 박수, 결제는 약속.** | 손글씨가 써지는 모션 |
| s3 | A8 안도 | 팔로워가 많다고 팔리는 건 아니었다. / 대신, 확인하는 방법은 있었다. | — |
| s4 | 문 사장 메시지 화면 | "샘플 보러 와요." / "근데 300장부터인 건 알지?" — 문 사장 | 메시지 수신 진동 |
| s5 | AI 생성 고지 + CTA | (AI 생성 이미지 고지 문구) · [다른 선택으로 다시 보기] | — |

- `b3`는 선택이 없다. 최신 계약에서 선택 없는 마지막 `StoryBeat`(종료 Beat)를 허용하는지 확인한다. 허용하지 않으면 `b3`의 장면을 `b2` 선택 result 뒤의 종료 서술로 흡수한다.
- s3가 Core Question에 대한 답이다. 다음 편 유도를 위해 답을 숨기지 않는다(Endless Cliffhanger 금지).

---

## 5. Knowledge Claims (P8)

| claimId | layer | statement | uncertainty | source | freshness | 쓰인 곳 |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | interpretation | 좋아요·투표처럼 비용이 들지 않는 반응은 관심을 보여주지만, 구매 의사를 그대로 보여주지 않는다 | 반응과 구매의 차이 정도는 분야·가격·팬 관계마다 크게 다르다 → **비율·수치를 제시하지 않는다** | Magazine KU `Demand Before Build` 후보 — **바인딩 필요** | 2026-10-12 | DB05·DB08·DB09 |
| K2 | interpretation (tactic) | 크게 만들기 전에 사전 예약·대기 신청처럼 돈이나 시간을 내는 작은 행동으로 수요를 먼저 확인할 수 있다 | 작은 검증 결과도 실제 판매를 보장하지 않는다. 사전 예약은 배송 지연 시 신뢰를 해칠 수 있다. 관련 법적 고지 의무는 이 Claim의 범위가 아니다 | Magazine KU `Demand Before Build`·`Fake Door Test` 후보 — **바인딩 필요** | 2026-10-12 | DB07·DB09 |
| K3 | fact (후보) | 의류 생산은 공장에 따라 최소 주문 수량이 정해져 있는 경우가 많다 | 수량은 공장·소재·공정마다 다르다. 작중 "300장"은 **Fiction** 수치다 | **원천 없음** — Intelligence 확보 전에는 Fact로 쓰지 않고 문 사장의 작중 발언(Fiction)으로만 둔다 | — | DB06 |

- K3에 원천이 없으면 Verifier Intelligence 차단 대상이다. 대안: 문 사장의 대사를 "우리 거래하는 공장은 300장부터야"로 바꿔 **작중 한 공장의 조건(Fiction)**으로 한정한다. 이 대안이 기본값이다.
- 화면에 사실 주장 문장을 따로 띄우지 않는다. 지식은 캐릭터의 대사와 결과로만 등장한다(규약 §6.1).

---

## 6. Continuity (P10)

### 6.1 Entry State

00 §2.1 Narrative State. 관계: 하린–강 실장 `bound-oath`, 하린–문 사장 `unknown`(첫 만남). Series Arc 시작점.

### 6.2 Exit State (공식)

| 항목 | 값 |
| --- | --- |
| Character State | 하린 — "보여지는 사람"에서 "확인하는 사람"으로 첫 이동. Misbelief에 첫 균열 |
| 관계 변화 | 하린–문 사장: 모르는 사이 → 샘플 의뢰인. 하린–강 실장: 계약 관계 유지, 긴장(공식 기준) |
| 새 지식 | 반응과 구매의 차이(K1), 작은 검증(K2), 최소 주문 수량의 존재(K3) |
| 새 갈등 | 최소 주문 수량 vs 작은 수요 |
| 해결된 갈등 | "내 브랜드를 시작할 것인가" — 시작한다 |
| 미해결 질문 | 강 실장은 왜 지쳐 있었나 / 300장을 감당할 수 있나 |
| 위치 변화 | 스튜디오 → 원단 거리·샘플실을 알게 됨 |
| Next Hook | 문 사장의 메시지 |

- **공식 Exit State는 경로와 무관하게 "하린은 브랜드를 시작한다"**로 둔다. 사용자별 경로(`harin_launch_path`)는 그 사용자의 Narrative Runtime에만 남고, S02 도입부 한두 장면의 변주로만 반영한다(규약 §4.2).

### 6.3 Canon 변경 후보 (모두 draft · admin 승인 필요)

| 후보 | Entity | 비고 |
| --- | --- | --- |
| `tw-char-harin`·`tw-char-kang`·`tw-char-moon` 신규 등록 | `character` (C3) | 신규 공식 캐릭터 |
| 하린–강 실장 `bound-oath`, 하린–문 사장 `unknown` | `relation` (C3) | 하린–문 사장은 S01에서 `unknown`을 유지한다(mentor 전이는 S02~S03 판단) |
| `tw-loop-moq-300` "300장의 벽" | `open-loop` (C3) | payoffHorizon: S02 |
| `tw-loop-kang-secret` "강 실장이 지친 이유" | `open-loop` (C3) | payoffHorizon: S04 |
| 지역 5곳 | `region` (C2) | 00 §1.3 |

### 6.4 Next Story Seeds (최대 3, 각 Seed는 P0 재검증)

1. **S02 「300벌의 약속」** — 최소 주문 수량과 재고 위험 (Problem Baton, 문 사장 Entry)
2. **강 실장의 사정** — 에이전시의 위기와 협찬 제안 (Character Baton, S04 후보)
3. **31명의 사이즈** — 사전 예약 고객의 데이터로 첫 디자인 고르기 (Knowledge Baton, `preorder_test` 경로 사용자가 많을 때 우선 검토)

---

## 7. CTA (규약 §11.3)

| 구분 | 문구 | 노출 조건 |
| --- | --- | --- |
| Primary | 다른 선택으로 다시 보기 / See what happens if you choose differently | 항상 |
| 보조 | 이 캐릭터로 나만의 스토리 시작하기 / Start your own story with this character | **Play·`story.runtime` 공개 단계가 열린 사용자에게만**. 현재 admin_only → 일반 사용자 비노출 |

- CTA는 Consequence·Resolution 직후(`b3` s5)에만 둔다. Magazine 기사로 보내는 CTA를 두지 않는다.
- "다음 이야기" CTA는 S02가 출판된 뒤에만 노출한다(배포되지 않은 기능을 CTA로 쓰지 않는다).

---

## 8. complianceGate (규약 §10)

| 항목 | 판정 |
| --- | --- |
| 미성년 | **pass** — 성인 전용·청소년 유해 요소 없음. 체중·다이어트·외모 비하를 다루지 않는다 |
| 공개 단계 | 개발: `pass(admin_only)` / 공개: `blocked` (`G-ISC-PUBLIC`) |
| 사용자 진행 데이터 | `G-ISC-DATA` 판정 전 persistent 데이터 생성 금지 — fixture 검증만 |
| 대화 로그·음성 | 해당 없음 |
| 개인화 피드 | 해당 없음 (비개인화) |
| 금융·의료·법률 | 창업 판단 교육 한정. 매출 보장·투자 권유 문구 없음. 사전 예약 관련 법적 의무는 Fact로 쓰지 않는다 |
| 실존 주체 | 없음 — 계약서·SNS·투표 화면은 브랜드·플랫폼 로고 없는 가상 UI |
| AI 생성 고지 | 생성 이미지 사용 → `b3` s5에 고지 |
| 경제 | Story 시청 무과금. 보상·코인·XP 없음. 장면 이미지 생성은 `G-ISC-AI-COST` 승인 후 |

---

## 9. 작성자 사전 점검 (검증 아님)

규약 §9.1에 따라 이 Brief를 쓴 쪽이 검증하지 않는다. P14 Verifier는 별도 에이전트·사람이 수행한다. 아래는 넘기기 전 작성자 점검이다.

| Verifier 항목 | 작성자 메모 |
| --- | --- |
| Contract | effect는 allowlist 4종 중 2종만 사용. i18n은 title·summary·label·result에 `{ko,en}`. **scene 텍스트 en은 P13에서 작성 필요** |
| Choice | 선택 1(2지)·선택 2(3지) 모두 이점·대가 있음. effect 비노출 |
| Belief Shift | 세 경로 모두 K1을 목격 → DB09에서 공통 정리 |
| Knowledge | 문 사장의 최소 주문 수량 지식은 직업상 아는 정보. 하린은 DB06 전까지 모름 |
| Relationship | affinity ±1, 대상은 등장 인물(강 실장)만 |
| Intelligence | **K1·K2 source 미바인딩, K3 원천 없음 → 현재 상태로는 차단.** §5 대안 적용 + KU 확인 후 해소 |
| Safety | 외모 압박은 계약 조항(산업 구조)으로만 표현 |

---

## 10. 승인 전 남은 일

1. Magazine에서 `Demand Before Build`·`Fake Door Test` Knowledge Unit의 실제 id와 `evidenceRefs` 확인 → `sourceRefs`·K1·K2 바인딩
2. 주인공 이름 확정 (00 §7 결정 1)
3. 캐릭터 시트·액션 시트 생성 (`G-ISC-AI-COST` 승인) → 레퍼런스 이미지 기준으로 외형 확정
4. 최신 node-app의 `interactiveStory.ts`와 대조: 종료 Beat(선택 없음) 허용 여부, `scenes` 확장 필요 여부
5. scene 텍스트 영어 번역(P13)
6. 별도 Verifier 실행(P14)
