# AMU Interactive Content — Data Schemas

| 항목 | 값 |
| --- | --- |
| 문서 ID | `SSOT-IC-002` |
| 버전 | 1.0.0-draft |
| 최종 수정 | 2026-09-28 |
| 상위 문서 | [`AMU_INTERACTIVE_CONTENT_SSOT.md`](./AMU_INTERACTIVE_CONTENT_SSOT.md) (규약 본문) |
| 용도 | Narrative Runtime · Episode Planning · 측정 데이터의 필드 정의 SSOT. 사람·AI 에이전트·백엔드·프론트엔드가 공통으로 사용 |

> 표기는 TypeScript 인터페이스다. 저장소(MongoDB 등) 구현은 이 정의를 따르되 컬렉션 분할·인덱스는 [§10](#10-컬렉션-매핑-권장)을 참고한다. 괄호 안 `R-…`는 규약 본문의 규칙 ID다.

---

## 1. 공통 규약

### 1.1 ID 형식

| 엔티티 | 접두사 | 예 |
| --- | --- | --- |
| Universe | `UNI-` | `UNI-core` |
| CanonEntry | `CAN-` | `CAN-0042` |
| CanonEvent | `EVT-` | `EVT-0107` |
| CanonChangeRequest | `CCR-` | `CCR-0019` |
| Character | `CHR-` | `CHR-0003` |
| Relationship | `REL-` | `REL-0003-0007` (두 캐릭터 ID 오름차순) |
| StoryArc | `ARC-` | `ARC-0002` |
| Subplot | `SUB-` | `SUB-0011` |
| Setup (떡밥) | `SET-` | `SET-0031` |
| ContentCandidate | `CC-` | `CC-20260928-004` |
| EpisodeCandidate / Episode | `EP-` | `EP-0014` (Tier 1도 동일 접두사 사용) |
| Scene | `{episodeId}/SC-{n}` | `EP-0014/SC-3` |
| KnowledgeClaim | `KC-` | `KC-0210` |
| Interaction | `{episodeId}/INT-{n}` | `EP-0014/INT-2` |
| NextEpisodeSeed | `SEED-` | `SEED-0014-A` |
| VerificationReport | `VR-` | `VR-0014-draft-2` |

- ID는 불변이다. 표시명(이름·제목) 변경은 ID를 바꾸지 않는다.
- 모든 참조는 ID로 한다. 이름 문자열로 참조하지 않는다.

### 1.2 공통 메타

```ts
type ISODateTime = string; // RFC 3339

interface AuditMeta {
  createdAt: ISODateTime;
  createdBy: ActorRef;
  updatedAt: ISODateTime;
  updatedBy: ActorRef;
  version: number;               // 낙관적 잠금용, 변경마다 +1
}

interface ActorRef {
  kind: "human" | "ai_agent";
  id: string;                    // 사용자 ID 또는 에이전트 이름
  role?: GovernanceRole;
}

type GovernanceRole =
  | "intelligence_owner"
  | "narrative_planner"
  | "canon_keeper"
  | "fact_checker"
  | "editor"
  | "editor_in_chief"
  | "growth";

interface Approval {
  approvedBy: ActorRef;          // kind 는 반드시 "human" (R-CAN-06, §28.2)
  approvedAt: ISODateTime;
  gate: "G1" | "G2" | "G3" | "G4" | "G5" | "canon_minor" | "canon_major" | "canon_critical";
  note?: string;
}
```

### 1.3 공통 열거형

```ts
type Tier = 0 | 1 | 2;

type CanonLayer = "C0" | "C1" | "C2" | "C3" | "C4" | "C5";

type CanonChangeLevel = "minor" | "major" | "critical";

type CharacterGrade = "core" | "recurring" | "guest"; // extra 는 저장하지 않음 (R-CHR-07)

type NarrativeRole =
  | "protagonist" | "challenger" | "guide" | "stakeholder"
  | "catalyst" | "observer" | "bridge";

type ConflictType =
  | "goal_vs_goal" | "value_vs_value" | "individual_vs_system"
  | "short_vs_long_term" | "safety_vs_opportunity" | "truth_vs_belief"
  | "loyalty_vs_self_interest" | "efficiency_vs_humanity"
  | "freedom_vs_stability" | "knowledge_vs_uncertainty";

type BeatType =
  | "cold_open" | "trigger" | "goal" | "conflict" | "investigation"
  | "complication" | "decision" | "consequence" | "resolution" | "bridge";

type BatonPassType = "character" | "problem" | "location" | "knowledge" | "relationship";

type SubplotKind = "character" | "relationship" | "world_knowledge";

type SubplotState =
  | "seed" | "active" | "pressure" | "collision" | "payoff" | "aftermath"
  | "deferred" | "abandoned";

type InteractionType =
  | "choice" | "drag" | "input" | "data_manipulation" | "compare"
  | "simulation" | "evidence" | "character_question" | "time_shift"
  | "perspective_switch" | "prediction" | "quiz" | "generation";

type InteractionPurpose =
  | "understanding" | "immersion" | "participation" | "personal_result"
  | "perspective" | "problem_solving" | "story_outcome";

type EntertainmentDriver =
  | "curiosity" | "mystery" | "emotion" | "beauty" | "tension" | "humor"
  | "competition" | "discovery" | "relationship" | "self_projection"
  | "achievement" | "surprise" | "healing";

type ContinuationTarget =
  | "save" | "follow" | "share" | "next_episode" | "related_content"
  | "tutors" | "gen_studio" | "play" | "store";

type Severity = "blocking" | "major" | "minor";
```

---

## 2. Universe & Canon

```ts
interface Universe extends AuditMeta {
  id: string;                          // UNI-
  name: string;
  visibility: "official" | "user";     // R-GOV-03
  ownerUserId?: string;                // visibility = "user" 일 때
  summary: string;
  coreLawIds: string[];                // C0 CanonEntry IDs
  status: "draft" | "active" | "archived";
}

interface CanonEntry extends AuditMeta {
  id: string;                          // CAN-
  universeId: string;
  layer: Exclude<CanonLayer, "C2" | "C4">; // C2 = CharacterDefinition, C4 = CanonEvent 로 별도 저장
  title: string;
  statement: string;                   // 사실로 인정되는 설정 한 문장 이상
  scope?: { episodeId?: string };      // C5 는 episodeId 필수 (R-CAN-02)
  supersededBy?: string;               // append-first: 덮어쓰지 않고 후속 엔트리로 연결 (R-CAN-07)
  sourceChangeRequestId: string;       // CCR-
  status: "canon" | "superseded";
}

/** C4 — 실제로 발생한 사건. 추가(append)만 가능. */
interface CanonEvent extends AuditMeta {
  id: string;                          // EVT-
  universeId: string;
  arcId?: string;
  episodeId: string;                   // 사건이 발생한 Episode
  sceneId?: string;
  inWorldTime?: string;                // 세계관 내 시점 표기
  summary: string;
  participants: string[];              // CHR- IDs
  witnesses: string[];                 // 사건을 직접 인지한 캐릭터 (Knowledge 획득 근거, R-CAN-04)
  effects: CanonEffect[];
  sourceChangeRequestId: string;
}

type CanonEffect =
  | { kind: "character_state"; characterId: string; patch: Partial<CharacterStateMutable> }
  | { kind: "knowledge_gain"; characterId: string; knowledgeItemId: string }
  | { kind: "belief_change"; characterId: string; beliefItemId: string }
  | { kind: "relationship"; relationshipId: string; patch: Partial<RelationshipMutable> }
  | { kind: "world_truth"; statement: string }
  | { kind: "subplot"; subplotId: string; toState: SubplotState };

interface CanonChangeRequest extends AuditMeta {
  id: string;                          // CCR-
  universeId: string;
  level: CanonChangeLevel;             // §10.4
  layer: CanonLayer;
  proposedBy: ActorRef;                // AI 가능
  originEpisodeId?: string;
  summary: string;
  rationale: string;                   // 왜 이 변화가 일어나는가 (사건 기반 설명)
  isRetcon: boolean;                   // true 면 level = "critical" 강제 (R-CAN-08)
  impactAnalysis?: {                   // retcon·major 이상 필수
    invalidatedNodeIds: string[];
    affectedPublishedEpisodeIds: string[];
  };
  payload: unknown;                    // 생성·변경될 엔티티 초안
  status: "proposed" | "approved" | "rejected" | "withdrawn";
  approvals: Approval[];               // critical 은 canon_keeper + editor_in_chief 2건
}
```

### 2.1 World Truth / Knowledge / Belief 저장 원칙

- **World Truth**: `CanonEntry`(C0/C1/C3/C5) + `CanonEvent` + `CanonEffect{kind:"world_truth"}`. 캐릭터 에이전트 컨텍스트에 직접 주입 금지 (R-CAN-03).
- **Character Knowledge / Belief**: `CharacterState.knowledge[]`, `CharacterState.beliefs[]`. 획득 경로 필수.

---

## 3. Character

### 3.1 CharacterDefinition (C2 — 불변에 가까움)

```ts
interface CharacterDefinition extends AuditMeta {
  id: string;                          // CHR-
  universeId: string;
  grade: CharacterGrade;
  status: "proposed" | "canon" | "retired";

  identity: {
    name: string;
    role: string;                      // 세계 안에서의 역할/직업
    affiliation?: string;
    eraAndRegion?: string;
    appearance: string;                // 외형 특징 (이미지 생성 프롬프트의 근거)
  };

  psychology: {
    coreTraits: string[];
    values: string[];
    strengths: string[];
    weaknesses: string[];
    biasesOrLimits: string[];
    want: string;                      // 원하는 것
    need: string;                      // 실제로 필요한 것
    fear: string;                      // 피하고 싶은 것
    coreBelief: string;                // 세계를 보는 기본 믿음
    misbelief: string;                 // 이야기 속에서 깨질 수 있는 믿음
    stressResponse: StressResponse;
    pointOfView: string;
    perspectiveArchetypes: PerspectiveArchetype[]; // §11.4
  };

  narrative: {
    growthPotential: string;
    knowledgeDomains: string[];
    voice: {
      register: string;                // 말투 (존댓말/반말, 문장 길이 등)
      signatureExpressions?: string[];
      avoid?: string[];                // 쓰지 않는 표현
    };
    moralBoundaries: string[];         // 절대 하지 않는 행동
  };

  /** Guest 는 identity + psychology.want/fear/pointOfView 만 필수 (R-CHR-03, §11.5) */
}

interface StressResponse {
  primary: "confront" | "avoid" | "control" | "overreach" | "freeze" | "seek_help";
  description: string;
}

type PerspectiveArchetype =
  | "optimist" | "skeptic" | "pragmatist" | "idealist" | "risk_seeker" | "risk_averse";
```

### 3.2 CharacterState (가변)

```ts
interface CharacterState extends AuditMeta {
  characterId: string;
  universeId: string;
  asOfEpisodeId: string;               // 이 상태가 반영된 마지막 Episode

  mutable: CharacterStateMutable;
  knowledge: KnowledgeItem[];          // Character Knowledge
  beliefs: BeliefItem[];               // Character Belief
  secrets: SecretItem[];

  appearance: {
    lastAppearanceEpisodeId?: string;
    recentAppearanceCount: number;     // 최근 10개 Tier 2 Episode 기준
    leadCountRecent10: number;         // Protagonist 또는 Entry 로 등장한 횟수 = Narrative Fatigue (§11.8)
    consecutiveProtagonist: number;    // R-CHR-12
  };
}

interface CharacterStateMutable {
  currentGoal: string;
  emotionalState: string;
  location?: string;
  currentArcId?: string;
  wounds: string[];                    // 상처 (사건 기반)
  unresolvedConflictIds: string[];     // SUB- 또는 EVT- 참조
  resources?: string[];
}

interface KnowledgeItem {
  id: string;
  statement: string;                   // 캐릭터가 아는 사실 (World Truth 의 부분집합)
  acquiredVia: "witnessed" | "told" | "investigated" | "background";
  sourceEventId?: string;              // background 외 필수 (R-CAN-04)
  acquiredAtEpisodeId?: string;
}

interface BeliefItem {
  id: string;
  statement: string;                   // 캐릭터가 사실이라고 믿는 것
  isTrue: boolean | "unknown";         // World Truth 대비 (에이전트 입력에서는 제외)
  confidence: "low" | "medium" | "high";
  originEventId?: string;
}

interface SecretItem {
  id: string;
  statement: string;
  knownBy: string[];                   // CHR- IDs
  revealPlan?: { subplotId?: string; setupId?: string };
}
```

### 3.3 Relationship (C3)

```ts
interface Relationship extends AuditMeta {
  id: string;                          // REL-a-b
  universeId: string;
  characterIds: [string, string];
  label: string;                       // 예: "옛 동료", "경쟁자"
  history: string[];                   // EVT- IDs (만남·갈등·도움·배신·공동 경험…)
  mutable: RelationshipMutable;
}

interface RelationshipMutable {
  trust: { aToB: -2 | -1 | 0 | 1 | 2; bToA: -2 | -1 | 0 | 1 | 2 };
  tension: 0 | 1 | 2 | 3;
  debtsOrPromises: string[];
  hiddenInformation: string[];         // SecretItem IDs
  status: "strangers" | "acquainted" | "allied" | "rival" | "estranged" | "bonded";
}
```

---

## 4. Story

### 4.1 StoryArc & Subplot

```ts
interface StoryArc extends AuditMeta {
  id: string;                          // ARC-
  universeId: string;
  title: string;
  mainPlot: {
    centralProblem: string;
    primaryConflictType: ConflictType;
  };
  episodeIds: string[];                // 공식 순서
  subplotIds: string[];
  status: "planned" | "active" | "concluded";
  cliffhangerStreak: number;           // 연속 강한 Cliffhanger 수 (R-STRY-14)
}

interface Subplot extends AuditMeta {
  id: string;                          // SUB-
  arcId: string;
  kind: SubplotKind;
  summary: string;
  characterIds: string[];
  introducedAtEpisodeId: string;
  payoffHorizon: { minEpisodes: number; maxEpisodes: number }; // R-SUB-01
  currentState: SubplotState;
  stateHistory: { state: SubplotState; episodeId: string }[];
  trigger: string;
  possiblePayoffs: string[];
  setups: Setup[];
  deferredReason?: string;             // deferred 시 필수 (R-SUB-04)
}

interface Setup {
  id: string;                          // SET-
  description: string;
  introducedIn: string;                // Scene ID
  paidOffIn?: string;                  // Scene ID
}
```

### 4.2 Episode

```ts
interface Episode extends AuditMeta {
  id: string;                          // EP-
  tier: Tier;
  title: string;
  status: EpisodeStatus;               // §9
  productionBriefId: string;

  // Tier 2 전용
  universeId?: string;
  arcId?: string;
  arcOrder?: number;
  canonicalBranch?: string;            // 공식 Canon 이 따르는 선택 경로 (R-INT-08)
  entryStateSnapshotId?: string;
  exitState?: ExitState;

  coreQuestion: string;
  activationEvent: ActivationEvent;    // R-INT-04
  scenes: Scene[];
  interactions: Interaction[];
  knowledgeClaimIds: string[];

  publishedAt?: ISODateTime;
  magazineUrl?: string;
  approvals: Approval[];
}

type EpisodeStatus =
  | "draft" | "verified" | "approved" | "published" | "invalidated" | "archived";

interface ActivationEvent {
  name: string;                        // 예: "compound_sim_result_viewed"
  description: string;                 // 예: "자신의 조건을 입력하고 결과 확인"
  interactionId?: string;
}

interface ExitState {
  characterStateChanges: { characterId: string; patch: Partial<CharacterStateMutable> }[];
  relationshipChanges: { relationshipId: string; patch: Partial<RelationshipMutable> }[];
  newKnowledge: { characterId: string; statement: string; sourceSceneId: string }[];
  newConflicts: string[];
  resolvedConflicts: string[];
  unresolvedQuestions: string[];
  locationChanges: { characterId: string; to: string }[];
  itemOrResourceChanges: string[];
  canonChangeRequestIds: string[];     // 변경 없으면 []
  nextEpisodeHook?: string;
}
```

### 4.3 Scene / Beat (Beat Sheet)

```ts
interface Scene {
  id: string;                          // EP-xxxx/SC-n
  order: number;
  beatTypes: BeatType[];               // 한 Scene 이 여러 Beat 를 담을 수 있음
  pov: string;                         // CHR- ID 또는 "narrator"
  characterIds: string[];
  goal: string;
  opposition: string;
  knowledgeRevealed: string[];         // KC- 또는 KnowledgeItem 참조
  emotionalDelta: string;              // 예: "자신감 → 불안"
  relationshipDelta: { relationshipId: string; change: string }[];
  setupIds: string[];
  payoffIds: string[];
  interactionId?: string;
  exitHook: string;
  isStrongCliffhanger?: boolean;       // Episode 마지막 Scene 에서만 의미 (R-STRY-14)

  // Narrative Impact Graph (§7.2)
  graph: ImpactRefs;

  content?: {                          // S17 이후
    script: string;                    // 대사·행동·내레이션
    assets?: string[];                 // 이미지·영상 에셋 ID
  };
}
```

### 4.4 Interaction

```ts
interface Interaction {
  id: string;                          // EP-xxxx/INT-n
  sceneId: string;
  type: InteractionType;
  purpose: InteractionPurpose[];       // 최소 1 (R-INT-01)
  prompt: string;                      // 사용자에게 보이는 질문·지시
  options?: InteractionOption[];       // choice: 2–3 권장 (R-INT-07)
  isDecisionPoint: boolean;            // true 면 type !== "quiz" (R-INT-05)
  model?: {                            // simulation/calculator (R-KNOW-07)
    formula: string;
    assumptions: string[];
    testCases: { input: Record<string, number | string>; expected: Record<string, number | string> }[];
  };
  disclaimer?: string;                 // 투자·건강·법률 필수 (R-KNOW-06)
  fallbackText: string;                // 인터랙션 불가 환경용 요약 (R-INT-11)
}

interface InteractionOption {
  id: string;
  label: string;
  pros: string[];                      // 모든 선택지는 장단점을 가진다 (R-INT-05)
  cons: string[];
  immediateResult: string;
  deferredConsequence?: string;
}
```

### 4.5 KnowledgeClaim

```ts
interface KnowledgeClaim extends AuditMeta {
  id: string;                          // KC-
  type: "fact" | "interpretation";     // fiction 은 Canon 에 저장 (R-KNOW-02)
  statement: string;
  uncertainty: "low" | "medium" | "high";
  sources: SourceRef[];                // fact 는 1개 이상 필수 (R-KNOW-03)
  retrievedAt: ISODateTime;
  freshUntil?: ISODateTime;            // 기본 retrievedAt + 90일 (R-KNOW-05)
  sensitiveDomain?: "finance" | "health" | "legal" | null;
  verifiedBy?: ActorRef;               // fact_checker
  boundSceneIds: string[];
}

interface SourceRef {
  title: string;
  publisher?: string;
  url?: string;
  publishedAt?: string;
  accessedAt: ISODateTime;
}
```

---

## 5. Planning Artifacts

```ts
/** S01 */
interface ContentCandidate extends AuditMeta {
  id: string;                          // CC-
  origin: "external_intelligence" | "episode_seed";
  seedId?: string;                     // origin = episode_seed
  topic: string;
  coreInsight: string;
  userNeed: string;
  contentRole: ("discovery" | "authority" | "relationship" | "expansion")[];
  evidence: SourceRef[];
  freshness: "evergreen" | "timely" | "breaking";
  searchDemand?: number;
  clusterId?: string;
  relatedContentIds: string[];
  targetAudience: string;
  expectedValue: string;
  potentialExpansion: string;
  status: "new" | "evaluated" | "rejected" | "promoted";
}

/** S02 — G1 결과 */
interface EpisodeCandidate extends AuditMeta {
  id: string;                          // EP- (이후 Episode 와 동일 ID 유지)
  contentCandidateId: string;
  worthiness: {
    knowledgeValue: 0 | 1 | 2;
    narrativePotential: 0 | 1 | 2;
    humanTension: 0 | 1 | 2;
    characterRelevance: 0 | 1 | 2;
    interactionPotential: 0 | 1 | 2;
    continuityPotential: 0 | 1 | 2;
  };
  decision: "rejected" | "tier0" | "tier1" | "tier2";
  rationale: string;                   // R-PIPE-11
  approvals: Approval[];               // G1
}

/** S03–S06, S09–S11 */
interface NarrativePlan extends AuditMeta {
  episodeId: string;
  coreQuestion: string;                // R-STRY-01/02
  humanTension?: { a: string; b: string };   // Tier 2 필수
  premise?: {                          // Tier 2 필수 (R-STRY-04)
    characterRole: string;
    goal: string;
    conflict: string;
    choice: string;
  };
  worldContext?: {
    universeId: string;
    arcId: string;
    retrievedCanonIds: string[];
    retrievedEventIds: string[];
    unresolvedSubplotIds: string[];    // R-SUB-02 검색 결과
  };
  conflicts?: {
    primary: { type: ConflictType; description: string; sideA: string; sideB: string };
    secondary?: { type: ConflictType; description: string };
  };
  plot?: {
    mainPlotContribution: string;      // 이번 Episode 가 Main Plot 에서 하는 일
    subplotActions: { subplotId: string; toState: SubplotState; note: string }[];
    newSubplotProposals: string[];     // CCR- IDs (major)
  };
  beatSheetSceneIds: string[];
}

/** S07 */
interface CastingPlan extends AuditMeta {
  episodeId: string;
  roles: { role: NarrativeRole; characterId: string; reason: string }[];
  entryCharacterId: string;            // R-CAST-03
  bridgeCharacterId: string;           // R-CAST-04
  castSize: number;                    // Extra 제외 (§12.2)
  castSizeJustification?: string;      // 5명 이상 시 필수
  searchedCandidates: {                // R-CHR-09
    characterId: string;
    selected: boolean;
    reason: string;
  }[];
  newCharacters: {
    changeRequestId: string;           // CCR- (proposed CharacterDefinition)
    creationReason: ("perspective_gap" | "world_expansion" | "conflict_requirement" | "long_term_utility")[];
    removalTestAnswer: string;         // R-CHR-10 판단식 답변
  }[];
  fatigueWarnings: string[];           // R-CHR-11/12 경고
}

/** S08 */
interface SimulationLog extends AuditMeta {
  episodeId: string;
  situation: string;
  agents: {
    characterId: string;
    inputSnapshot: {                   // 해당 캐릭터가 아는 것만 (R-SIM-01)
      goal: string;
      knowledgeItemIds: string[];
      beliefItemIds: string[];
      relationshipIds: string[];
    };
    candidates: { action: string; drivenBy: string }[]; // 3개 (R-SIM-02)
  }[];
  directorSelection: {
    chosen: { characterId: string; candidateIndex: number }[];
    rationale: string;                 // R-SIM-03
    rejected: { characterId: string; candidateIndex: number; reason: string }[];
  };
}

/** S14 */
interface ContinuityPlan extends AuditMeta {
  episodeId: string;
  entryStateSnapshotId: string;        // Runtime 조회 결과 (R-CONT-02)
  plannedExitState: ExitState;
  batonPass: { type: BatonPassType; toCharacterId?: string; description: string }[];
  nextEpisodeSeedIds: string[];        // ≤ 3 (R-CONT-04)
}

/** S24 */
interface NextEpisodeSeed extends AuditMeta {
  id: string;                          // SEED-
  fromEpisodeId: string;
  batonPassType: BatonPassType;
  linkedCharacterIds: string[];
  linkedSubplotIds: string[];
  expectedCoreQuestion: string;
  summary: string;
  status: "registered" | "sent_to_intelligence" | "promoted" | "rejected" | "expired";
  contentCandidateId?: string;         // Intelligence 재평가 후 생성 (R-PIPE-08)
}
```

---

## 6. Production Brief

```ts
/** S16 — G2 승인 대상. 제작팀·AI 에이전트의 제작 SSOT */
interface ProductionBrief extends AuditMeta {
  id: string;                          // "PB-" + episodeId
  episodeId: string;
  tier: 1 | 2;
  intelligenceSourceId: string;        // CC-

  universeId?: string;
  arcId?: string;

  coreQuestion: string;
  humanTension?: string;
  narrativePremise?: string;

  casting?: {
    entryCharacterId: string;
    protagonistId: string;
    supportingIds: string[];
    bridgeCharacterId: string;
    reuse: string[];                   // 재사용 캐릭터
    new: string[];                     // 신규 (CCR-)
  };

  conflict?: { primary: ConflictType; secondary?: ConflictType };
  knowledgeMap: { knowledgeClaimId: string; sceneId: string }[];
  sceneIds: string[];
  interactionIds: string[];
  activationEvent: ActivationEvent;
  decisionPoint?: { sceneId: string; decider: "character" | "characters" | "user" | "character_and_user" };
  consequence?: { immediate: string; deferred?: string };

  continuity?: {
    entryStateSnapshotId: string;
    exitState: ExitState;
    batonPass: BatonPassType[];
    nextEpisodeSeedIds: string[];      // ≤ 3
  };

  distribution: {
    shortFormHook: string;
    magazineExperience: string;
    buildLogAngle?: "ux_failure" | "ai_generation" | "data_analysis" | "interaction_idea" | "user_reaction";
    channels: ("magazine" | "threads" | "instagram" | "shorts" | "linkedin")[];
  };

  cta: {
    primary: ContinuationTarget;       // 1개 (R-CTA-02)
    secondary?: ContinuationTarget;
    revenueLadderStage: string;        // Revenue Ladder 정의 문서 기준
  };

  fiveE: {
    entertain: { driver: EntertainmentDriver[]; answer: string };
    engage: string;
    enlighten: string;
    empower?: string;                  // Tier 2 SHOULD
    extend: string;
  };
  avac: { attention: number; value: number; agency: number; continuity: number }; // 0–5, 각 ≥ 3 (R-PIPE-03)

  successMetric: {
    icrTarget?: number;                // 0–1
    return7dTarget?: number;
    notes?: string;
  };

  deviations: { ruleId: string; reason: string }[]; // SHOULD 규칙 이탈 사유
  approvals: Approval[];               // G2
}
```

---

## 7. Verification & Impact Graph

### 7.1 VerificationReport

```ts
interface VerificationReport extends AuditMeta {
  id: string;                          // VR-
  episodeId: string;
  stage: "plan" | "draft";             // S15 | S18
  generatorRef: ActorRef;              // 원고 생성 주체
  verifierRef: ActorRef;               // generatorRef 와 달라야 함 (R-VER-01)
  extracted?: {                        // R-VER-02
    characters: string[];
    events: string[];
    knowledgeByCharacter: Record<string, string[]>;
    relationshipChanges: string[];
    citedFacts: string[];
  };
  findings: VerificationFinding[];
  result: "pass" | "pass_with_major" | "blocked";
}

interface VerificationFinding {
  verifier:
    | "canon" | "persona" | "knowledge_scope" | "causality" | "relationship"
    | "setup_payoff" | "intelligence_fact" | "interaction" | "editorial" | "safety";
  severity: Severity;
  ruleIds: string[];                   // 예: ["R-CAN-05"] (R-VER-05)
  location: { sceneId?: string; interactionId?: string };
  description: string;
  suggestedFix?: string;               // 제안만. 자동 적용 금지 (R-VER-03)
  resolution?: { status: "fixed" | "accepted" | "wont_fix"; by: ActorRef; note?: string };
}
```

### 7.2 Narrative Impact Graph 참조

```ts
/** Scene, CanonEvent, KnowledgeClaim 등에 포함 (R-VER-06) */
interface ImpactRefs {
  dependsOn: string[];                 // 이 노드가 전제로 하는 노드 ID
  affects: string[];                   // 이 노드가 영향을 주는 노드 ID
  setupIds: string[];
  payoffIds: string[];
  characterStateRefs: string[];        // "CHR-0003#knowledge:K-12" 형식
  canonEventRefs: string[];
  knowledgeClaimRefs: string[];
  invalidated?: { at: ISODateTime; causeNodeId: string }; // R-VER-07
}
```

무효화 전파 규칙:

1. 노드 X 수정/삭제 → `affects`를 따라가며 X에 `dependsOn` 하는 노드만 `invalidated` 표시 (역방향 인덱스 사용).
2. `invalidated` 노드가 속한 Episode가 `published`이면 Episode 상태는 바꾸지 않고 Canon Keeper 검토 큐에 등록 (R-VER-08).
3. 미게시 Episode는 `status = "invalidated"`로 전환 후 해당 Scene만 재설계.

---

## 8. 측정

### 8.1 이벤트 스키마

```ts
interface ContentEvent {
  name: ContentEventName;
  occurredAt: ISODateTime;
  anonymousId: string;
  userId?: string;
  sessionId: string;
  channel: "magazine" | "threads" | "instagram" | "shorts" | "linkedin" | "tutors" | "play" | "gen_studio";

  // R-MET-05 필수 컨텍스트
  contentId: string;                   // EP-
  tier: Tier;
  episodeId?: string;
  arcId?: string;
  sceneId?: string;
  characterIds?: string[];
  interactionId?: string;

  properties?: Record<string, string | number | boolean>;
}

type ContentEventName =
  // Attraction
  | "social_impression" | "social_click" | "content_view"
  // Experience
  | "interactive_start" | "interaction_engaged" | "scene_reached"
  // Completion
  | "activation_event" | "decision_made" | "content_completed"
  // Relationship
  | "content_saved" | "topic_followed" | "character_followed" | "content_shared" | "related_content_opened"
  // Continuation
  | "next_episode_opened" | "tutors_question_started" | "gen_studio_created" | "play_started" | "store_opened"
  // Return
  | "magazine_return";
```

### 8.2 EpisodeMetrics (집계)

```ts
interface EpisodeMetrics {
  episodeId: string;
  window: { from: ISODateTime; to: ISODateTime };
  attraction: { impressions: number; ctr: number; views: number };
  experience: { starts: number; startRate: number };
  completion: { activations: number; activationRate: number; sceneReach: Record<string, number> };
  relationship: { saves: number; follows: number; shares: number; relatedOpens: number };
  continuation: { byTarget: Partial<Record<ContinuationTarget, number>> };
  icr: number;                         // §26.3 정의
  return7d: number;
  return28d: number;
  decisionDistribution?: Record<string, number>; // optionId → 비율
}
```

---

## 9. 상태 머신

### 9.1 파이프라인 산출물 흐름

```text
ContentCandidate(new)
  └─ G1 ─→ EpisodeCandidate(decision)
              ├─ rejected
              ├─ tier0 → 일반 Article 제작 (이 파이프라인 종료)
              └─ tier1 | tier2
                   → NarrativePlan
                   → CastingPlan / SimulationLog     (tier2)
                   → ContinuityPlan                  (tier2)
                   → VerificationReport(stage=plan)  (tier2)
                   → ProductionBrief ─ G2 ─→ approved
                   → Episode(draft)
                   → VerificationReport(stage=draft) ─ G3
                   → Episode(verified) ─ G4 ─→ Episode(approved) → Episode(published)
                   → EpisodeMetrics
                   → CanonChangeRequest[] ─ G5 ─→ CanonEvent / CharacterState 갱신 (tier2)
                   → NextEpisodeSeed[] → ContentCandidate(origin=episode_seed)
```

### 9.2 Episode 상태 전이

| From | To | 조건 |
| --- | --- | --- |
| `draft` | `verified` | VerificationReport.result ≠ `blocked` (G3) |
| `verified` | `approved` | Editor 승인 (G4) |
| `approved` | `published` | 게시 실행 |
| `draft` / `verified` / `approved` | `invalidated` | 의존 노드 변경 (R-VER-07) |
| `invalidated` | `draft` | 영향 Scene 재설계 완료 |
| `published` | `archived` | 편집 결정 |

- `published` → `invalidated` 전이는 없다 (R-VER-08: 검토 큐로 처리).

### 9.3 CanonChangeRequest 승인 요건

| level | 필요 승인 |
| --- | --- |
| `minor` | `canon_minor` 1건 (human) |
| `major` | `canon_major` 1건 (canon_keeper) |
| `critical` | `canon_critical` 2건 (canon_keeper + editor_in_chief) |

---

## 10. 컬렉션 매핑 (권장)

| 컬렉션 | 엔티티 | 주요 인덱스 |
| --- | --- | --- |
| `universes` | Universe | `visibility`, `ownerUserId` |
| `canon_entries` | CanonEntry | `universeId+layer`, `status` |
| `canon_events` | CanonEvent | `universeId+episodeId`, `participants` |
| `canon_change_requests` | CanonChangeRequest | `status+level`, `originEpisodeId` |
| `characters` | CharacterDefinition | `universeId+grade+status` |
| `character_states` | CharacterState | `characterId` (unique), `appearance.leadCountRecent10` |
| `relationships` | Relationship | `characterIds` |
| `story_arcs` | StoryArc | `universeId+status` |
| `subplots` | Subplot | `arcId+currentState` |
| `content_candidates` | ContentCandidate | `status`, `origin` |
| `episode_candidates` | EpisodeCandidate | `decision` |
| `narrative_plans` / `casting_plans` / `continuity_plans` / `simulation_logs` | 각 Plan | `episodeId` |
| `production_briefs` | ProductionBrief | `episodeId` (unique) |
| `episodes` | Episode (+ scenes, interactions 임베드) | `status`, `arcId+arcOrder`, `tier` |
| `knowledge_claims` | KnowledgeClaim | `freshUntil`, `boundSceneIds` |
| `next_episode_seeds` | NextEpisodeSeed | `status`, `fromEpisodeId` |
| `verification_reports` | VerificationReport | `episodeId+stage` |
| `impact_reverse_index` | `{ nodeId, dependentIds[] }` | `nodeId` — 무효화 전파용 역인덱스 |
| `content_events` | ContentEvent (시계열) | `contentId+name+occurredAt` |

- 공식 Universe와 사용자 Universe는 같은 컬렉션을 쓰되 모든 조회에 `universeId` 필터를 강제한다 (R-GOV-03).
- Tutors·Play 서비스 계정은 Narrative Runtime 컬렉션에 **읽기 전용** 권한만 가진다 (R-GOV-01/02).
