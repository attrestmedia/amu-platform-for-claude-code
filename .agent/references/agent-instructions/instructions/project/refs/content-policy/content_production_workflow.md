# 콘텐츠 제작 워크플로우 (Evidence-first + Mode Isolation + Variation Build-up)

> **상위 기준**: 사업 정의는 `.agent/amu-platform-guide/BUSINESS-CHARTER.md`, 마케팅 목적·R 라우팅·캠페인·주장(claim) 검증·자동화 권한 등급은
> `.agent/amu-platform-guide/MARKETING-STRATEGY.md`(항상 최신 버전 — 특정 버전을 하드코딩하지 않는다)가 단일 기준이다.
> 본 문서는 그 기준을 **콘텐츠 산출물 규격과 QA 절차로 실행**하는 문서이며, 충돌 시 정본이 우선한다.

## 목적

- 장기 SEO + 브랜딩을 통해 `allmyuniverse.com` / `app.allmyuniverse.com`의 방문자와 구독자(가입/팔로우/구독) 증가
- 검색 유입 활성화: 네이버 블로그 SEO + 구글 검색 최적화

## 콘텐츠 입력 소스(반드시 1개 이상)

- WP 글(자기계발/비즈니스)
- All My Universe 앱의 서비스 관련(기능/프리셋/튜토리얼/사례)
- 네이버 기존 글

> WP 글은 source-based adaptation 또는 운영 판정용 소스다. **같은 WP URL 리뉴얼은 원문과 축적 지식을 모두 읽고 전면 재작성해 교체 등록한다.** 상세 절차는 아래 "WP → WP 같은 URL 리뉴얼 절차"를 따른다.

> **매거진 기사 작성 기준은 신규·리뉴얼이 동일하며 정본은 `magazine_knowledge_article.md` 하나다 (2026-09-04 확정).** 아래 문서가 역할을 나눠 소유하며 같은 규칙을 복제하지 않는다.
>
> | 문서 | 소유 범위 |
> | --- | --- |
> | `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md` | **매거진 기사 작성 정본** — 문체·Question DNA·Cold Open·9축·H1/seoTitle·SEO·커버·이미지·링크·지식 계층·출력 JSON |
> | `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md` §"WP → WP 같은 URL 리뉴얼 절차" | WP → WP 교체 절차 — 원문 진단·전면 재작성·실질 개선 판정·컨트롤러 결합·같은 URL 등록 (2026-09-05 `article_renewal.md` 폐기·통합) |
> | `{{AGENT_ROOT}}/refs/content-policy/app_post_draft.md` | **App 경험형 기사**(node-app `/magazine/{slug}`) 초안 — 매거진 기사와 별개 산출물 |

## 작업 원칙

- 게시용 콘텐츠는 소스 링크/슬러그를 반드시 포함(메타에 기록). 단, `wp_to_wp_replace`의 `slug`·`postId`·`category`는 운영 컨트롤러가 교체 등록 시점에 결합하며 writer 산출물에는 넣지 않는다.
- 소스 없이 “그럴듯한 글” 생성 금지 — **사실층에 적용된다.** AMU 자체 소재의 서사 프레임(편집층)은 에이전트가 설계하며, 근거 등급과 표현 규칙은 아래 “제작 서사 자체 기획” 절을 따른다
- 동일 소스 채널별 복붙 금지(채널 독자 관점으로 재구성)
- marketing-ops 작업은 본문 생성 전에 `prepare_local_generation` 응답의 `contentFitStrategies`로 유니버스별 전략과 버전을 확인하고 `{{AGENT_ROOT}}/refs/marketing-guide/*`를 함께 참고한다. 응답에 `fitStrategiesError`가 있을 때만 `get_content_fit_strategies`를 1회 호출한다.
- 생성/발행 전 콘텐츠 로그(`.agent/content/content-ledger.jsonl`)에서 중복 여부(특히 Git 소스)를 먼저 확인하고, 생성/발행 후 항목을 추가한다 (아래 `콘텐츠 생성/발행 로그(중복 방지)` 참조)
- 소셜 콘텐츠에는 항상 독자를 위한 유용한 정보, 팁 등을 포함

## Question-first · Discovery Packet (2026-08-24 신설)

콘텐츠 후보는 기사(답)부터 시작하지 않는다. 사람이 지나칠 수 없는 질문을 먼저 발견한다.

```text
현상 발견 → 질문 설계 → 핵심 원리 → 짧은 콘텐츠 → Magazine 심화 → 관련 콘텐츠
```

### Discovery 후보 7문항 게이트

새 Discovery 콘텐츠는 7문항을 평가한다(Familiarity / Surprise / Question / Mechanism / Visual / Utility / Cluster):

```text
6~7개 → 강력한 Discovery 후보
4~5개 → Magazine/검색 콘텐츠
0~3개 → 우선순위 하향
```

상세는 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md` §13~§18, 채널별 적용은 `{{AGENT_ROOT}}/refs/content-policy/social_media_tone.md`의 "Question-Discovery 채널 톤"을 따른다.

### Discovery Packet (1 Idea → 다중 표면 → 1 Magazine Hub)

성과 가능성이 높은 콘텐츠는 `Main Article + Short + Threads + Instagram + Related` 묶음으로 계획한다.

- 모든 채널 의무 제작 금지: Pre-Fit 통과분만 제작한다.
- 동일 본문 복제가 아니라 채널 역할별 재구성이다.
- Shorts/Reels는 시각화 가치가 확인된 소재에만 적용한다.

### Hook Type 기록

모든 Discovery 실험에 `hookType`·`questionType`·`contradictionType`·`visualType`을 메타로 기록한다(목표: AMU 독자가 어떤 질문에서 멈추는지 학습).

### Question DNA (신규 콘텐츠 게이트, 2026-08-24)

신규 콘텐츠 후보마다 작성 전에 Question DNA를 확인한다.

```text
Who → Desire → Obstacle → Question
```

다음 7문항 중 1~5가 불명확하면 작성 전에 다시 검토한다:

1. 이 주제를 실제로 궁금해하는 사람이 있는가
2. 그 사람은 무엇을 원하는가
3. 무엇이 방해하고 있는가
4. 기대와 현실 사이에 의미 있는 차이가 있는가
5. 한 문장 질문이 존재하는가
6. AMU가 더 좋은 답을 줄 수 있는가
7. 기존 AMU 콘텐츠와 클러스터를 만들 수 있는가

본문 전개(Question Loop)·Tension Taxonomy는 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md` §19~§21을 따른다.

---

## Content Experience Brief (신규 콘텐츠·리뉴얼 착수 게이트, 2026-08-26 신설)

본문을 쓰기 전에 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`의 **Content Experience System**에 따라 brief를 먼저 확정한다.

```text
Research
→ Curiosity Design
→ Story / Episode Design
→ Article Generation
```

필수 항목:

```text
contentRole
primaryArchetype
supportingArchetype(optional, 최대 1개)
experienceLevel (story | enhanced | interactive)
primaryQuestion
thesis
memorableInsight (독자가 자기 말로 다시 꺼낼 한 문장 발견)
nextQuestion (답을 얻은 뒤 실제로 생기는 다음 호기심)
questionDNA { who, desire, obstacle, question }
episodes[] { sectionId, curiosityType }                    ← App 경험형 기사 전용
interactionSlots[] { slotId, sectionId, intent, staticFallback, candidateModule }   ← App 경험형 기사 전용
articleExperience { slots[] { slotId, sectionId, interactionRole, intent(enum), moduleType, staticFallback, allowedProps(optional) }, returnSectionId }   ← App 경험형 기사 전용
coldOpen { problem, scene, tension }
heroLine (제목이 약속한 것을 한 줄로 좁힌 편집 카피)
coverArtDirection { grammar(portrait|still_life|conceptual|documentary|graphic), scene, tension, textPolicy }
expansion { service, contextKey, entrySectionId, returnSectionId } (optional)
qualityEvidence { curiosity, surprise, evidence, participation, payoff, utility, memorability, continuation, voice }
```

### 기사의 주어 (2026-08-27 신설, 최우선)

**기사의 주어는 독자의 문제다.** AMU·서비스·팀의 작업 과정은 그 문제에 답하기 위한 **증거**로만 등장한다.

```text
X   AMU 사례 → 일반 원리                     (제작 기록)
O   독자 문제 → 일반 원리 → AMU도 같은 문제를 만났다
```

- 제작 순서를 그대로 따라가는 시간순 서술은 기본 구조가 아니다. 시간순은 AMU가 겪은 순서일 뿐 독자가 궁금해하는 순서가 아니다.
- **AMU 자체 소재(운영 에피소드·`TASK-CREATION-LOG`·AMU Stories)도 예외가 아니다.** 오히려 이 계열이 제작 기록으로 흐르기 가장 쉬우므로 더 엄격히 적용한다.
- **AMU 제거 테스트**: 각 Episode에서 AMU·서비스명·내부 시스템 이름을 전부 지웠을 때도 질문과 발견이 성립해야 한다. 성립하지 않으면 그 Episode는 아직 제작 기록이므로, 누구에게나 적용되는 문제를 먼저 세우고 AMU 사례를 증거로 붙이는 순서로 다시 쓴다.
- 이 테스트를 통과한 Episode만 숏폼·소셜 재가공 후보가 된다. AMU 내부 맥락을 먼저 설명해야 성립하는 Episode는 채널에서 작동하지 않는다.

### 한 기사 = 한 중심 질문

- 모든 Episode는 `primaryQuestion`에 답해야 한다. 소재로는 흥미롭지만 중심 질문에서 벗어나는 구간은 **삭제하고 별도 기사 후보로 기록한다.**
- 두 개의 콘텐츠를 한 기사에 섞으면 독자가 "지금 무엇을 읽고 있는지" 잃는다. 분량을 채우려고 인접 소재를 끌어오지 않는다.
- 시리즈 형식의 연결 글도 예외가 아니다. 제목과 본문은 하나의 주제를 가진 하나의 완전한 글이어야 하며, 이전·다음 편 없이 핵심 질문의 답·근거·적용 기준이 완결돼야 한다.
- 결론에서는 `thesis`를 제목의 질문과 연결해 회수한다. 마지막 섹션이 새 주제로 흩어지지 않아야 한다.

### 실행 규칙

- 신규 기사의 기본은 E1 Story다. E2 Enhanced·E3 Interactive는 성과와 사업 적합성이 확인된 콘텐츠 또는 명시적인 Reference Implementation에만 적용한다.
- 일반 E1의 **필수 기능**은 `Question`·`Evidence`·`Tension 또는 Discovery`·`Application/Payoff`다. `Assumption`·정적 `Experience`·`Memorable Insight`·`Next Question`은 강한 권장이며, `Trust/Limit`·E2/E3·서비스 연결은 기사 목적상 필요할 때만 쓴다. 짧은 뉴스·즉답형 Utility처럼 권장 기능을 생략하는 편이 더 정확한 유형은 `qualityEvidence`에 `not_applicable`과 이유를 남길 수 있다.
- `Question → Evidence → Tension → Discovery → Experience → Application → Next Question`은 독자 심리 기능의 전체 지도이지, 모든 기사에 7단을 같은 순서·분량으로 강제하는 최소 목차가 아니다. WP → WP 전면 재작성 교체 리뉴얼만 별도 규칙에 따라 9축 모두의 구체 근거를 요구한다.

| 단계 | 독자 심리 기능 | 작성 기준 |
| --- | --- | --- |
| Question | ‘내 일’로 읽을 이유를 만든다 | 해결해야 할 실제 질문을 한 문장으로 세운다. 제목·첫 문단은 답을 과장하지 않는다. |
| Evidence | 추측 대신 믿고 볼 이유를 준다 | 데이터·관찰·사례를 **설명보다 먼저** 제시하고 출처·한계를 붙인다. |
| Tension | 계속 읽을 인지적 마찰을 만든다 | 독자의 합리적 기대와 검증된 현실이 실제로 충돌해야 한다. 꾸민 갈등·답 숨기기는 금지다. |
| Discovery | ‘그래서 그렇구나’라는 이해의 보상을 준다 | 근거가 바꾼 판단을 명료하게 해석한다. |
| Experience | 독자가 자기 판단을 시험하게 한다 | `판단 대상 → 판단할 틈 → reveal` 순으로 배치한다. 표·요약만으로 대체하지 않는다. |
| Application | 발견을 자기 상황에 옮길 방법을 준다 | 조건·한계를 포함한 실행 기준을 제공한다. |
| Next Question | 답 이후의 실제 호기심으로 다음 읽기를 만든다 | 관련 글 목록이 아니라, 방금 얻은 답이 낳는 미해결 질문을 남긴다. |

- `Hook Strength ≤ Answer Strength`를 지킨다. 훅보다 약한 결론·근거는 신뢰를 잃게 하므로 다시 설계한다.
- 같은 ‘3초 생각’, ‘정답은’, ‘하지만’ 같은 고정 문구로 Experience나 reveal을 만들지 않는다. 모든 H2를 질문형으로 통일하지도 않는다. 문장 부호가 아니라 증거와 긴장이 기능을 수행해야 한다.
- H2/H3는 정보 분류명이 아니라 하나의 질문과 발견이 끝나는 Episode로 설계한다.
- E1의 Experience는 정적 비교·선택·예측·체크리스트로 충분하다. 미구현 UI를 본문에 노출하지 않는다.
- E2/E3 후보라도 Primary interaction은 1개, Supporting interaction은 1~2개까지만 둔다.
- 서비스는 카테고리로 자동 연결하지 않는다. 기사당 Primary 서비스는 1개만 허용하며, 서비스 없이도 본문의 답이 완결돼야 한다.
- Pilot 연동은 `SERVICE-ROLE-MAP.md`의 allowlist·feature flag·정적 fallback·fail-closed 게이트를 통과한 기사 기능으로만 다룬다.
- `expansion.returnSectionId` 없이 Magazine 밖으로 보내는 단방향 경험은 만들지 않는다.
- **커버는 Brief 단계에서 정한다.** `coverArtDirection`의 `grammar`·`scene`·`tension`을 본문 집필 전에 채운다.
  전략 기준은 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`의 "Editorial Cover System",
  작성 규칙은 `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md`의 "커버(썸네일) 작성 규칙"을 따른다.
- **내부 설계 언어를 독자 화면에 노출하지 않는다.** `Article Experience`·`Interaction Slot`·`E1/E2/E3`는
  내부 메타 전용이고, `primaryQuestion`은 독자에게 그대로 보이는 문장이다 —
  `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`의 "독자 노출 표면".
- `interactionSlots`는 편집용 후보이고, WordPress 등록용 `articleExperience` projection은 별도다. E1은 최대 3개의 `static` slot과 정적 fallback을 사용하며, E2/E3 native module만 canonical `allowedProps`를 포함한다. `postId`·`postSlug`·`contractType`·`schemaVersion`은 MCP가 실제 WordPress post에 맞춰 결합한다.
- `qualityEvidence`의 9축은 이름만 채우지 않는다. 각 축마다 본문 안의 구체 위치·근거를 한 줄로 기록한다. 일반 기사는 짧은 뉴스·Utility 등 기사 유형상 권장 요소를 생략할 때 `not_applicable`과 이유를 기록할 수 있다. WP → WP 리뉴얼은 9축 모두에 구체 근거가 없으면 통과하지 못한다.

성과가 확인된 글은 예약된 슬롯을 모듈로 교체하는 `Experience Upgrade`로 승격할 수 있다. 이는 같은 URL의 WP 리뉴얼이 아니라 모듈 실험이며, WP → WP 리뉴얼이 요청되면 이 예외가 아닌 아래 "WP → WP 같은 URL 리뉴얼 절차"의 전면 재작성 교체가 우선한다. Search Demand·Consumption·Relationship·Business Fit이 약하면 E1에서 끝내며, 낮은 성과를 비싼 인터랙션으로 보완하지 않는다.

---

## AMU Reality Lens (편집 세계관, 2026-08-27 신설)

정책 정본은 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`의 "AMU Reality Lens" 절이다. 이 룰은 실행 규약만 적는다.

**Magazine의 Canon은 Reality다.** Lens는 허구 설정이 아니라 현실을 시스템으로 해석하는 편집 관점이며, 사실을 바꾸는 권한이 아니다.

- 사실(관측·수치·발표·인용)은 변형 금지. 해석은 근거 범위 안에서, 은유는 자유, 시뮬레이션은 가정 명시 시에만 허용한다.
- **은유가 실제 메커니즘과 어긋나면 폐기한다.** 비유가 독자에게 틀린 인과를 심으면 Lens가 아니라 오보다. 은유를 쓴 문단마다 원리와의 정합성을 확인한다.
- 은유는 문단마다 흩뿌리지 않고 **한 곳(`anchorSectionId`)에 집약**한다.
- 제목·`seoTitle`·slug·메타 설명에는 Lens 용어를 쓰지 않는다. 검색 의도는 정상 표기가 담당한다.
- 노출 강도는 기사 유형을 따른다 — 일반 검색·Utility 10~20%, Authority·Mechanism 20~40%, Interactive Story·특집 50~70%.
- 금융·투자·세무·의료·법률 소재(Charter R4 고정)는 Lens를 설명 보조로만 쓰고 시뮬레이션에 가정·한계를 표기한다.
- `realityLens { world, intensity, anchorSectionId }`는 **선택 메타**다. 필수 Brief 항목이 아니며 누락을 이유로 `blocked` 처리하지 않는다.
- **Lens를 적용했으면 `content-ledger.jsonl` 항목에 `realityLens: { world, intensity, applied }`를 함께 기록한다.** Brief 메타는 WordPress에 저장되지 않으므로(WP로 가는 값은 본문 필드와 Yoast 3키뿐) ledger 기록이 적용·미적용을 구분하는 유일한 추적 수단이다. 이 기록이 없으면 Lens의 효과 비교와 게이트 승격 판정이 불가능하다.
- **현재 Lens는 검증 단계다.** 품질·SEO·임베드 계약의 하드 게이트가 아니다. 효과가 실측으로 확인되면 그때 게이트로 승격한다.
- 금지: `Universe`·`Player`·`Quest`·`Level`·`NPC` 같은 게임 용어를 독자에게 보이는 제목·소제목에 노출하는 것. 근거 부족을 은유로 덮는 것.

## 산출물(1 소스 -> 3~4 채널) 표준

- 네이버 블로그: 1,000~2,000자, H2 3~6개, 체크리스트 1개, 마지막 정보 공유 정리 및 요약
- 링크드인: 500~900자, 번호 리스트 3~5개, 마지막 질문 1개
- 스레드: 단독(150~500자) 또는 1/5 시리즈. 본문 형식은 `{{AGENT_ROOT}}/refs/content-policy/social_media_tone.md`의 "줄바꿈 규격"을 따른다(줄 40자 이하, 문단 1~2줄). 해시태그는 별도 `hashtags` 입력란에만 저장하고 본문에는 넣지 않는다.
- 인스타그램: 기본 후보 채널 — Pre-Fit 적합 시 캡션 draft + 카드뉴스 구성안 또는 30~60초 릴스 스크립트 생성. **이미지는 기존 자산만 재사용하고 새로 생성하지 않으며(2026-08-06 사용자 지시), 카드뉴스 장수는 확보한 자산 수에 맞춘다**(`channel_fit_scoring.md` instagram 항목). marketing-ops 지원 채널이므로 enqueue `channels`에 포함해 draft를 등록하고, 이미지는 `apply_channel_action(attach_image)`로 첨부(이미지 없이 완료 처리 금지). 카드뉴스/릴스 구성안 등 보조 산출물은 기존대로 `.agent/content/articles/social/instagram/`에 보관하고(디렉터리 미생성 — 최초 저장 시 만든다), 최종 발행 확정은 사용자가 검수 UI에서 진행 (사후 채점·ledger 기록은 동일 적용)

## 필수 메타데이터(매 콘텐츠 세트에 포함)

- 소스(링크/슬러그/제목):
- 캠페인(campaignId): `cmp-YYYYMM-<slug>` 또는 `none`(상시 자산인 경우 사유 1줄) — 정의: Charter §8
- 콘텐츠 분류: Layer 1(WP 자기계발/비즈니스) | Layer 2(Gen Studio)
- 브랜드 축(Primary): Gen Studio | Tutors | All My Universe Game
- 목표 전환(Primary):
  - `allmyuniverse.com` 방문 |
    Gen Studio 체험(`app.allmyuniverse.com/gen-studio`) |
    Tutors 체험(`app.allmyuniverse.com/tutors`) | 
    All My Universe 게임 체험(`app.allmyuniverse.com`) |
    채널 구독
- 콘텐츠 R 등급: R0(관계 행동 직결) | R1(기사 맥락의 확장 경험 직결) | R2(확장 간접 — 관계 CTA로 대체) | R3(미공개 서비스 브랜딩) | R4(일반 유입)
  - 판정은 **Charter §5 R 라우팅 표**를 따르고, 메타에 "라우팅 표의 어느 행에 해당하는지" 1줄을 남긴다. 금융·투자·세무·의료·법률 소재는 R4 고정(확장 CTA 금지).
  - **확장 CTA는 기사 맥락을 반드시 동반한다**(Charter §5.3). 맥락 없는 범용 CTA는 R1로 인정하지 않는다.
- 서비스 상태 표기: 운영 중 | 출시 후 고도화 중 | 출시 예정 | 내부 실험
- 타겟 독자(1명):
- 핵심 1문장:
- 근거(링크/데이터) 또는 "추정":
- CTA(1개):
- 링크(최대 2개): WP 1 + App 1 (단, 본문 링크는 1개만; 나머지는 프로필/댓글로 유도)
- 콘텐츠 경험 메타: `contentRole` / `primaryArchetype` / `supportingArchetype` / `experienceLevel` / `primaryQuestion` / `thesis`
- 기억·연속성 메타: `memorableInsight` / `nextQuestion` — 다음 글 링크의 설명이 아니라, 답 뒤에 남는 독자의 실제 다음 호기심을 적는다
- Episode/Slot: `episodes[]` / `interactionSlots[]` (정적 fallback 필수) — **App 경험형 기사 전용이다 (2026-09-04).** 순수 매거진 기사는 구조화 `body[]`가 없어 `sectionId`가 대응할 앵커 자체가 없으므로 세 필드를 쓰지 않는다. Episode 설계는 본문 소제목으로 표현하고 결과는 `qualityEvidence`로 확인한다
- 품질 근거: `qualityEvidence`의 Curiosity / Surprise / Evidence / Participation / Payoff / Utility / Memorability / Continuation / Voice 9축별 본문 위치·근거
- 확장 경험(선택): Primary 서비스 1개 / `contextKey` / `entrySectionId` / `returnSectionId` / `productMaturity` / `magazineExposure`

## 바리에이션 빌드업(필수)

- 소스 1개당 최소 3개의 파생 아이템을 계획
  - 예: 요약(Threads) / 체크리스트(LinkedIn) / 상세 가이드(Naver)
- `{{AGENT_ROOT}}/skills/social-content` 스킬 출력에는 “후속 변형 아이디어 3개”를 반드시 포함

## WP/네이버 기존 글 리라이팅 규칙

- 리라이팅은 "사용자가 제시한 URL/제목"만 대상으로 한다. (WP 포스트 및 네이버 블로그 모두 해당)
- **WP → WP 같은 URL 리뉴얼**은 아래 "WP → WP 같은 URL 리뉴얼 절차"를 따른다. 원문·성과 신호·축적 지식·기존 자산을 모두 읽고 원문 진단을 먼저 수행한 뒤, 새 근거로 보강한 새 Brief에서 전면 재작성한 원고로 기존 URL을 교체 등록한다. 원문 문단을 부분 수정해 갱신하지 않는다.
- **WP → 네이버/소셜 및 네이버 → 네이버/소셜**은 source-based adaptation이다. 원문을 채널 문법에 맞춰 압축·재구성하는 모드이며, 같은 URL 교체 리뉴얼에는 이 압축·재구성 기준을 적용하지 않는다.
- 리라이팅 요청이 없을 경우, 기존 글은 감사(audit)만 수행하고 수정 제안은 후보로만 제시
- **작성 기준 자체는 신규와 같다.** 리뉴얼이라는 이유로 품질 기준을 낮추거나 별도 문체·구조를 쓰지 않는다. 아래 "WP → WP 같은 URL 리뉴얼 절차"가 정하는 것은 절차이며, 작성법은 `magazine_knowledge_article.md`가 소유한다.

## WP → WP 같은 URL 리뉴얼 절차 (전면 재작성 교체 · 2026-09-05 `article_renewal.md` 통합)

같은 URL의 리뉴얼은 낡은 문단을 손보거나 덧붙이는 일이 아니다. **원문과 그동안 축적한 지식을 모두 읽고, 같은 주제를 지금 기준으로 전면 재작성한 기사를 기존 URL에 교체 등록**한다. 이 절은 WP → WP 같은 URL에만 적용한다. WP → 네이버·소셜과 네이버 원문의 채널 전환은 source-based adaptation이며 별도 모드다.

> **작성 기준은 신규와 동일하다.** 문체·구조·9축·SEO·커버·지식 계층·출력 JSON의 정본은 `magazine_knowledge_article.md` 하나다. 이 절은 입력 구성·전면 재작성·실질 개선 판정·컨트롤러 결합·교체 등록·발행만 정한다. 리뉴얼 전용 작성 기준을 만들지 않는다.
>
> **2026-09-04 개정 — writer 격리 규칙 폐지.** 종전 `wp_to_wp_replace`는 writer에게 topic 한 줄만 넘기는 격리 모드였다. Intelligence Pattern System 전환 후에는 축적 지식을 다음 기사에 재사용하는 것이 전략의 핵심이므로, 격리 게이트·독립 리서치 강제·independence reviewer 원문 대조는 제거했다. 대신 전면 재작성 요건과 실질 개선 판정이 품질을 담보한다.

### 대상 선정 우선순위 (2026-08-27 신설)

리뉴얼 대상은 큐 파일 순서대로 집지 않는다. `.agent/content/articles/queue/magazine/links.csv`의 GSC 컬럼으로 판정한다.

```text
1순위  gsc_strength = strong
2순위  gsc_impressions > 0  (gsc_signal = impression)
3순위  나머지 — 큐 기본 순서
```

- **클릭(`gsc_clicks_*`)은 우선순위 기준이 아니다.** 실측에서 큐 클릭이 전건 0이라 이 표본으로 "반응이 좋았던 주제"를 정의하면 노이즈에 최적화된다.
- 같은 순위 안에서는 `gsc_position`이 좋은(작은) 순, 그다음 큐 기본 순서.
- 노출 신호가 있는데 클릭이 0인 기사는 제목·메타 설명 문제일 가능성이 크다 — `title`·`seoTitle`·`seoDescription`을 특히 점검한다.
- 선정 근거(적용 순위와 `gsc_strength`·`gsc_impressions`·`gsc_position`)를 보고에 1줄 남기고, 성과 신호·선정 근거를 writer에게 전달한다.

### `internal_inbound_links` 컬럼 (2026-09-05 정정)

`G-MIR-03`·원장 `dispositionContract.gates`가 요구하는 내부 링크 영향 판정의 입력이다. **대상 글을 가리키는 서로 다른 발행 글/페이지의 수**로 정의한다.

- self-link·한 글의 중복 링크·루트 1단(`/slug`) 외 경로(카테고리/태그/wp-content)는 제외. 끝 슬래시·http/https·절대/상대를 같은 대상으로 정규화한다.
- **값은 스냅샷이다.** 글이 발행·정리되거나 본문 링크가 바뀌면 즉시 낡는다. 301·410·삭제 판정 전에는 반드시 재산출한다.

```bash
python3 web-automation-project/wp_mng/post_utils/internal_link_graph.py \
  --update-csv .agent/content/articles/queue/magazine/links.csv --apply
```

### 모드 판정과 착수 게이트

1. 같은 WP URL을 갱신하는 일인지 먼저 판정한다. 맞으면 이 절의 `wp_to_wp_replace` 모드를 쓴다.
2. 원문·축적 지식을 읽지 않고 착수하지 않는다. topic이 한 문장으로 확정되지 않거나 원문을 조회할 수 없으면 `blocked`로 보고한다.

```text
operationalManifest (등록·복구용)   slug / postId / category        ← 컨트롤러가 보관·결합
writerInput (전면 공개)              원문 전체 / 성과 신호 / 축적 지식 /
                                     기존 자산 / 승인된 Intelligence Pattern
```

- `slug`·`postId`·`category`는 컨트롤러가 교체 등록 시점에 결합한다. writer 산출물에는 넣지 않는다.
- **`category`는 대상 WordPress taxonomy에서 실제 조회한 하위 카테고리 slug 1개다.** 최상위 카테고리를 쓰거나 상위+하위를 함께 넣지 않는다. 로컬과 운영은 각자 taxonomy를 조회해 ID를 별도로 해석하고, 미등록 slug·부분 일치·추정 alias를 쓰지 않는다. 리뉴얼에서 기존 카테고리를 그대로 유지할 때는 `category`를 **생략**한다(지정하지 않으면 WordPress 기존 값이 보존된다). source of truth와 차단 기준은 `magazine_knowledge_article.md`의 "카테고리 구조와 카테고리 slug"를 따른다.
- 원문과 축적 지식은 writer의 정상 입력이다. **읽지 않고 착수하지 않는다.**

### 원문 진단 → 리서치 → Brief → 집필 → 품질 게이트 → 교체 등록

1. **원문 진단** — 시점 주장·수치·가격·UI·제품명이 지금도 사실인가, 근거·출처가 유효한가, 핵심 질문이 검색 의도와 맞는가, 빠진 조건·한계·반례·메커니즘은 무엇인가. **원문의 사실은 검증 대상이지 인용 대상이 아니다.** 진단 결과를 3~5줄 남긴다 — 이후 실질 개선 판정의 기준이다.
2. **리서치** — 원문 사실·출처 재검증 + 새 근거·1차 자료 보강 + 축적 지식(content-insights·customer-objections·승인 Pattern) 조회. 원문에 없던 메커니즘·조건·한계·반례를 최소 하나 이상 추가한다. 같은 정보를 다시 배열한 결과물은 리뉴얼이 아니다. 리서치가 원문을 넘지 못하면 `blocked`로 종료한다.
3. **Brief** — `content_production_workflow.md`의 Content Experience Brief와 `magazine_knowledge_article.md`의 작성 규칙을 그대로 따른다. §1 진단 결과를 반영하고, 원문의 H2 순서를 그대로 두고 문장만 바꾸는 설계는 전면 재작성이 아니다 — 구조는 새 `primaryQuestion`에서 도출한다.
4. **집필** — 본문·SEO 문구·이미지 계획을 새 Brief 기준으로 처음부터 쓴다. **원문 문장을 그대로 옮기지 않는다.** 살릴 내용도 새 구조·새 근거 위에서 다시 쓴다.
5. **품질 게이트** — 9축 정의·통과 기준은 `magazine_knowledge_article.md`가 소유한다. 리뉴얼에만 추가되는 것은 **실질 개선 판정**이며 **집필자와 분리된 quality reviewer**가 수행한다(agent-orchestration.md §9). 숫자 점수만 있는 평가는 미통과다.
   - 원문의 낡은 사실·수치·시점 주장이 전부 정정되거나 제거됐는가
   - 원문에 없던 메커니즘·조건·한계·반례가 실제로 추가됐는가
   - 구조가 원문 목차를 답습하지 않고 새 `primaryQuestion`에서 도출됐는가
   - 원문 문장이 그대로 남아 있지 않은가
6. **교체 등록** — `internalLinkIntents`에 맞는 실제 내부 링크 결합(self-link 금지) → `freshImageBrief`에 맞는 이미지 결합(재활용은 권리·사실 일치·역할 수행·낡은 수치 없음일 때만, ALT·캡션 재작성). **캡션은 결합하는 이미지를 실제로 판독한 뒤 쓰고, 지칭한 사물이 이미지에 존재하는지 대조한다**(`magazine_knowledge_article.md` 규칙 5의 캡션 작성 문법). 이 단계는 품질 게이트 이후라 별도 검토자가 없으므로 컨트롤러가 직접 확인한다 → 커버는 본문 이미지와 별도로 `CONTENT-INTELLIGENCE.md` "Editorial Cover System" 기준으로 판정 → 통과한 새 원고에만 `updateExistingBySlug: true`로 같은 URL 교체 등록(카테고리 운영값 복구).

### 등록 전 SEO·캡션 프리플라이트 (2026-09-11 신설)

**교체 등록 전에 로컬 파일로 먼저 검사한다.** 등록은 라이브 글을 draft로 강등시키므로, 등록한 뒤에
게이트에 걸리면 그 글은 draft인 채로 오프라인에 남는다. 프리플라이트는 로컬 `.md`만 읽고 WordPress를
건드리지 않으므로 실패해도 라이브에 영향이 없다.

```text
1  analyze_article_seo(filePath)        로컬 파일 기준 게이트 전항 확인
2  requiredChecks 실패 항목 수정         캡션 실패는 hasCleanImageCaption
3  1~2를 최대 3회 반복
4  통과하면 교체 등록으로 진행
```

- **캡션 재작성 루프** — `hasCleanImageCaption`이 `false`면 `issues`에 위반 캡션 원문과 사유
  (`이미지를 서술하는 표현(보인다)이 있습니다` / `완결된 문장으로 끝나지 않습니다`)가 그대로 나온다.
  그 근거로 **캡션만** 다시 쓴다. 본문·링크·메타는 건드리지 않는다.
- **시도 한도는 3회다.** 무한 재시도는 하지 않는다(`agent-orchestration.md` §8.1).
  이 루프는 원인이 이미 특정돼 있고 외부 의존이 없는 국소 수정이라 3회면 충분하다 —
  원인 불명 상태의 반복 재검증과는 다르다.
- **3회에도 통과하지 못하면 그 기사만 건너뛴다.**
  - 교체 등록을 시작하지 않는다. 라이브 글은 손대지 않은 채 그대로 유지된다.
  - 큐에서 제거하지 않는다. 다음 사이클에서 다시 집는다.
  - `blocked` 사유와 마지막 캡션·게이트 메시지를 기록하고 **다음 큐 항목으로 진행한다.**
    한 기사의 캡션 실패로 리뉴얼 큐 전체를 멈추지 않는다.

### 발행 — 같은 작업 단위에서 끝낸다 (2026-09-04 신설)

등록은 라이브 글을 draft로 강등시키므로, 발행하지 않고 종료하면 라이브 URL이 오프라인으로 남는다.

- 리뉴얼 발행은 **원상 복구**이므로 에이전트가 자동 실행한다 — `safety-governance.md` "발행 승인 경계". 신규 기사 발행은 승인 대상으로 남는다.
- 순서는 `verify_wordpress_draft` → `publish_wordpress_post(dryRun: true)`로 `requiredChecks` 전항 확인 → `publish_wordpress_post(dryRun: false)`. local 확인 후 production 순차 진행.
- 영문 slug + 한글 키프레이즈 기사는 세 호출 모두에 기사 메타의 `seoSlugKeyword`를 그대로 전달한다. 메타에 없으면 발행하지 않고 `blocked`로 보고한다 — 값을 발행 시점에 지어내지 않는다(`wp-seo-gate-known-limits.md` §9).
- 게이트 미통과로 발행이 보류되면 draft로 두고 넘어가지 않는다. false인 `requiredChecks` 항목과 함께 즉시 고지한다.
- 발행 후 라이브 URL 응답·status를 확인하고, 사용한 `seoSlugKeyword`·`hasFocusKeywordInSlug`를 보고·ledger에 남긴다.

### 금지

- 기존 문단 부분 수정·원문 문장 그대로 옮김·시점 주장 재검증 없이 승계·원문 목차 답습·새 근거 없이 재배열
- 교체 등록만 하고 발행하지 않은 채 종료해 라이브 URL을 오프라인으로 두는 행위
- 발행 시점에 `seoSlugKeyword`를 임의로 지어내는 행위(기사 메타 값만 계승)
- `reason_code = off_topic_asset_protection` 항목을 리뉴얼 대상으로 집필하는 행위(`safety-governance.md` "리뉴얼 큐 off-topic 정리")
- off-topic 정리에서 301 등록 없이 `trash`부터 실행해 내부 유입 링크를 404로 만드는 행위(`safety-governance.md`)
- WP → 네이버/소셜 source-based adaptation 규칙(채널 압축·재구성)을 WP → WP 리뉴얼에 적용하는 행위

## 자동화 수준(기본: 수동 스킬 호출)

- 사용자가 스킬명을 말하지 않아도 자동으로 호출 워크플로우를 선택
- 문맥 라우팅:
  - "마케팅 전략"/"콘텐츠 캘린더"/"빌드업 계획" => `content-audit`
  - "콘텐츠 만들어줘"/"소셜 글 써줘" => `social-content`
  - "네이버 글 리라이팅" / "WP 글 리라이팅" / "기존 글 리라이팅" => `wp-naver-rewrite`

## 콘텐츠 생성/발행 로그(중복 방지)

목적: 이미 생성했거나 발행한 콘텐츠(특히 Git 작업 로그 기반 빌드 인 퍼블릭 콘텐츠)를 다시 만드는 것을 막는다.
콘텐츠를 만들기 전 로그를 먼저 조회하고, 만든 뒤에는 한 줄을 추가한다.

### 로그 위치/형식

- 파일: `.agent/content/content-ledger.jsonl` (append-only, JSON Lines, 한 줄에 항목 1개)
- UTF-8 유지, 기존 줄은 수정/삭제하지 않고 추가만 한다(`content_archive_management.md` 보관 원칙 동일 적용)
- 항목 구조:

```json
{"id":"YYYYMMDD-NNN","date":"YYYY-MM-DD","type":"article|social|image-template|content-template","channel":"wp|naver|linkedin|threads|instagram|gen-studio","slug":"english-kebab-case","title":"한국어 제목","campaignId":"cmp-YYYYMM-slug|none","funnel":"P0|P1|P2|P3|P4","source":{"kind":"git|wp|naver|app|idea","ref":"커밋범위/URL/슬러그/기능키","summary":"소스 핵심 1줄"},"status":"draft|published","dedupeKey":"정규화-중복판정-키","channelFit":{"preFit":0,"score":0,"verdict":"positive|conditional|negative"},"marketingFit":{"score":0,"verdict":"fit|needs_work|not_fit","strategyVersion":0},"adFit":{"score":0,"verdict":"fit|needs_work|not_fit","strategyVersion":0},"cluster":"naver 클러스터 키(네이버 글만)","internalLinks":["링크한 기존 글 slug/URL(네이버 글만)"]}
```

### 생성 전 확인 (필수)

1. 새 콘텐츠 주제가 정해지면 발행/초안 작성 전에 `.agent/content/content-ledger.jsonl`에서 중복을 먼저 조회한다.
   - 조회 키 우선순위: `dedupeKey` → `source.ref` → `slug` → `title` 부분 일치
   - 예: `grep -i "<키워드 또는 커밋해시>" .agent/content/content-ledger.jsonl`
   - **원장 단독 판정 금지**: 발행된 기사가 원장에 누락된 사례가 있으므로, WP 대상 콘텐츠는 반드시 `amu-magazine` MCP의 `search_posts`(키워드/slug)로 실제 발행 여부를 병행 확인한다.
2. Git 소스 콘텐츠는 `source.kind:"git"`, `source.ref`에 커밋 해시/범위 또는 기능키를 기록하고, 동일 커밋/기능 범위는 빌드 인 퍼블릭 소재로 1회만 사용한다.
   - 같은 작업을 다시 다룰 경우, 직전 항목 이후의 변경분(신규 커밋)만 다루거나 명확히 다른 앵글로 재구성한다.
3. 동일 `dedupeKey`가 `published`로 이미 있으면 새로 만들지 않는다. 채널 바리에이션이 목적이면 `type`/`channel`을 달리해 별도 항목으로 기록한다.

`wp_to_wp_replace` 예외:

- 이 조회는 writer가 아니라 운영 컨트롤러가 수행한다. 검색 결과·slug·제목·기존 원문 정보는 writer에게 전달하지 않는다.
- 요청된 동일 URL/slug의 존재는 중복 실패가 아니라 **교체 대상 확인**이다. 예상하지 못한 별도 경쟁 URL이 발견된 경우에만 컨트롤러가 중단·병합 여부를 판정한다.
- writer는 ledger, `amu-magazine` 검색·browse·read, `.agent/content/articles/`를 조회하지 않는다.

### 생성/발행 후 기록 (필수)

- 초안 완성 시 `status:"draft"`, 실제 발행 시 `status:"published"`로 항목을 추가한다(같은 id의 후속 줄 추가 허용).
- `dedupeKey`는 소스 종류별로 일관되게 정규화한다.
  - Git: `git:<repo>@<커밋 또는 기능키>`
  - WP/네이버: `url:<정규화 URL>` 또는 `slug:<슬러그>`
  - 아이디어/주제: `topic:<핵심 키워드 kebab-case>`

## 제작 서사 자체 기획 (2026-08-13 신설)

목적: **AMU 자체 소재 콘텐츠가 사용자의 수동 서사 입력을 기다리며 멈추는 것을 막는다.**
자산 메타(assetId·templateKey·과금 원장)에는 "무엇을 만들었나"만 있고 "왜 그렇게 정했나"가 없다.
그 층을 에이전트가 **문서화된 근거에서 설계**한다. 창작 허용이 아니라 근거 등급으로 통제된 설계 위임이다.

- 절차·근거 등급(S1~S4)·표현 규칙·게이트의 단일 기준: `{{AGENT_ROOT}}/refs/content-marketing-guide/creation-narrative-design-guide.md`
- 요약: **사실층**(관측·문서 확정 사항)은 창작 금지·근거 인용 필수, **편집층**(프레임·훅·구성)은 에이전트가 설계한다.
- `productDecision`은 **정책 정본(S2) 또는 작업 기록(S3) 근거 1개 이상**을 문서 경로·절까지 인용해야 한다. 자산 메타 단독으로 세우지 않는다.
- 설계 결과는 queue 항목의 `narrativeBasis`에 기록하고, 서사 근거 게이트 5개 조건을 통과하지 못하면 본문을 만들지 않고 `blocked`로 보고한다(fail-closed).
- 적용: `TASK-CREATION-LOG` 필수. 그 밖의 AMU 자체 소재 TASK는 `referenceReports`·운영 로그가 없어 제품 결정층이 빌 때 보조 적용한다.

## 에버그린 아카이빙 게이트 — AMU Stories (2026-08-12 신설)

목적: **AMU 자체를 소재로 한 콘텐츠가 소셜 타임라인에서만 소비되고 사라지는 것을 막는다.**
빌드 인 퍼블릭·운영 기록·제작 서사는 소셜에서 수명이 며칠이지만, 그중 일부는 6개월 뒤에도 읽을 가치가 있다.
그런 소재만 골라 매거진 `amu-stories`에 **에버그린 자산으로 남긴다.**

### 적용 대상

`.agent/todo-ledgers/tasks/todo-content.json`의 **AMU 자체 소재 TASK** — 운영 에피소드,
`TASK-CREATION-LOG`(제작 서사),
그 밖에 AMU의 서비스·제작 과정·일하는 방식을 다루는 작업.

> 일반 주제 기사(투자·자기계발·테크 등)와 `TASK-AMU-MAGAZINE` 계열은 대상이 아니다.
> 그쪽은 원래 기사 산출물이며 카테고리도 주제 카테고리를 쓴다.

### 기본 동작

**기본 산출물은 소셜이다. 기사화는 게이트를 통과한 소재만 추가로 수행한다.**
게이트 미통과가 정상이며, 통과하지 못했다고 소재를 버리지 않는다(소셜은 그대로 진행한다).

### 에버그린 판정 (4개 전부 충족해야 기사화)

| # | 조건 | 판정 방법 |
| --- | --- | --- |
| 1 | **원리·판단·교훈이 본문의 축**이다. 날짜·버전·특정 수치에 의존하지 않는다 | 제목과 소제목에서 날짜·버전을 빼도 글이 성립하는가 |
| 2 | **이전 가능한 교훈이 1개 이상** 있다 — 독자가 AMU 밖 자기 상황에 적용할 수 있다 | "그래서 독자가 무엇을 다르게 하게 되는가"에 1문장으로 답할 수 있는가 |
| 3 | **사실 근거가 확보**됐다 — `proofLevel`이 '코드 확인'(git) 또는 '자산 확인'(생성물) 이상 | 각 TASK의 proofLevel 승격 절차 완료 여부 |
| 4 | **기사 중복이 없다** | `content-ledger.jsonl`에서 같은 `dedupeKey` + `type:"article"` 항목 부재 확인 + `amu-magazine` `search_posts` 병행 확인 |

**하나라도 미충족이면 기사를 만들지 않는다.** 판정 결과와 미충족 조건 번호를 보고에 남긴다.

되돌린 판단·회귀 수정·실패 후 복구 서사는 **조건 1·2를 충족하기 쉬우므로 우선 후보**다.
반대로 단순 기능 추가 나열, 일회성 수치 보고, 릴리스 노트성 요약은 통과시키지 않는다.

### 기사 규격

- `magazine_knowledge_article.md`를 그대로 따르고 **`category`는 `amu-stories`**, `author`는 AMU News 담당(`attrest_admin`)
- 서사 구조는 각 TASK와 동일하게 `userProblem → productDecision → userVisibleChange`.
  카탈로그 나열과 '~를 구현했습니다'식 서술은 금지
- **R 등급은 R3(미공개 서비스 브랜딩) 또는 R4(일반 유입)** 기본. 확장 CTA를 붙이려면 Charter §5 라우팅 표의
  해당 행을 근거로 제시한다. `statusLabel`이 '출시 예정'이면 **체험 CTA 금지, 기대감 CTA만** 허용
- `statusLabel`이 '내부 실험'인 소재는 기능 상세·포트·경로·프롬프트 원문을 비노출하고
  **'AMU가 일하는 방식' 프레임으로만** 서술한다
- 시각 자료는 각 TASK의 확인된 기존 자산만 재사용한다. 제작 서사의 사실성을 위해 새 이미지를 만들지 않는다
- `amu-magazine` MCP의 SEO 게이트를 통과시키고, 내부 링크 클러스터(허브 1 + 심화 2 + 전환 1)를 구성한다

### 절차

1. 각 TASK의 소재 확정 단계(order 1)에서 **위 4개 조건을 판정**하고 결과를 queue 항목에 기록한다
2. 통과 시 `targetCategory: "amu-stories"`를 확정하고 기사를 먼저 작성한다
3. 기사는 `TASK-COMMON` order 1의 draft 등록 절차를 따른다(local draft 등록·verify → production draft 등록·verify, 순차)
4. 소셜은 종전대로 진행하되, **기사가 있으면 소셜의 source로 기사 URL을 사용**해 회유 동선을 만든다
5. `content-ledger.jsonl`에 기사 항목을 `type:"article"`, `channel:"wp"`로 **별도 append**한다
   (`dedupeKey`는 소셜과 동일하게 유지 — 소재 중복 판정은 하나로 묶고 채널만 구분한다)

### 금지

- 게이트 미통과 소재를 기사로 만들기 위해 판정을 완화하거나 사후에 근거를 만드는 것
- `amu-stories`를 채우기 위한 발행 — **카테고리를 비워두는 것이 억지로 채우는 것보다 낫다**
- 소재 축적 속도를 넘어선 발행. 실제 마일스톤·에피소드·제작 건이 없으면 만들지 않는다
- 기사 발행 건수를 성과로 보고하는 것(판정 기준은 재방문·관계 행동이다)
- 같은 소재를 `amu-stories`와 `ai-creatives` 양쪽에 중복 기사화하는 것 — 축으로 하나만 고른다 (한 포스트는 카테고리 1개다)

## 전략 적합도 기준 조회 (필수)

1. `prepare_local_generation` 응답의 `contentFitStrategies`에서 마케팅/광고 전략과 버전을 확인한다. `fitStrategiesError`가 있을 때만 `get_content_fit_strategies(universeId=...)`를 1회 호출한다.
2. `{{AGENT_ROOT}}/refs/marketing-guide/*`와 등록 전략을 함께 적용해 채널별 `marketingFit`/`adFit` 평가 기준을 확정한다.
3. 전략이 미등록이면 임의 기준을 만들지 않고 version 0의 `not_fit` 사유로 기록해 운영자에게 등록을 요청한다.

## 오탈자 검수 (로컬 MCP 필수 / Web UI 선택)

목적: 발행 직전 오탈자가 브랜드 신뢰를 깎는 걸 막는다. 로컬 에이전트의 MCP 생성 작업은 채널 콘텐츠 생성 착수부터 제출까지 2중 검수를 반드시 병행한다. Marketing Ops Web UI에서는 오탈자 검수를 필수 발행 게이트로 사용하지 않고, 운영자가 필요할 때 `AI 검수 및 수정`을 실행하는 선택 기능으로 제공한다.

### 절차

1. 로컬 에이전트는 초안 전체를 한 번 육안으로 읽어 오탈자·비문을 검수한다.
2. active 오탈자 사전 대조는 `submit_local_generation`의 node-app 서버 검증을 authoritative gate로 사용한다. 정상 생성 경로에서 사전 전체를 모델 컨텍스트에 선로드하지 않는다.
3. `list_typo_rules`는 서버가 실제 rule finding을 반환했거나 사전 관리가 필요한 경우에만 `responseView="compact"`로 조회한다. `full`은 운영 디버깅을 명시적으로 수행할 때만 사용한다.
4. 새로 발견한 의심 표현은 `record_typo_candidate`로 공통 사전에 기록을 시도한다. 서버 오류로 실패하면 **재시도를 반복하지 말고**, 사전 기록은 건너뛴 채 콘텐츠 자체 교정만 확실히 하고 완료 보고에 그 사실을 명시한다.
5. `submit_local_generation`을 호출하면 서버는 각 채널 초안을 별도 Web API 요청으로 다시 검수한다. 이 독립 검수는 생성 에이전트와 분리된 고정 모델 `google/gemini-3.5-flash-lite`를 사용하고, 초안을 수정하지 않은 채 확정 오탈자 finding만 반환한다.
6. `get_job(view="completion")`의 채널별 `independentProofread`가 `status="passed"`, `valid=true`이고 validation이 최신 draft asset을 가리켜야 제출 완료로 판정한다. `failed`, `unavailable`, `stale`, 응답 형식 오류는 모두 fail-closed이며 발행/완료 처리 금지다.
7. 2차 독립 검수에서 실제 finding이 반환되면 새 표현을 `record_typo_candidate`로 공통 사전에 등록하고, 현재 로컬 에이전트가 콘텐츠를 수정한 뒤 `submit_local_generation`으로 **전체 채널을 재제출**한다(부분 채널만 교체 불가). `unavailable`이고 finding이 비어 있으면 동일 초안을 재제출하거나 특수문자를 임의 제거하지 말고 `get_job(view="proofread")` 1회 확인 후 infrastructure block으로 보고한다. 같은 초안 해시와 확정 상태가 있으면 서버가 판정을 재사용해 중복 과금을 막는다.
8. Web UI에서 운영자가 초안을 수정하거나 AI 교정본을 저장한 경우 오탈자 검수는 선택 사항이다. 필요하면 통합된 `AI 검수 및 수정`을 실행하되, 실행하지 않았거나 과거 독립 검수가 `stale`이라는 이유만으로 Web UI 발행을 차단하지 않는다.

### 금지 사항

- 로컬 MCP 작업에서 육안 검수를 생략하는 것
- 정상 생성 경로에서 오탈자 사전 전체를 모델 컨텍스트에 선로드하는 것
- 로컬 에이전트의 자기검수 결과만으로 `validation=true` 또는 발행 가능 상태라고 판단하는 것
- 로컬 MCP 작업에서 독립 검수의 `draftDigest`가 현재 초안과 다른데도 과거 통과 결과를 재사용하는 것
- `independentProofread.status="unavailable"`이고 finding이 비어 있는데 동일 초안을 반복 재제출하거나 문장부호를 근거 없이 변경하는 것
- Web UI 발행에 로컬 MCP용 독립 오탈자 게이트를 강제로 적용하는 것
- 오탈자 사전을 유니버스별로 분리 저장하거나 조회하는 것
- `record_typo_candidate` 서버 오류를 반복 재시도하며 시간을 소모하는 것

## 자기 개선 루프 (성과 피드백, 필수)

목적: 콘텐츠를 만들 때마다 이전 콘텐츠의 실제 성과(검색 노출·유입·반응)를 먼저 확인해,
부족했던 점은 새 콘텐츠에서 보완하고 효과가 검증된 패턴은 재적용한다.

### 시점

- 소셜/블로그 콘텐츠 생성 착수 전, 사전 적합도 게이트(Pre-Fit)보다 먼저 수행
- 전체 순서: ① 성과 회고 → ② 전략 원장/marketing-guide 조회 → ③ Pre-Fit(네이버 주제 하드 게이트 포함) → ④ 본문 생성 → ⑤ `channelFit` + `marketingFit` + `adFit` 사후 채점

### 체크 포인트 (확인 가능한 신호만 사용)

| 신호 | 데이터 소스 | 대상 |
|---|---|---|
| 검색 노출/클릭/CTR/순위 | `google-marketing` MCP `search_console_query` | WP 매거진 기사(소스 원문) |
| 네이버 검색 노출 여부 | 발행 48시간 후 블로그탭 검색 테스트 기록, Creator Advisor 실측(사용자 제공) | naver_blog |
| 채널 반응(공감/댓글/저장/팔로우) | 사용자 제공 실측 | threads/linkedin/instagram |
| 과거 채점·판정 추이 | `.agent/content/content-ledger.jsonl`의 `channelFit`, `marketingFit`, `adFit`, 전략 버전 | 전 채널 |
| 누적 교훈 | `.agent/content/content-insights.md` | 전 채널 |
| 고객 반론·구매 장애물 | `.agent/content/customer-objections.md` | 전 채널 |

### 절차

1. 같은 채널×주제(클러스터/키워드)의 직전 콘텐츠 2~5건을 `.agent/content/content-ledger.jsonl`에서 조회한다
2. 체크 포인트의 성과 신호를 **실제 도구 호출로** 수집한다.
   - threads/linkedin/instagram: `marketing-ops` `get_token_health`로 채널 상태를 먼저 확인한다. 이때 만료 임박 여부뿐 아니라 `canCollectPerformance`/`measurementRisk`도 함께 확인한다. 이어서 `get_social_performance`로 최근 성과를 조회한다(provider quota 미소비, 항상 우선 사용). 최근 스냅샷이 7일 이상 오래됐거나 신규 채널이면 `collect_social_performance`(정기 수집 sinceDays 7~14, 최초 백필 60~90)로 갱신한다.
   - WP 매거진: `google-marketing` `search_console_query`로 노출/클릭/순위를 확인한다.
   - naver_blog: 발행 URL 검색 노출 확인 + GA4/UTM 보조 분석으로 판정한다(내부 통계 API 없음).
   - 이 과정에서 접근 자체가 불가능한 신호만 "확인 불가"로 남기고 추정하지 않는다. **토큰이 "healthy"라는 이유만으로 성과 수집이 정상 작동한다고 가정하지 않는다** — `collect_social_performance` 응답의 `channelResults`에서 `status: "skipped"`/`"failed"` 항목과 그 `reason`을 반드시 확인한다.
3. `.agent/content/content-insights.md`의 해당 채널 교훈을 로드한다
4. 반영 판단:
   - 부족 패턴(노출 0, 낮은 CTR, 동일 축 감점 반복 등) → 새 콘텐츠에서 보완할 지시로 변환
   - 효과 패턴(노출·클릭 상위 키워드, 반응 좋은 포맷/훅/구조) → 새 콘텐츠에 재적용
5. 생성 완료 보고에 "반영한 인사이트" 1~2줄을 명시한다 (없으면 "해당 없음"과 사유)
6. 새 실측 성과가 확인되면 `.agent/content/content-insights.md`에 교훈을 추가한다 (수치+기준일 필수)
6.5. 댓글·문의에서 **구매 장애물**(제품 신뢰·비용·규격·권리·온보딩 관련 질문)을 발견하면 `.agent/content/customer-objections.md`에 append한다. 답변으로 끝내지 않고 최소 1개의 후속 작업(FAQ·랜딩 문구·콘텐츠 소재·제품 개선 후보)으로 변환해 함께 기록한다 (Charter §10.3).
   - 형식: `- [YYYY-MM-DD] (채널) "고객 표현 원문" → 분류: <신뢰|비용|규격|권리|온보딩> → 후속: <작업 1줄> → 상태: <open|converted|closed>`
   - 고객이 쓴 표현을 그대로 보존한다(요약·정제 금지 — 콘텐츠 훅과 랜딩 카피의 원재료다).
7. `get_token_health`/`collect_social_performance`에서 스코프 누락·인증 실패 등 **인프라 결함**을 발견하면, 콘텐츠 패턴 교훈과 별개로 즉시 사용자에게 보고하고 `.agent/content/content-insights.md`에 기록한다. 이런 인프라 결함은 "동일 패턴 2회 관찰" 요건 없이 **1회 발견 + 구체적 수치/로그 근거만으로 즉시 기록**한다(아래 기록 규칙의 예외).

### .agent/content/content-insights.md 기록 규칙

- 파일: `.agent/content/content-insights.md` (채널별 섹션, 교훈 축적 원장)
- 형식: `- [YYYY-MM-DD] 교훈 1줄 (근거: 수치/출처)`
- 등록 기준: 동일 패턴 2회 이상 관찰 또는 명확한 수치 근거가 있을 때만 (단건 성과의 과잉 일반화 금지)
  - 예외: 토큰/스코프/API 실패 등 **측정 인프라 자체의 결함**은 콘텐츠 성과 패턴이 아니므로, 로그·에러 사유가 명확하면 1회 관찰만으로도 즉시 기록한다(다음 세션이 같은 시행착오를 반복하지 않도록).
- 추정 수치로 교훈 생성 금지. 교훈이 기존 규칙과 충돌하면 임의로 규칙을 바꾸지 말고 규칙 개정 제안으로 보고

## 작업 단위 프로토콜 (필수)

- 기사/매거진 작업은 **한 번에 1건씩만** 완성하고 사용자 확인을 받는다. queue 형태 요청(TASK 목록)도 1건 완결 → 확인 → 다음 건 순서를 지킨다.
- 매거진 재작성/신규 작업은 저장에서 멈추지 않고 **local·production draft 등록 + 각 대상 verify + 소셜 3채널 제출 통과까지 한 사이클로 완결**한다.
- WordPress draft는 항상 **local과 production 양쪽에 동일하게 등록**한다(단, 병렬 호출 금지 — 순차 진행).

## QA Gate (게시 전 체크)

- [ ] `coldOpen`의 문제·장면·긴장 3요소와 `heroLine`을 작성 완료 (`CONTENT-INTELLIGENCE.md` "Cold Open")
- [ ] `coverArtDirection` 4개 필드 작성 완료, 커버에 설명형 요소 없음 (`CONTENT-INTELLIGENCE.md` "Editorial Cover System")
- [ ] `primaryQuestion`이 독자에게 보이는 문장 기준을 통과 (`CONTENT-INTELLIGENCE.md` "독자 노출 표면")
- [ ] Discovery 콘텐츠는 7문항 평가 + `hookType`/`questionType` 기록 완료 (`CONTENT-INTELLIGENCE.md` §13~§18)
- [ ] 신규 콘텐츠는 Question DNA(Who·Desire·Obstacle·Question) + 신규 게이트 7문항 확인 완료 (`CONTENT-INTELLIGENCE.md` §19~§21)
- [ ] 마케팅 정책 원장(Charter) 확인 완료 — 축·CTA 라우팅(§3) 판정 근거를 메타에 기재
- [ ] 소속 `campaignId` 확인(없으면 `none` + 사유, 상시 자산에 한함) — Charter §8
- [ ] 주장 검증(Charter §9): 가격·코인·보너스는 정책 실값(코인팩 최대 5%·구독 5%), "무료"는 생성 과금과 함께 표기, 미구현 기능 소구 없음
- [ ] 광고 재사용 예정 소재만: 오퍼 1개 + 랜딩(app.allmyuniverse.com) + 해당 필수 고지 + UTM 포함 (Charter §9.5) — 매거진 기사·소셜 재가공분은 대상 아님(`adFit` needs_work 정상)
- [ ] L3(사람 승인) 항목 포함 여부 확인 — 포함 시 해당 문장을 인용해 승인 요청 (Charter §10.1)
- [ ] 소스 링크/슬러그가 메타에 기록됨
- [ ] 3축 브랜딩 원칙 준수(프로필/고정글은 3축, 본문은 과도한 교차홍보 없음)
- [ ] 서비스 상태 표기 준수(운영 중/출시 예정)
- [ ] 근거 없는 수치/성과 없음(필요 시 "추정")
- [ ] **정량 인상을 주는 미검증 표현 없음** — `대부분`, `대체로`, `열에 아홉`, `누구나`처럼 측정하지 않은 분포를 사실처럼 진술하지 않는다. 실측이 없으면 `~할 수 있다`, `~가 뒤집히기도 한다`처럼 가능성으로 쓴다 (Proof Bank 원칙)
- [ ] 기사의 주어가 독자의 문제인가 — AMU 제거 테스트 통과 (위 "기사의 주어")
- [ ] Episode마다 `curiosityType`과 핵심 `question`·`evidence`·`discovery`·`application`이 채워졌는가. `assumption`·`reveal`은 반전형 Episode에서만 필수인가 (`magazine_knowledge_article.md`)
- [ ] 7단 문법이 형식이 아니라 독자 심리 기능을 수행하는가 — Evidence가 설명보다 앞서고, Tension은 실제 기대-현실 충돌이며, Experience는 `판단 대상 → 판단할 틈 → reveal` 순서인가
- [ ] `qualityEvidence`에 Curiosity / Surprise / Evidence / Participation / Payoff / Utility / Memorability / Continuation / Voice 9축의 구체 본문 근거가 모두 있는가 — 리뉴얼은 하나라도 비면 `blocked`
- [ ] `memorableInsight`가 흔한 요약이 아니라 독자가 다시 말할 발견인가, `nextQuestion`이 관련 글 나열이 아닌 답 뒤의 실제 다음 호기심인가
- [ ] ‘3초 생각’·‘정답은’·‘하지만’ 같은 반복 장치나 모든 H2 질문형으로 콘텐츠를 패턴화하지 않았는가; `Hook Strength ≤ Answer Strength`인가
- [ ] Reality Lens를 쓴 경우: 은유가 실제 메커니즘과 어긋나지 않는가, 한 곳에 집약됐는가, 제목·`seoTitle`·slug·메타 설명에 Lens 용어가 없는가 (선택 적용 — 미사용은 정상)
- [ ] 제목·첫 줄 훅이 본문 내용과 일치하고 핵심 조건을 숨기지 않음 — 강한 문제 제기·감정적 확대·도발적 질문은 Charter §6 범위에서 적극 허용
- [ ] 수치·성과 주장은 출처·표본·기간·비교 조건·측정 방식 확인(미실측은 추정/목표/가설/업계 사례를 정확히 구분)
- [ ] 후기·댓글·추천에 허위 체험담이나 소속·경제적 이해관계 은폐 없음
- [ ] CTA 1개, 본문 링크 1개(또는 프로필 링크 유도)
- [ ] 독자를 위한 유용한 정보 또는 팁 제공
- [ ] 콘텐츠 로그에서 중복 확인(특히 Git 소스) + 생성/발행 후 로그 기록
- [ ] `TASK-CREATION-LOG` 등 서사를 에이전트가 설계한 소재: 서사 근거 게이트 5개 조건 통과 + `narrativeBasis`(3요소 sources·claimsAudit) 기록 완료 — 실측/편집 기획 구분을 보고에 명시 (`{{AGENT_ROOT}}/refs/content-marketing-guide/creation-narrative-design-guide.md`)
- [ ] AMU 자체 소재(운영 에피소드/`TASK-CREATION-LOG` 등): 에버그린 게이트 4개 조건 판정 완료 — 통과 시 `amu-stories` 기사 병행, 미통과 시 미충족 조건 번호를 보고에 명시
- [ ] 생성 착수 전 자기 개선 루프(성과 회고) 수행 + "반영한 인사이트"를 완료 보고에 명시. 단, `wp_to_wp_replace`는 controller-only로 대상 선정·우선순위에만 사용하고 writer·quality reviewer 입력에는 성과·패턴·ledger/insights 결과를 포함하지 않음
- [ ] 로컬 MCP 작업: 제출 전 육안 검수 + 서버 active 사전 대조 통과 + `get_job(view="completion")`에서 독립 검수 `passed` 및 최신 draft 연결 확인 (`gemini-3.5-flash-lite`, fail-closed). Web UI 작업: 필요 시 `AI 검수 및 수정` 선택 실행
- [ ] 채널별 본문 생성 전 사전 적합도 게이트(Pre-Fit) 수행 — 부적합 채널은 생성 스킵 (`{{AGENT_ROOT}}/refs/content-policy/channel_fit_scoring.md`)
- [ ] Pre-Fit '적합' 채널은 본문 생성 전 일일 draft 쿼터를 확인 — cap 미만이면 생성, cap 도달이면 `.agent/content/articles/queue/upload-queue.json`에 대기 등록(생성 스킵), 우선순위(퍼널→Pre-Fit점수→FIFO) 적용 (`{{AGENT_ROOT}}/refs/content-policy/upload_cadence_and_quota.md`)
- [ ] 생성 사이클 착수 시 대기 큐(upload-queue.json)를 채널별 잔여 cap 범위에서 우선순위 순으로 먼저 소진
- [ ] `prepare_local_generation.contentFitStrategies` 확인 완료(로드 오류 시에만 `get_content_fit_strategies` 1회 fallback) + 현재 전략 버전 기록
- [ ] `channelFit` 85점 이상, `marketingFit`/`adFit` 별도 산출 (`{{AGENT_ROOT}}/refs/content-policy/channel_fit_scoring.md`) — 점수·판정·전략 버전을 ledger에 기록
- [ ] naver_blog 주제가 블로그 목표/등록 전략에 부적합하면 본문 미생성 + `excluded: true`, `exclusionReason`, validation marker 제출
- [ ] 발행/예약 전 대상 채널 credential 토큰 상태 확인(marketing-ops `get_token_health`) — critical(D-7 이내)이면 사용자에게 재연결 필요 보고, expired면 해당 채널 발행/예약 보류
- [ ] 예약 발행은 `list_jobs`로 `recommendedUploadSchedules`의 추천일·허용 시간·추천 토큰을 확보한 뒤 `apply_channel_action(publishHour=N)`로 수행(서버가 토큰/최신 정책 재검증 후 분을 10~30 사이에서 1회 선택) — `publishAt`/`publishHour` 동시전달 금지 (`{{AGENT_ROOT}}/refs/content-policy/upload_cadence_and_quota.md`)
- [ ] `get_token_health` 확인 시 만료 임박뿐 아니라 `canCollectPerformance`/`measurementRisk`도 함께 확인 — "healthy"라도 스코프 누락 등으로 성과 수집이 막혀 있으면 즉시 사용자 보고 (발행 자체는 별도 판단, 측정 불가 상태만 투명하게 알림)
