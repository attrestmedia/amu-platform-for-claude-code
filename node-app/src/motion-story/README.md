# AMU Motion Story — 인터랙티브 아티클 모션 런타임

인터랙티브 아티클 전용 리소스(`interactive-article.v1`)를 node-app 표면에서 재생하는 런타임이다.
**모든 모션은 시간 `t`(ms)만으로 결정되는 순수 함수**로 계산한다. 그래서 웹 재생·스크럽·향후 영상 export가 같은 화면을 만든다.

- 인터랙티브 아티클은 `/magazine/{slug}` 기사를 그대로 쓰지 않는다. 원문 기사(`source`)를 기반으로 **인터랙티브 전용으로 재구성한 리소스**를 쓴다.
- 리소스는 정적 파일로 번들한다 (`src/interactive-articles`).
- 새 의존성은 없다. 외부 import는 `react`와 `lucide-react`(React 표면)뿐이다. 이징은 `text-motions/core/easing`을 재사용한다.

## 구성

| 위치 | 역할 |
| --- | --- |
| `motion-story/tokens.ts` | `motion-tokens.v1` 디자인 토큰 (duration · easing · stagger · readingPace · 카드 루프 예산 · a11y) |
| `motion-story/presets.ts` | Motion Design System 프리셋 19종 (enter · emph · exit · camera · trans). 순수 샘플러 + WAAPI 키프레임 |
| `motion-story/contract.ts` | `interactive-article.v1` 타입 + 엄격 검증 `parseInteractiveArticle` |
| `motion-story/compiler.ts` | Beat → Scene 초안, readingPace 타이밍, 표면(hero · homeCard) 초안 |
| `motion-story/timeline.ts` | 리소스 → 표면별 시간표 → 임의 시점 샘플링, 루프 해석, 내레이션 cue |
| `motion-story/clock.ts` | rAF 클럭 (외부 마스터 클럭 = 오디오 `currentTime` 지원) |
| `motion-story/guards.ts` | reduced-motion · 탭 숨김 · 뷰포트당 active 표면 1개 |
| `motion-story/gesture.ts` | 시그니처 인터랙션 제스처 상태 머신 + DOM 바인딩 + 키보드 대체 경로 |
| `interactive-articles/` | 정적 리소스 레지스트리 (검증 실패 시 제외 = fail-closed) + 검증용 샘플 |
| `components/module/magazine/story/` | React 표면: Story 플레이어 · Hero · 홈 카드/덱 · 결정적 장면 렌더러 |

## 사용

```tsx
import { getInteractiveArticle, listHomeCardInteractiveArticles } from "../interactive-articles";
import { InteractiveStoryPlayer, InteractiveArticleHero, InteractiveArticleHomeDeck } from "../components/module/magazine/story";

// 홈(/) — published + homeCard 표면이 있는 리소스만. signature 등급은 1장만 유지된다.
<InteractiveArticleHomeDeck
  resources={listHomeCardInteractiveArticles()}
  hrefFor={(r) => `/interactive/${r.slug}`}            // 라우트 확정 후 연결
  onDeckAction={(action, r) => { /* read · explore-category · like */ }}
  onImpression={(r) => trackGaEvent("article_experience_impression", { stage: "entry", surface: "home_card", experience_id: r.articleId, story_revision: r.revision })}
/>

// 아티클 진입부 Hero (1회 재생) + Story 플레이어 (9:16)
const resource = getInteractiveArticle(slug);
<InteractiveArticleHero resource={resource} actions={<button onClick={openStory}>스토리로 보기</button>} />
<InteractiveStoryPlayer resource={resource} onClose={closeStory} onComplete={...} outroAction={<a href={sourceUrl}>원문 기사 보기</a>} />
```

리소스를 새로 만들 때는 Beat만 쓰고 나머지를 초안으로 채울 수 있다.

```ts
const scenes = draftScenesFromBeats(beats);
const surfaces = draftSurfaces(beats, scenes, { homeCardTier: "motion" });
// → 편집 후 parseInteractiveArticle(resource) 통과 확인 → interactive-articles/index.ts 의 RESOURCES 에 등록
```

## 불변식

1. 텍스트·링크·CTA는 항상 DOM에 있다. 초기 렌더(SSR)는 텍스트가 모두 보이는 **정지 프레임**이다. 모션은 hydration 뒤에만 시작한다.
2. 애니메이션 채널은 `opacity` · `transform` · `clip-path`(+밑줄 `background-size`)뿐이다.
3. 장면 렌더러(`story/scenes/**`)와 순수 코어는 `Math.random` · `Date` · `performance.now` · `fetch` · `setTimeout` · `setInterval` · `window.scroll*`를 쓰지 않는다.
4. reduced-motion이면 자동 재생하지 않는다. 뷰포트당 active 모션 표면은 1개다. 탭이 숨겨지면 정지한다. 5초를 넘는 자동 재생에는 일시정지 버튼(44×44, `aria-pressed`)을 둔다.
5. 모든 제스처 목적지는 버튼과 키보드로도 도달할 수 있다.

### 결정성 규칙 ESLint (적용 권고)

```js
{
  files: ["src/components/module/magazine/story/scenes/**", "src/motion-story/{tokens,presets,contract,compiler,timeline}.ts"],
  rules: {
    "no-restricted-globals": ["error", "Date", "fetch", "setTimeout", "setInterval", "performance"],
    "no-restricted-properties": ["error",
      { object: "Math", property: "random" },
      { object: "window", property: "scroll" }, { object: "window", property: "scrollTo" }, { object: "window", property: "scrollBy" }],
  },
}
```
