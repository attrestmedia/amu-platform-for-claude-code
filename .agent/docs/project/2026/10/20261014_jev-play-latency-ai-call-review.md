# JEV 적용 지점·Play 레이턴시·불필요 AI 호출 검토

- 작성일: 2026-10-14
- 기준 원장: `.agent/todo-jev-decision-fabric.json` (updatedAt 2026-10-09)
- 기준 소스: `node-app/` (커밋 8dcca19)
- 성격: 코드 변경 없는 분석. 수치(ms)는 실측하지 않았으므로 적지 않았고, **직렬 I/O 단계 수와 턴당 LLM 호출 수**로 비교한다.

---

## 0. 요약

1. **JEV를 붙이기 전에 걷어낼 LLM 호출이 이미 있다.** Play 세션 첫 턴에서 LLM이 3번 불리고(Narrative Director → 본 대화 → 메모리 요약), 그중 2번은 사용자가 답을 기다리는 동안 직렬로 돈다. 셋 중 둘은 결정론적 수정만으로 없애거나 응답 경로 밖으로 뺄 수 있다. 법무·개인화 게이트(G-JEV-LEGAL·G-JEV-PERSONALIZATION)와도 무관하니 지금 바로 할 수 있다.
2. **JEV Runtime(JEV-103)도 그대로 핫패스에 넣으면 레이턴시가 늘어난다.** 기본값(OFF)에서도 호출마다 Mongo 1회 + Redis 1회를 쓰고, trace 쓰기 2회를 기다린 다음에야 verdict를 돌려준다. 타임아웃 기본값은 1,500ms다. 소비 지점을 연결하기 전에 런타임부터 고쳐야 한다(§3).
3. **JEV가 가장 효과적인 위치는 "비싼 LLM을 부를지 말지 정하는 게이트"와 "응답 경로 밖의 판단"이다.** 본 대화 앞에 직렬로 두는 배치는 피한다. 우선순위는 다음과 같다.
   - A1 메모리 요약 트리거
   - A2 Director 갱신 판단
   - A3 관계 제안 게이트
   - B1 Play 대화 모델 tier 라우팅
   - B2 메모리 주입 깊이

   A는 응답 후(`after()`)나 다음 턴을 위한 선계산으로 돌리므로 사용자 레이턴시가 0ms 늘어난다. B는 프롬프트 구성과 병렬로 돌리고 데드라인을 건다(§4·§5).
4. 원장 순서와 맞추면 **P0 결정론 다이어트 → JEV 런타임 레이턴시 보강 → JEV-105 벤치마크에 레이턴시 예산 항목 추가 → JEV-110 1단계(replay)에 A1·A2·B1 후보 편입** 순서가 된다. 추가로 제안하는 TASK는 §6에 있다.

---

## 1. 현재 JEV 구현 상태 (코드 실측)

| 항목 | 상태 | 근거 |
|---|---|---|
| Decision Core (types·registry·runtime·client·circuit·trace) | 구현됨 | `src/libs/server-utils/decision/*`, `src/types/decision/decision.ts` |
| DecisionPoint 레지스트리 | **빈 배열** — 소비 지점 0건 | `src/consts/decision/decisionPointRegistry.ts:15` |
| runtime controls | 기본값 전부 OFF, `timeoutMs: 1500`, `dailyCogsUsdCap: 0` | `src/consts/system/jevRuntimeControls.ts:36-46` |
| `runDecision` 호출처 | 없음 (테스트 제외) | grep 결과 |
| Clef(JEV-2xx) | 미착수 (JEV-200 조사만 완료) | 원장 |

JEV는 아직 어떤 사용자 경로에도 연결되지 않았다. 그래서 **연결 방식을 지금 정하면** 레이턴시 부채를 만들지 않고 갈 수 있다.

---

## 2. Play 1턴의 크리티컬 패스 (게임 유니버스 CharacterChat)

### 2-1. 직렬 단계

```
[클라이언트] useChat.sendMessage
  ① await saveMessage(user)               ← 서버 왕복 1회 (Mongo upsert·세션·관계 집계)   useChat.ts:616
  ② await sendToAI → POST /api/ai/chat                                                   useChat.ts:659
       withAuth(사용자 로드·가드)
       resolveChatModelPolicy: getUniverseById → getUniverseDetail → findUserAiChatPreference
       assertSystemModelSelectableOrThrow: 비상차단 readSystemSetting (Mongo, 캐시 없음)
       assertPricingPreflightOrThrow (정적)
       composeSystemPromptOrThrow
         assertUniverseRouteConsistency: getUniverseById (중복 — game 경로는 hint 없음)
         buildNarrativeDirectorChatRequest: resolveFeatureAccess → assertNarrativeCollectionAllowed
                                            → getPersonaForPrompt → redis INCR
         composeAuthoritativeSystemPrompt (모두 순차 await)
           getPersonaForPrompt(npc)  (중복)                     systemPromptComposer.ts:283
           getSystemPersonaPromptText(base)                      :287
           getSystemPersonaPromptText(persona)                   :302
           getPersonaForPrompt(user char)                        :339
           loadConversationMemoryBlock (Session.find + Archive.findOne)  :376
           resolveNarrativeDirective  ← ★ LLM 호출 (circuit·cost preflight·cache·billing 포함)  :396
           loadNarrativePromptProjection (consent 재조회·canon·story state·redis)  :407
       claimProviderOperationOrThrow (redis)
       ★ 본 대화 LLM (비스트리밍, JSON 응답 전체 대기)                unifiedChat.ts:787
       billAIUsageOrThrow (Mongo)
       providerLease.complete (redis)
  ③ await persistAssistantMessage → saveMessage(assistant)                                useChat.ts:667
       saveConversationMessage → await refreshConversationMemoryPipeline  saveConversationMessage.ts:329
         ★ 세션 요약 LLM (조건부) + 일간·주간·월간 rollup LLM (조건부, 직렬)
```

### 2-2. 턴당 LLM 호출 수 (세션 첫 턴, Director 활성 기준)

| 호출 | 사용자 대기 경로에 있나 | 비고 |
|---|---|---|
| Narrative Director | **예 (본 LLM 앞 직렬)** | 입력이 캐릭터 canon뿐이라 사용자마다 같은 결과를 다시 계산함 (F1) |
| 본 대화 | 예 | 비스트리밍 |
| 세션 메모리 요약 | 저장 요청 안에서 await (UI는 낙관적 반영) | **첫 assistant 메시지마다 실행되고 사용자 코인이 차감됨** (F2) |

---

## 3. 발견 사항

### 3-A. JEV 없이 걷어낼 수 있는 호출과 대기 (P0, 게이트 무관)

**F1. Narrative Director: 같은 결과를 사용자·세션마다 다시 계산하고, 캐시는 쓰이지 않는다**
- Director 프롬프트 입력은 `universeId`·`characterId`·캐릭터 canon(name·summary·background·personality·values·preferences)뿐이다. 사용자 데이터가 들어가지 않는다(`narrativeDirectorChatCaller.ts:68-81`). 그런데 캐시 key는 `uid:universe:character:session:beat` 단위다(`narrativeDirectorRuntime.ts:83-85`). 그래서 같은 캐릭터에 대해 사용자 수 × 세션 수만큼 LLM이 다시 불린다.
- `callsInSession`은 Redis INCR(TTL 300초, 첫 INCR에만 EXPIRE)로 정한다. `maxCallsPerSession: 1`이라 두 번째 턴부터는 `buildNarrativeDirectorChatRequest`가 `undefined`를 돌려준다(`:128-138`). 결과는 다음과 같다.
  - 300초 proposal 캐시(`narrativeDirectorCache.ts`)에는 chat consumer가 **도달하지 못한다**.
  - 턴 1과 300초마다 오는 첫 턴에만 directive가 붙고, 나머지 턴에는 directive가 없다. 품질도 턴마다 들쭉날쭉해진다.
- **제안:** directive를 `characterId + canonDigest + promptVersion + modelName`을 key로 **사용자 공통 캐시**에 둔다. canon publish·수정 시점에 미리 계산해 두고(또는 첫 miss에 계산), 채팅 경로는 조회만 한다. 사용자 데이터가 없으니 개인화 게이트 대상이 아니다. 이렇게 하면 채팅 핫패스에서 Director LLM 호출이 **0**이 되고, 모든 턴이 같은 directive를 받는다. 비용은 사용자 과금이 아니라 플랫폼 COGS(콘텐츠 준비 비용)로 처리한다.

**F2. 메모리 요약이 세션 첫 assistant 메시지마다 돌고, 저장 요청을 붙잡는다**
- `shouldForceCurrentSessionSummary = !currentSession.summary || …` 조건 때문에(`conversationMemoryPipeline.ts:854-857`) 세션 첫 assistant 메시지(대화 2개)부터 LLM 요약이 실행된다. 이 비용은 `billAIUsageOrThrow(app: ai_conversation_memory)`로 **사용자에게 과금된다**.
- 날짜가 바뀐 뒤 첫 저장에서는 지난 세션 재요약 + 일간·주간·월간 rollup LLM이 **직렬로** 같은 요청 안에서 돈다(`:903-1000`).
- **제안:**
  - (a) 최소 메시지 수 조건을 둔다(예: `messageCount ≥ N`이거나 `end-chat/end-force`일 때만).
  - (b) `refreshConversationMemoryPipeline`을 응답 뒤 `after()`로 옮기거나 큐 워커로 보낸다. `next/server`의 `after`는 이미 3곳에서 쓰고 있다(`api/(ai)/ai/agent/marketing/route.ts` 등).
  - (c) rollup은 cron·배치로 분리한다.
  - 이것만으로도 첫 턴 LLM 3회가 1회(+백그라운드 1회)로 줄어든다. 이후 이 트리거를 JEV로 고도화하는 것이 §4의 A1이다.

**F3. 클라이언트가 사용자 메시지 저장을 기다린 뒤에 AI를 부른다**
- `await saveMessage(user)` → `await sendToAI(...)`(`useChat.ts:616-659`) 순서라서 서버 왕복 1회가 TTFR(첫 응답까지 시간)에 그대로 더해진다.
- **제안:** 사용자 메시지 저장과 AI 요청을 동시에 시작하고, assistant 저장만 user 저장 완료를 기다리게 한다(세션 messageCount·순서 보존). 더 근본적인 방법은 서버 `/api/ai/chat`이 user 메시지를 같은 트랜잭션 경계에서 저장하는 것이다. 다만 `clientId` 멱등 계약은 그대로 유지해야 한다.

**F4. 서버 프롬프트 구성의 직렬 I/O와 중복 조회**
- `composeAuthoritativeSystemPrompt`의 persona·base prompt·persona prompt·user char·memory·projection은 서로 독립인데 **모두 순차 await**다. `Promise.all` 두 묶음으로 나누면 직렬 단계가 대략 7개에서 2개로 줄어든다.
- 같은 요청 안에서 반복되는 조회:
  - `getPersonaForPrompt(npc)` 2회 (Director 요청 생성, composer)
  - `getUniverseById` 2회 (chatModelPolicy, `assertUniverseRouteConsistency` — withAuth 경로는 `__resolvedUniverseType` hint가 없음)
  - `assertNarrativeCollectionAllowed` 2회 (Director 요청 생성, projection)
  - 요청 단위 memo(`AsyncLocalStorage`나 인자 전달)로 정리한다.
- 비상차단 확인 `readModelEmergencyDisable`는 호출마다 Mongo `readSystemSetting`을 실행한다(`modelEmergencyDisable.ts:44`). 3~5초 TTL의 in-process 캐시를 두면 비상차단 반영이 그만큼 늦어지므로, 이 지연을 허용할지는 운영 판단이 필요하다.

**F5. 비스트리밍 JSON 응답 (참고: JEV 범위 밖이지만 체감 레이턴시에 가장 큰 단일 요인)**
- 본 대화는 `{message, translation, systemCode, …}` JSON 전체가 생성된 뒤에야 반환된다(`unifiedChat.ts:787-819`). 체감 첫 글자 시간은 결국 전체 생성 시간과 같다.
- 스트리밍으로 바꾸려면 응답 계약을 "message 텍스트 스트림 + 끝에 메타(translation·systemCode)" 형태로 나눠야 한다. 별도 TASK로 검토할 것을 권한다.

### 3-B. JEV Runtime을 핫패스에 넣기 전에 고칠 점 (live 호출 없이 지금 가능)

| # | 문제 | 위치 | 제안 |
|---|---|---|---|
| R1 | **게이트 순서**: controls(Mongo)·circuit(Redis)·credential을 모두 읽은 **다음에** `resolveDecisionActivation`이 user opt-out·kill switch를 판정한다. 기본 OFF 상태에서도 호출마다 I/O 2회 이상이 든다. | `decisionRuntime.ts:171-210` | ① `userSmartModeEnabled=false`면 I/O 없이 즉시 Standard로 보낸다. ② controls로 kill·provider·service·point·rollout을 먼저 판정한다(rollout은 순수 해시). ③ 통과한 경우에만 circuit·credential을 읽는다. 순수 정책 함수를 2단계(`preIoGate` / `postIoGate`)로 나눈다. |
| R2 | controls를 호출마다 Mongo에서 읽는다(캐시 없음). | `system/jevRuntimeControls.ts:24-42` | 2~5초 in-process TTL 캐시를 둔다. **unreadable은 캐시하지 않는다**(fail-closed 유지). kill switch 반영이 TTL만큼 늦어지는 점은 원장 INV에 명시해야 한다. |
| R3 | trace 기록(`createAiCostTrace` + `completeAiCostTrace`, Mongo 2회)을 **기다린 뒤에** verdict를 돌려준다. | `decisionRuntime.ts:153` | traceId는 동기로 만들고 저장은 `after()`나 fire-and-forget으로 한다. 지금도 trace는 관측 전용이라 실패해도 결과가 바뀌지 않으므로 계약상 문제가 없다. |
| R4 | 성공할 때마다 circuit에 `redis del`을 쓴다. | `decisionRuntime.ts:294-299` | 읽은 record가 이미 empty면 쓰지 않는다. |
| R5 | `timeoutMs` 기본값 1,500ms. 대화 핫패스에 직렬로 두면 최악의 경우 1.5초가 더해진다. | `jevRuntimeControls.ts:41` | point별 **latency budget**(`deadlineMs`)을 레지스트리 필드로 둔다. 핫패스 point는 250~400ms 수준에서 JEV-105 p95를 보고 정한다. 호출부는 `Promise.race`로 데드라인을 넘기면 Standard로 간다. 데드라인 초과는 provider 실패로 세지 말고 별도 reasonCode(`deadline_exceeded`)로 기록한다(circuit 오염 방지). |
| R6 | 한 번 호출에 질문 1개(`questions: {[point.id]: …}`). 같은 턴에 point가 여러 개면 왕복도 여러 번이 된다. | `decisionRuntime.ts:236` | System One API는 questions map을 받으므로 **같은 state·같은 서비스**의 point들을 한 번에 묶는 `runDecisionBatch`를 만든다. sanitizer는 point별 allowlist의 합집합이 아니라 **교집합 projection**으로 만들어야 INV-7을 지킨다. 그게 안 되면 묶지 않는다. |

R1~R6은 G-JEV-ACCESS 이후 live 호출이 없어도 fake transport 계약 테스트로 끝낼 수 있다(JEV-103 범위의 보강).

---

## 4. JEV 적용 지점 — 효과 × 리스크 × 게이트

판단 기준은 세 가지다. ① **LLM 호출을 없애는지**(비용·대기 직접 절감), ② **사용자 대기 경로에 JEV를 더하지 않는지**, ③ **effectClass가 낮은지**(observe → rank).

### Tier A — "부를지 말지" 게이트, 응답 경로 밖 (효과 최대, 레이턴시 +0)

| ID 후보 | primitive | 대체하는 것 | 실행 위치 | state 예시 (allowlist, 원문 없음) |
|---|---|---|---|---|
| **A1 `play.memory-summarize-trigger.v1`** | noul | F2의 고정 규칙(첫 메시지·24개 간격) | 응답 후 `after()` | 미요약 메시지 수 bucket·세션 길이·systemCode 집합·intimacy delta·결정론 신호 플래그(고유명사/날짜/선호 표현 감지 여부 — 서버 regex 결과 boolean만) |
| **A2 `play.director-refresh.v1`** | choice(`reuse`·`static`·`refresh`) | F1 이후 남는 "canon 공통 directive로 충분한가, 장면 전환으로 새 directive가 필요한가" | 턴 N 응답 후 **다음 턴용으로 미리 계산**해 Redis(session key)에 저장, 턴 N+1은 조회만 | sceneId·beatId 변화 여부·턴 수 bucket·systemCode·관계 단계 enum |
| **A3 `play.relationship-proposal-gate.v1`** | noul | 관계 제안 LLM(`relationship-proposals/route.ts:112`) 호출 여부 | 요청 경로지만 LLM 앞의 싼 게이트 | canon 개수·캐릭터 관계 단계 enum·최근 제안 경과 bucket |

- 세 지점 모두 JEV가 틀려도 **Standard로 돌아가면 현재 동작 그대로**다(INV-1). effectClass는 observe로 시작해서, 실제 호출을 생략하는 단계에서 rank로 올린다.
- A1·A3은 "호출하지 않기로 한 판단"이 품질 회귀로 이어질 수 있다. 그래서 JEV-105 벤치마크에 **false-skip rate**(호출했어야 하는데 건너뛴 비율)를 1급 지표로 넣는다.
- A2는 F1을 적용한 뒤에만 의미가 있다. F1만으로 충분하면 A2는 만들지 않는다.

### Tier B — 레이턴시 단축형 라우팅 (효과 큼, 게이트 많음)

| ID 후보 | primitive | 효과 | 배치 |
|---|---|---|---|
| **B1 `play.chat-tier-route.v1`** | choice(`fast`·`standard`·`strong`) | 짧은 인사·리액션 턴은 빠른 모델로 보내 TTFR을 줄이고, 갈등·전환 턴은 강한 모델로 보낸다 | `resolveChatModelPolicy`와 **병렬**로 실행하고 데드라인(R5) 안에 오면 반영한다. **사용자가 모델을 명시하지 않았고(`preference` 없음) 유니버스 정책이 `locked`가 아닐 때만** 적용 |
| **B2 `play.memory-depth.v1`** | choice(`none`·`recent`·`full`) | 프롬프트 입력 토큰을 줄여 TTFT·비용을 낮춘다 | 메모리 블록 로딩과 병렬. 결과에 따라 주입할 블록만 고른다 |

- B1은 JEV-106(Gen Studio worker tier)과 같은 구조다. JEV는 등급만 돌려주고, 실제 모델 선택은 기존 selectable catalog·pricing preflight·`chatModelPolicy`를 다시 통과한다(INV-4, ADR-JEV-01 system2). 모델 목록에 JEV를 넣는 경로는 만들지 않는다.
- B1·B2는 **실사용자 대화 state**를 쓰므로 G-JEV-LEGAL·G-JEV-PERSONALIZATION이 통과하기 전에는 replay만 할 수 있다. 또 rank 승격이라 G-JEV-EFFECT 승인과 G-JEV-CJK 통과가 필요하다. 한국어 Play라서 G-JEV-CJK가 사실상 가장 큰 장벽이다.

### Tier C — 원장 기존 계획 유지
- JEV-110 `play.narrative-directive.v1`(observe)은 유지한다. 다만 F1을 적용하면 Director 자체가 비싸지 않아지므로, JEV-110의 비교 대상(기존 proposal 대비 품질·비용·latency)을 **canon 공통 directive**로 다시 잡아야 한다.

### 권하지 않는 배치
- 매 턴 본 대화 LLM **앞에 직렬로** JEV를 두는 것. 데드라인과 병렬화가 없으면 JEV 장점(빠름)이 사라지고 최악 경로만 늘어난다.
- systemCode·호감도(intimacy) 판정을 JEV에 넘기는 것. 지금은 서버 집계가 권위를 갖고 있고 경제·진행에 영향이 있다(INV-5 정신).

---

## 5. 레이턴시를 더하지 않는 연결 패턴

```ts
// 패턴 1 — 응답 후 판단 (A1)
after(async () => {
  const verdict = await runDecision({ pointId: "play.memory-summarize-trigger.v1", ... });
  if (verdict.outcome === "decided" && verdict.value === true) await summarizeSession(...);
  else if (verdict.outcome !== "decided") await standardMemoryRule(...); // 기존 규칙 = Standard
});

// 패턴 2 — 병렬 + 데드라인 (B1)
const [policy, tier] = await Promise.all([
  resolveChatModelPolicy(...),
  withDeadline(runDecision({ pointId: "play.chat-tier-route.v1", ... }), point.deadlineMs, STANDARD_VERDICT),
]);

// 패턴 3 — 다음 턴 선계산 (A2): 턴 N 응답 후 계산 → redis `decision:prefetch:{session}` → 턴 N+1 은 GET 1회
```

`withDeadline`은 데드라인을 넘기면 JEV 호출을 abort하지 않는다. trace·circuit 기록은 백그라운드에서 끝까지 마치게 두고, 호출부만 Standard로 진행한다. 그래야 데드라인 초과가 provider 장애로 잘못 집계되지 않는다(R5).

---

## 6. 원장 반영 제안 (사용자 결정 필요)

| 제안 TASK | 내용 | 의존·게이트 |
|---|---|---|
| **JEV-116 (신규)** Decision Runtime 레이턴시 보강 | §3-B R1~R6: 게이트 순서 2단계 분리·controls TTL 캐시·trace 비동기화·circuit 쓰기 생략·point `deadlineMs`·`deadline_exceeded` reasonCode·batch | JEV-103 이후. live 호출 없음 → 지금 ready |
| **JEV-117 (신규, 또는 별도 원장)** Play AI 호출 다이어트 (결정론) | §3-A F1~F4 (+F5 스트리밍 검토 분리) | 게이트 없음. 다만 F1은 Director 과금 주체 변경(사용자 → 플랫폼 COGS)이라 경제 정책 확인 필요(server-economy-security) |
| JEV-105 개정 | 측정 항목에 **point별 p95 vs 데드라인 예산 충족률**·**false-skip rate**(A1·A3) 추가 | — |
| JEV-110 개정 | 1단계(운영자·테스트 replay)에 A1·A2·B1 후보 포함. 비교 기준을 F1 이후 canon 공통 directive로 재설정 | JEV-117-F1 |
| 열린 결정 OD-JEV-14 (신규) | controls 캐시 TTL과 kill switch 반영 지연 허용치 | JEV-116 |

서비스 순서(OD-JEV-02, PTU-Q-016 D-7)는 바꾸지 않는다. 위 제안은 Play 안에서의 적용 지점과 순서만 다룬다.

---

## 7. 측정 계획 (전후 비교)

1. `/api/ai/chat`에 단계별 `Server-Timing` 헤더를 붙인다: `policy`·`compose`·`director`·`memory`·`llm`·`billing`. 운영자 계정에서만 노출한다.
2. 턴당 LLM 호출 수와 턴당 사용자 코인 차감을 `AiCostTrace`의 `workflowRunId`(턴 단위)로 묶어 집계한다.
3. 기준선을 잡은 다음 F3 → F4 → F1 → F2 순으로 하나씩 적용하며 비교한다. 위험이 낮고 효과가 확인하기 쉬운 순서다.
4. JEV 지점은 observe 단계에서 "JEV가 생략을 권한 비율 × 그 경우의 품질 label"로 절감 가능량을 추정한 뒤 rank 승격을 판단한다(JEV-106 D2의 `qualityRegressionMax 0.05`·`costSavingMin 0.15` 기준을 그대로 쓴다).
