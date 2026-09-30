아래의 사례를 참고해서 AMU 세계관 캐릭터 페르소나 생성 시 세계관/심리/서브플롯 설계/에피소드 작성 등을 진행해주는 파이프라인과 프로세스를 AMU에 구현한다면 어떨까? 아래의 사례에서 적용할 만한 포인트나 요소 또는 전략이 있는지 자세히 분석해줘. 

===

시바 충격!!!😱 넷플릭스급 드라마를 작가 1명이???
이제 작가 1명이 넷플릭스급 드라마 만드는 시대 왔음!!
Pocket FM이 Sherpa라는
소설 전문 AI를 공개했는데
이거 그냥 글 써주는 ChatGPT가 아님.
아이디어 딱 1~2줄만 던져주면
- 세계관 만들고
- 캐릭터 심리 짜고
- 서브플롯 설계하고
- 에피소드 > 장면 단위로 쪼개서
소설까지 직접 써줌.

심지어 여기서 끝이 아님.
스토리 텐션 떨어지는 구간 체크하고
대사, 감정선, 전개 속도까지 검수한 다음
버튼 한 번 누르면
- 음성 드라마 제작
- Pocket FM에 바로 배포
- 해외 언어 자동 현지화
- 성과에 따라 수익화까지 가능함.
근데 진짜 미친 건 데이터임.
Sherpa는 단순히 인터넷 소설 긁어서 만든 AI가 아니라
Pocket FM이 가지고 있는
실제 청취 유지율 데이터를 학습에 활용했다고 함.
사람들이 어느 장면에서 계속 듣고
어디에서 이탈하는지까지 보면서
다음 화를 누르게 만드는 이야기를 학습시킨 거임.

Pocket FM에서는 이미
55만+ 크리에이터가 콘텐츠를 만들었고
한 작품은 매출 1억 달러 이상을 기록했고
3명의 작가는 2년도 안 돼 백만장자가 됐다고 함.
그리고 회사는 Sherpa 도입 후 콘텐츠 생산량이
1년 만에 1200% 증가했다고 밝힘.
진짜 앞으로는
작가 > 제작사 > 성우 > 번역 > 배급
이 과정이 필요한 게 아니라
사람 1명 + AI = 글로벌 콘텐츠 스튜디오
가 될 수도 있겠는데?
더 소름인 건 Sherpa가
500화짜리 장편도 기억 안 날아가게 만드는 방식임.
캐릭터 비밀, 떡밥, 관계 변화까지 추적하면서
스토리가 바뀌면 뒤에 영향받는 부분만 다시 설계한다고 함.

이거 소설 쓰는 사람이라면 진짜 한번 봐야함👇
Pocket FM Sherpa
Sherpa by Pocket FM | Free AI Fiction Writing Tool

===

가능해. 그리고 이 사례를 AMU에 적용한다면 **단순한 “AI 스토리 생성기”로 만들기보다, 현재 구축 중인 Canon·Intelligence·Interactive Episode 시스템의 상위 제작 엔진으로 만드는 것이 훨씬 가치가 크다.**

핵심은 이거야.

> **AMU에 필요한 것은 Sherpa 복제품이 아니라 `Knowledge-Grounded Narrative Engine`이다.**
>
> Intelligence가 세상의 중요한 질문을 찾고 → 캐릭터들이 각자의 욕망과 심리로 그 문제를 살아내고 → Narrative Planner가 사건과 서브플롯을 구성하고 → Episode가 지식을 경험으로 바꾸고 → 실제 독자 반응이 다음 이야기를 개선하는 구조다.

현재 첨부 문서만 봐도 기초 설계는 상당 부분 이미 되어 있다. Intelligence System과 Episode Planning을 분리하고, `Intelligence → Narrative Planning → Episode Production → Canon Update → Performance Learning`으로 연결하며, 캐릭터 생성보다 먼저 인간적 긴장과 사건을 찾도록 설계해두었다. 

Sherpa 사례는 이 구조를 **어떻게 실제 AI 제작 시스템으로 완성할지**에 대한 꽤 좋은 참고 사례라고 본다.

---

# 1. 먼저 Sherpa에서 진짜 중요한 것은 “소설을 잘 써준다”가 아니다

현재 Pocket FM이 공개한 Sherpa 구조를 보면 세 가지 핵심 Agent가 있다.

`Planner Agent`는 장편 전체 맥락을 보면서 story arc, 캐릭터 여정, 갈등, episode beat를 설계한다. `Feedback Agent`는 engagement, readability, prose, coherence, pacing 등을 검수한다. `Storyboard Agent`는 캐릭터, 설정, arc, scene, 결정 등을 하나의 SSOT로 유지한다. 여기에 Narrative World Model이 캐릭터 관계, setup/payoff, 세계 상태와 Canon을 장기적으로 추적한다. ([Pocket FM][1])

이 부분은 AMU가 이미 고민하던 문제와 거의 정확하게 겹친다.

특히 중요한 것은 **캐릭터 에이전트 방식**이다. Pocket FM 등이 공개한 2026년 연구 `From Personas to Plot`에서는 MAGNET이라는 구조를 사용한다. 각 캐릭터가 자신의 persona와 목표를 기반으로 다음 행동을 제안하고, 이들이 하나의 shared world state와 evolving story goal을 공유한다. 별도의 ATLAS 파이프라인은 각 scene의 world representation을 비교해 모순과 hallucination을 검사한다. 연구에서는 100페이지 장편 기준 단일 모델 prompting보다 narrative annotation과 hallucination이 감소했다고 보고했다. ([arXiv][2])

여기서 AMU가 가져와야 할 가장 중요한 아이디어는:

> **작가 AI가 캐릭터를 움직이는 것이 아니라, 캐릭터가 자신의 Persona를 기반으로 행동 후보를 만들고 Narrative Director가 그 행동들을 이야기로 조정한다.**

이 차이가 꽤 크다.

---

# 2. 현재 AMU 문서에 이미 있는 구조와 정확히 맞물린다

현재 정책에서는 캐릭터를 `Identity / Personality / Motivation / Conflict / Point of View / Growth Potential`로 정의하고 있다. 

또 제작 순서도 이미

`Topic → Human Tension → Character Fit → Story Hook → Knowledge Map → Interaction → Consequence → Canon Check → Publish → Measure → Update Canon → Next Episode`

로 정의되어 있다. 

그리고 Episode Planner에서는 기존 캐릭터를 먼저 검색하고, Perspective Gap이나 World Expansion 등의 이유가 있을 때만 신규 캐릭터를 생성하도록 되어 있다. 캐릭터별 최근 등장 횟수나 unresolved conflict, emotional state, narrative fatigue까지 관리하도록 잡혀 있다. 

따라서 완전히 새로운 시스템을 만드는 게 아니다.

현재 구조는:

```text
Intelligence
→ Episode Planning
→ Character Casting
→ Canon
→ Episode
```

정도라면, Sherpa에서 가져와야 할 것은 그 사이의 **Narrative Simulation Layer**다.

즉:

```text
Intelligence
→ Narrative Planning
→ Character Simulation
→ Plot / Subplot Simulation
→ Episode / Scene Planning
→ Writing
→ Verification
→ Audience Feedback
→ Canon Update
```

로 한 단계 정교화하면 된다.

---

# 3. 나는 이를 `AMU Narrative Intelligence Pipeline`으로 정의하는 게 좋다고 본다

전체 파이프라인은 다음 정도가 적절하다.

1. **Intelligence Selection** — Intelligence System이 실제로 다룰 가치가 있는 질문, Insight, 근거, 독자 문제를 가져온다.
2. **Narrative Conversion** — 지식 주제를 Human Tension, Core Question, 사건으로 변환한다.
3. **World Context Retrieval** — 관련 Universe, Canon, 장소, 과거 사건, 관계, 미해결 갈등을 불러온다.
4. **Casting** — 기존 캐릭터를 우선 검색하고, Perspective Gap이 있을 때만 신규 Persona를 생성한다.
5. **Character Simulation** — 캐릭터별 Agent가 자신의 욕망·공포·지식·관계·비밀을 기준으로 행동 후보를 제안한다.
6. **Plot & Subplot Planning** — Narrative Director가 Main Plot과 Relationship/Character/Knowledge Subplot을 조합한다.
7. **Arc → Episode → Scene Planning** — 장기 Arc에서 이번 Episode가 해야 할 일을 정한 뒤 scene beat까지 분해한다.
8. **Knowledge Binding** — Intelligence의 Fact·Interpretation·Source를 필요한 scene에 연결한다.
9. **Scene Writing** — Dialogue, action, narration, interaction을 실제 원고로 만든다.
10. **Narrative Verification** — Canon, 캐릭터 행동, 관계, 인과관계, 정보 정확성, setup/payoff를 검증한다.
11. **Editorial Review** — pacing, tension, 반복, 설명 과다, 감정선, 다음 행동 욕구 등을 검수한다.
12. **Human Approval → Publish → Performance Learning** — 승인된 변화만 Canon에 반영하고 실제 사용자 행동을 다음 Planning에 되먹인다.

중요한 것은 이 12단계를 거대한 prompt 하나에 넣지 않는 것이다.

**각 단계마다 명시적인 artifact를 남겨야 한다.**

---

# 4. 특히 `Character Persona`를 지금보다 한 단계 더 깊게 만들어야 한다

현재 AMU Character Schema는 기본 골격으로 충분히 좋다.

하지만 캐릭터가 실제로 스스로 행동하게 하려면 단순히

> 성격: 낙관적
> 약점: 성급함
> 목표: 성공

정도로는 부족하다.

나는 Persona를 크게 세 층으로 나누는 게 좋다고 본다.

| 계층              | 예시                        | 역할           |
| --------------- | ------------------------- | ------------ |
| Identity        | 직업, 소속, 배경, 능력            | 누구인가         |
| Psychology      | 욕망, 두려움, 신념, 오해, 방어 방식    | 왜 그렇게 행동하는가  |
| Narrative State | 현재 목표, 감정, 관계, 비밀, 미해결 문제 | 지금 무엇을 할 것인가 |

특히 Psychology에 다음 개념을 추가할 가치가 크다.

`Want`는 본인이 원하는 것, `Need`는 실제로 필요한 것, `Fear`는 피하고 싶은 것, `Core Belief`는 세상을 바라보는 기본 믿음, `Misbelief`는 이야기 과정에서 깨질 수 있는 잘못된 믿음이다.

그리고 `Stress Response`가 중요하다.

평소에는 합리적인 캐릭터도 압박을 받으면 공격적으로 바뀔 수도 있고, 회피하거나, 통제하려 하거나, 무리한 선택을 할 수 있다.

이게 있어야 캐릭터가 **“설정표대로 말하는 NPC”**가 아니라 사건에 따라 변화하는 사람이 된다.

단, 이것을 임상 심리 진단처럼 만들 필요는 없다. AMU에서 필요한 것은 의료적 심리 모델이 아니라 **행동의 인과관계를 설명할 수 있는 Narrative Psychology**다.

---

# 5. 더 중요한 것은 `CharacterDefinition`과 `CharacterState`를 분리하는 것이다

이건 시스템 설계에서 꽤 중요하다.

예를 들어 Pioneer가 원래 위험을 감수하는 성격이라고 하자.

그건 `CharacterDefinition`에 속한다.

그런데 지난 Episode에서 큰 실패를 겪었다면 현재는 일시적으로 위험 회피적인 상태가 될 수 있다.

그건 `CharacterState`다.

```text
CharacterDefinition
────────────────
성격
가치관
기본 욕망
핵심 공포
행동 성향
말투
도덕적 경계

CharacterState
────────────────
현재 목표
현재 감정
현재 위치
최근 사건
현재 관계
보유 정보
비밀
상처
미해결 갈등
```

둘을 섞으면 장편에서 문제가 생긴다.

AI가 Episode 하나에서 캐릭터가 겁먹은 모습을 보았다고 해서 다음부터 캐릭터를 “겁이 많은 사람”으로 바꿔버릴 수 있기 때문이다.

---

# 6. 여기에서 한 단계 더 중요하게 분리해야 하는 것이 있다

나는 AMU Canon 시스템에 다음 세 가지 State를 반드시 분리하는 것을 추천한다.

| State               | 의미              |
| ------------------- | --------------- |
| World Truth         | 실제 세계에서 사실인 것   |
| Character Knowledge | 해당 캐릭터가 알고 있는 것 |
| Character Belief    | 캐릭터가 사실이라고 믿는 것 |

이건 장편 서사에서 엄청 중요하다.

예를 들어:

```text
World Truth:
Warden은 사건의 진범을 알고 있다.

Pioneer Knowledge:
진범을 모른다.

Pioneer Belief:
Scholar가 무언가 숨기고 있다고 생각한다.
```

이 세 개를 분리하지 않으면 AI 캐릭터가 쉽게 **작가의 정보를 알고 행동하는 전지적 NPC**가 된다.

Sherpa의 Narrative World Model 역시 캐릭터가 무엇을 살았고, 배웠고, 전달받았는지를 추적하는 것을 주요 기능으로 내세우고 있다. ([Pocket FM][1])

AMU에서는 오히려 이 구조가 더 중요하다.

왜냐하면 사용자와 캐릭터가 직접 대화하는 Tutors / Play까지 연결될 수 있기 때문이다.

---

# 7. 그리고 Persona에서 직접 `Character Agent`를 생성한다

여기가 Sherpa 사례에서 가장 가져올 가치가 높은 부분이다.

한 Episode에 Pioneer, Scholar, Warden이 등장한다고 해보자.

Narrative Director가 처음부터

> Pioneer는 이렇게 말한다.
> Scholar는 이렇게 반대한다.
> Warden이 화낸다.

라고 쓰는 방식이 아니다.

각 Character Agent에게 현재 세계 상태를 준다.

예를 들면 Pioneer Agent에게는:

```text
Goal:
자동화 프로젝트를 성공시켜야 한다.

Want:
능력을 인정받고 싶다.

Fear:
자신이 필요 없는 사람이 되는 것.

Misbelief:
느리게 움직이는 것은 실패와 같다.

Relationship:
Scholar를 존중하지만 지나치게 신중하다고 생각한다.

Knowledge:
자동화 결과 데이터는 알고 있다.
초급 직원들의 학습 저하는 아직 모른다.
```

그리고 질문한다.

> 현재 상황에서 Pioneer가 가장 자연스럽게 취할 행동 3개는?

Scholar와 Warden에게도 같은 방식으로 묻는다.

그러면 Narrative Director가 그 행동 후보를 가지고 **충돌 가능성이 가장 높은 조합을 선택한다.**

이렇게 해야 Forced Conflict가 크게 줄어든다.

현재 AMU 문서에서도 좋은 갈등은 서로 다른 선택이 모두 일정 부분 합리적인 경우라고 이미 규정하고 있다. 

Character Agent 방식은 바로 그 원칙을 시스템적으로 구현하는 방법이다.

---

# 8. `Subplot Engine`도 별도로 두는 것이 좋다

Sherpa 사례에서 눈여겨볼 부분 중 하나가 premise를 바로 원고로 쓰지 않고,

> Arc → Episode → Scene

으로 나눈다는 점이다.

AMU는 여기에 하나를 더 넣는 게 좋다.

```text
Story Arc
   ↓
Main Plot
   +
Subplots
   ↓
Episode
   ↓
Scene
```

특히 Subplot은 세 종류 정도면 충분하다.

| Subplot                 | 역할                |
| ----------------------- | ----------------- |
| Character Subplot       | 개인의 변화·성장         |
| Relationship Subplot    | 신뢰·갈등·비밀·배신       |
| World/Knowledge Subplot | 더 큰 문제나 다음 주제로 확장 |

그리고 Subplot도 상태를 갖게 한다.

```text
seed
→ active
→ pressure
→ collision
→ payoff
→ aftermath

또는

deferred
```

이 구조가 있으면 20편 전에 던진 갈등을 다시 가져오는 것이 쉬워진다.

---

# 9. 모든 Subplot에는 `Payoff Horizon`을 두는 게 좋다

예를 들어:

```text
subplot:
  Pioneer ↔ Scholar 신뢰 문제

introducedAt:
  EP-014

payoffHorizon:
  3~8 episodes

currentState:
  pressure

trigger:
  Pioneer가 Scholar에게 숨겼던 자동화 실패 데이터

possiblePayoff:
  협력 / 결별 / 제3자의 개입
```

이런 식이다.

그러면 AI가 떡밥을 계속 만들어놓고 잊어버리는 문제를 줄일 수 있다.

그리고 Narrative Planner는 Episode를 만들 때

> 새 Subplot을 하나 만들 것인가?

보다 먼저

> **기존 미해결 Subplot 가운데 이번 사건과 자연스럽게 충돌할 수 있는 것이 있는가?**

를 검색해야 한다.

이게 세계관의 복리 효과를 만든다.

---

# 10. Episode Writer 전에 반드시 `Beat Sheet`가 있어야 한다

Sherpa의 Planner Agent도 장편 이야기에서 episode beat를 관리한다. ([Pocket FM][1])

AMU에서도 원고를 바로 쓰게 하면 안 된다.

현재 문서에서 이미 Cold Open → Trigger → Goal → Conflict → Investigation → Complication → Decision → Consequence → Resolution → Bridge 구조를 제안하고 있다.

여기에 각 beat마다 최소한 다음 정보만 붙이면 된다.

| 필드                 | 의미                |
| ------------------ | ----------------- |
| POV                | 누구의 관점인가          |
| Goal               | 이 장면에서 원하는 것      |
| Opposition         | 방해하는 것            |
| Knowledge          | 드러나는 정보           |
| Emotional Delta    | 감정이 어떻게 바뀌는가      |
| Relationship Delta | 관계가 변하는가          |
| Setup / Payoff     | 어떤 떡밥을 만들거나 회수하는가 |
| Interaction        | 사용자가 개입하는가        |
| Exit Hook          | 다음 장면을 왜 봐야 하는가   |

이 구조라면 Scene Writer는 훨씬 좁은 작업만 하게 된다.

그래서 모델이 덜 흔들린다.

---

# 11. 그리고 `Narrative Verifier`는 Writer와 반드시 분리하는 게 좋다

여기 역시 Pocket FM의 MAGNET + ATLAS 연구에서 상당히 참고할 만하다.

생성한 모델에게 다시

> 네가 만든 이야기의 문제점을 찾아줘.

라고 하는 것보다, 별도의 representation을 추출한 뒤 기존 state와 비교하는 방식이 훨씬 안정적이다. MAGNET 연구의 ATLAS도 scene 수준의 world representation을 비교하는 별도 검증 파이프라인을 사용한다. ([arXiv][2])

AMU에서는 최소 다음을 검사하면 된다.

| Verifier     | 검사                         |
| ------------ | -------------------------- |
| Canon        | 기존 설정과 모순되는가               |
| Persona      | 캐릭터답게 행동했는가                |
| Knowledge    | 알 수 없는 정보를 알고 있지는 않은가      |
| Causality    | 결과의 원인이 충분한가               |
| Relationship | 관계 변화가 갑작스럽지 않은가           |
| Setup/Payoff | 떡밥이 사라지거나 중복됐는가            |
| Intelligence | 사실과 출처가 왜곡됐는가              |
| Interaction  | 클릭을 위한 클릭이 아닌가             |
| Editorial    | pacing, tension, 반복, 설명 과다 |

중요한 건 **점수가 낮다고 자동으로 Canon을 수정하지 않는 것**이다.

AI는 수정안을 제안할 뿐이고, Canon 변경은 현재 정책대로 승인 기반이어야 한다. 현재 문서도 AI가 Canon을 임의로 확정·변경하지 않고 append-first 방식으로 사건을 누적하도록 규정하고 있다. 

---

# 12. Sherpa에서 특히 탐나는 “수정하면 뒤만 다시 계산”도 AMU에 구현할 수 있다

이건 LLM 기능이라기보다 **Dependency Graph 문제**다.

예를 들어 EP-12에서

```text
Pioneer가 Scholar의 비밀을 알게 된다.
```

를 삭제했다고 하자.

그러면 모든 후속 Episode를 다시 생성할 필요가 없다.

각 beat가 dependency를 가지고 있다면:

```text
EP12-SC4
  ↓
Pioneer.knows(secret-x)
  ↓
EP14-SC2
EP16-SC7
EP18-relationship-change
```

만 invalid 상태로 만들면 된다.

그다음 Planner가 해당 영역만 다시 설계한다.

나는 이걸 AMU에서는

> **Narrative Impact Graph**

정도로 두면 좋다고 본다.

그래프 DB까지 도입할 필요는 없다.

현재 MongoDB 구조에서도

```text
dependsOn[]
affects[]
setupIds[]
payoffIds[]
characterStateRefs[]
canonEventRefs[]
knowledgeClaimRefs[]
```

처럼 명시적 참조를 저장하면 충분히 구현 가능하다.

---

# 13. AMU에서는 Sherpa보다 오히려 더 강한 구조를 만들 수 있는 부분도 있다

Sherpa의 핵심 목적은 결국 **Entertainment Story Production**이다.

AMU는 하나가 더 있다.

> **Intelligence.**

따라서 AMU Episode는 단순히

```text
Story
→ Character
→ Conflict
```

가 아니라

```text
REAL WORLD
Intelligence / Data / Research
        ↓
Narrative Question
        ↓
Character Problem
        ↓
Story
        ↓
Investigation
        ↓
Knowledge Discovery
        ↓
Decision
        ↓
Consequence
```

가 될 수 있다.

이게 꽤 중요한 차별점이다.

Pocket FM과 Netflix가 “다음 편이 궁금해서” 시간을 가져간다면 AMU는 이상적으로

> **다음 편도 궁금하고, 그 과정에서 실제 세상을 이해하게 만드는 것**

을 노릴 수 있다.

즉 AMU의 세계관은 단순 IP가 아니라 **현실의 지식을 탐험하는 인터페이스**가 된다.

---

# 14. 그래서 `Knowledge Binding`이라는 별도 단계가 필요하다

이건 Sherpa를 그대로 따라 하면 오히려 빠질 수 있는 AMU만의 단계다.

Episode Planning이 끝났다고 바로 Scene Writing으로 가면 안 된다.

먼저 Intelligence의 정보를 scene에 연결한다.

예:

```text
Core Question
AI 자동화는 사람의 일을 없애는가?

Scene 3
→ 업무 단위 자동화 연구

Scene 5
→ 생산성 데이터

Scene 7
→ 초급 직원 학습 문제

Decision
→ 어디까지 자동화할 것인가?
```

각 Knowledge Claim에는

```text
fact
interpretation
uncertainty
source
freshness
```

를 유지한다.

그리고 Fiction과 섞일 때는 시스템이 그 경계를 알고 있어야 한다.

현재 AMU 정책에서 Fact / Interpretation / Fiction을 구분하도록 한 원칙과도 정확히 맞는다. 

---

# 15. 성과 데이터 부분은 Sherpa를 그대로 따라가면 안 된다

Pocket FM의 진짜 강점 가운데 하나는 모델 자체보다 **방대한 실제 청취 행동 데이터**다.

Pocket FM은 현재 55만 명 이상의 creator ecosystem과 250M+ listeners를 공개하고 있으며, 최근에는 AI 기반 creator ecosystem이 연간 약 250만~260만 시간의 콘텐츠를 생산한다고 밝혔다. TechCrunch 인터뷰에서도 Pocket FM 측은 수년간의 production data와 사람들이 실제 story에 어떻게 반응하는지를 AI 제작 시스템에 활용하고 있다고 설명했다. ([Pocket Entertainment][3])

하지만 AMU가 지금부터

> “AI Audience Agent가 다음 화 retention을 예측한다.”

라고 만들 필요는 없다.

Pocket Entertainment 자체도 Listener Agent가 실제 사람을 예측할 수 있는지를 별도로 검증하고 있으며, 실제 청취 데이터를 기준으로 평가한다는 점을 강조한다. ([Pocket FM][4])

AMU도 똑같이 해야 한다.

처음에는 **AI가 retention을 예측하게 하지 말고 실제 행동을 측정해야 한다.**

---

# 16. AMU가 모아야 할 Narrative Performance Data

기존 measurement plan과 연결해서 Episode 단위로 다음 정도를 측정하면 된다.

```text
Discovery
→ Episode 진입

Experience
→ Scene 진행
→ Interaction 참여
→ Decision 참여

Engagement
→ Scene별 이탈
→ 특정 장면 재생/재방문
→ 캐릭터 대화 진입

Relationship
→ Episode 저장
→ Character 관심
→ 다음 Episode

Continuation
→ Tutors
→ Play
→ Gen Studio
→ 관련 콘텐츠

Return
→ 7d / 28d Magazine Return
```

그리고 데이터가 충분히 쌓인 뒤에야

```text
Hook type
Conflict type
Character combination
Episode length
Scene density
Interaction placement
Subplot type
Bridge type
```

와 실제 retention 사이의 관계를 학습하면 된다.

그게 AMU판 Sherpa 데이터 플라이휠이다.

---

# 17. 서비스 책임도 명확하게 나눠야 한다

이 시스템 전체를 Gen Studio 기능 하나로 넣으면 안 된다.

나는 다음과 같이 구분하는 게 가장 자연스럽다고 본다.

| 시스템                       | 책임                         |
| ------------------------- | -------------------------- |
| Intelligence              | 무엇을 다룰 것인가                 |
| Narrative Runtime / Canon | 세계가 현재 어떤 상태인가             |
| Gen Studio                | Story/Character/Episode 제작 |
| Magazine                  | 완성된 Episode Experience     |
| Tutors                    | 캐릭터·주제와 대화하며 확장            |
| Play                      | 사건과 선택을 직접 체험              |
| Marketing Oops            | 배포·성과·학습                   |

즉 **제작 UI는 Gen Studio**가 맞다.

하지만 Canon이나 Character State 자체를 Gen Studio 소유 데이터로 만들어서는 안 된다.

그것은 Magazine·Tutors·Play가 모두 사용하는 **공통 Narrative Runtime**의 자산이어야 한다.

---

# 18. 사용자용 제작 UX도 “한 화면에 모든 걸 생성”하면 안 된다

Sherpa 사례를 보고

> 아이디어 입력 → 세계관 → 캐릭터 → 500화 자동 생성

버튼을 만들고 싶어질 수 있는데, AMU에는 맞지 않는다.

AMU Design 원칙대로 단계적이어야 한다.

나는 UI를 크게 세 화면으로 나누고 싶다.

### Character Studio

```text
Seed
→ Persona
→ Psychology
→ Relationships
→ Voice
→ Canon Fit
→ 승인
```

여기에서는 캐릭터를 만든다.

### Story Planner

```text
Core Question
→ Human Tension
→ Casting
→ Main Plot
→ Subplots
→ Story Arc
→ Episode Seeds
```

여기서는 이야기를 설계한다.

### Episode Studio

```text
Episode Plan
→ Beats
→ Scenes
→ Knowledge
→ Interaction
→ Draft
→ Review
→ Publish
```

이렇게 해야 사용자가 **어느 단계에서 무엇을 결정하고 있는지** 명확해진다.

---

# 19. 한 가지 예를 들어보면 이런 식이다

Intelligence가 다음 Insight를 발견했다고 하자.

> **“AI 자동화는 직업 전체보다 업무 단위부터 재편한다.”**

Narrative Planner는 이를 이렇게 변환한다.

```text
Core Question
AI가 내 일을 빼앗을까?

Human Tension
효율성 vs 인간의 역할

Pioneer
Want: 프로젝트 성공
Fear: 자신의 가치 상실
Misbelief: 빨리 자동화할수록 좋다

Scholar
Want: 올바른 판단
Fear: 되돌릴 수 없는 결정
Belief: 측정되지 않은 효율은 위험하다

Warden
Want: 구성원 보호
Secret: 과거 자동화 사고 경험
```

Main Plot은:

> 자동화를 어디까지 허용할 것인가?

Relationship Subplot은:

> Pioneer ↔ Scholar의 신뢰 문제

Character Subplot은:

> Pioneer가 “속도 = 생존”이라는 믿음을 의심하기 시작하는 것

World Subplot은:

> 자동화의 피해를 본 다른 지역

이 된다.

그러면 Episode 1에서 모든 문제를 해결하지 않는다.

```text
EP1
생산성 급증
→ Pioneer 승리처럼 보임

EP2
초급 구성원 학습 저하 발견
→ Scholar의 경고

EP3
Warden의 과거 사건 공개
→ 관계 갈등

EP4
사용자의 자동화 범위 선택
→ 결과

EP5
선택의 장기 영향
→ 새로운 AI/교육 주제로 Baton Pass
```

이제 이것은 “AI 자동화 기사”가 아니다.

**AI 자동화를 둘러싼 지식 드라마**가 된다.

---

# 20. 그리고 이 구조는 사용자 개인 세계관으로도 그대로 확장된다

이 부분이 장기적으로 굉장히 크다.

AMU 자체 공식 Universe뿐 아니라 사용자의 Universe에도 같은 Pipeline을 제공할 수 있다.

사용자가 캐릭터를 하나 만든다.

AI가 단순히 프로필 이미지만 생성해주는 게 아니라:

```text
Character
↓
Psychology
↓
World Fit
↓
Relationship
↓
Potential Conflict
↓
Story Arc Candidates
↓
Subplot Candidates
↓
Episode Seeds
```

까지 제안한다.

그러면 Gen Studio의 캐릭터 생성은

> **AI 캐릭터 이미지 생성기**

에서

> **살아 있는 캐릭터 IP 생성 시스템**

으로 바뀐다.

이건 차이가 굉장히 크다.

---

# 21. 다만 처음부터 Sherpa 전체를 만들 필요는 없다

여기서는 단계적으로 가는 게 맞다.

| 단계 | 구현                                         |
| -- | ------------------------------------------ |
| A  | CharacterDefinition / State / Knowledge 분리 |
| B  | Narrative Planner + Casting                |
| C  | Character Agent Simulation                 |
| D  | Subplot / Beat / Scene Planner             |
| E  | Canon + Persona + Causality Verifier       |
| F  | Performance Learning                       |
| 이후 | Audio / Video / Localization               |

특히 **Audio Drama 자동화나 글로벌 Localization은 지금 우선순위가 아니다.**

현재 AMU에서 먼저 증명해야 하는 것은:

> **캐릭터 + Intelligence + Story가 실제로 일반 콘텐츠보다 더 높은 몰입·관계·재방문을 만드는가?**

이것이다.

그게 확인된 뒤 영상·음성 제작 자동화를 붙여도 늦지 않다.

---

# 22. 모델 Fine-tuning도 아직 우선순위가 아니다

Pocket FM이 강력한 것은 550K+ creators와 수년간의 실제 audience data가 있기 때문이다. AMU는 그 데이터를 아직 가지고 있지 않다.

따라서 지금은 자체 Story Model을 훈련하는 것보다

```text
좋은 Schema
+
명시적인 State
+
정확한 Retrieval
+
단계별 Agent
+
Verifier
+
실제 Performance Data
```

를 먼저 만드는 편이 훨씬 효율적이다.

특히 Sherpa 자체도 “긴 prompt를 잘 쓰는 것”보다 Narrative World Model, Planner, Feedback, Storyboard처럼 **state와 orchestration을 제품화한 것**이 핵심으로 보인다. ([Pocket FM][1])

---

# 23. 결국 AMU가 Sherpa에서 가져와야 할 가장 중요한 다섯 가지

정리하면 기술 기능 자체보다 아래 구조를 가져오는 게 중요하다.

**첫째, Persona-grounded Character Agent.** 캐릭터의 행동이 plot 편의를 위해 결정되지 않고 욕망·관계·지식 상태에서 나오게 한다.

**둘째, Narrative World State.** 단순 대화 context가 아니라 세계·관계·비밀·미해결 사건을 구조화된 상태로 관리한다.

**셋째, Arc → Subplot → Episode → Scene 계층.** 바로 원고를 생성하지 않는다.

**넷째, Generator와 Verifier를 분리한다.** 이야기를 만든 AI와 Canon·인과·Persona를 검증하는 계층을 분리한다.

**다섯째, 실제 Audience Data를 Narrative Planning에 되먹인다.** AI가 재미있다고 평가한 이야기가 아니라 사용자가 실제로 계속 본 이야기를 학습한다.

---

# 결론

나는 이걸 AMU에서 꽤 중요한 시스템으로 올려도 된다고 본다.

현재 문서는 이미 `CHARACTER-SCHEMA / CANON-SCHEMA / STORY-ARC-SCHEMA / EPISODE-SCHEMA`를 분리해야 한다고 결론 내리고 있다. 

Sherpa 사례를 반영하면 여기에 **두 계층을 더 추가하는 것**이 핵심이다.

```text
CHARACTER
CANON
STORY ARC
EPISODE

        +

NARRATIVE SIMULATION
Character Agents
Plot / Subplot Engine
Scene Planner

        +

NARRATIVE VERIFICATION
Canon
Persona
Knowledge
Causality
Pacing
Engagement
```

그러면 전체 AMU 시스템은 결국 이렇게 된다.

```text
REAL-WORLD INTELLIGENCE
        ↓
Narrative Question
        ↓
Human Tension
        ↓
World / Canon Context
        ↓
Character Casting
        ↓
Persona-grounded Character Agents
        ↓
Plot + Subplot Simulation
        ↓
Arc
        ↓
Episode
        ↓
Scene
        ↓
Knowledge + Interaction
        ↓
Narrative Verification
        ↓
Human Approval
        ↓
Magazine / Social / Tutors / Play
        ↓
Audience Behavior
        ↓
Canon State + Performance Learning
        ↓
Next Intelligence / Episode
```

이 구조가 제대로 만들어지면 **AMU의 캐릭터 생성, Canon, Intelligence System, Magazine, Gen Studio, Tutors, Play가 처음으로 하나의 제작 엔진 안에서 연결된다.**

그리고 나는 여기서 가장 큰 가능성을 “AI가 소설을 잘 써준다”라고 보지 않아.

> **AMU에서 한 번 생성된 캐릭터가 자신의 기억과 욕망을 갖고 계속 살아가고, 현실 세계에서 발견된 새로운 지식과 사건이 그 캐릭터들의 삶으로 들어오며, 그 결과 새로운 Story와 Episode가 계속 태어나는 구조.**

이게 훨씬 큰 그림이야.

궁극적으로는 **AMU Intelligence가 현실 세계를 읽고, Narrative Engine이 그 현실을 AMU 세계의 사건으로 번역하고, 캐릭터들이 그 사건을 살아가는 구조**가 된다. 이 정도까지 가면 AMU의 세계관은 단순 설정집이 아니라 **지식·캐릭터·사용자 경험이 계속 진화하는 Narrative Operating System**에 가까워진다.

[1]: https://pocketfm.com/sherpa?utm_source=chatgpt.com "Sherpa by Pocket FM | Free AI Fiction Writing Tool"
[2]: https://arxiv.org/abs/2607.00918?utm_source=chatgpt.com "From Personas to Plot: Character-Grounded Multi-Agent Story Generation for Long-Form Narratives"
[3]: https://pocketentertainment.ai/?utm_source=chatgpt.com "Pocket Entertainment · Building the future of storytelling."
[4]: https://pocketfm.com/about-us?utm_source=chatgpt.com "About Pocket FM – The World’s #1 Audio Series Platform"
