**최종 결정** => Rendiv + Motion Canvas

===

remotion과 유사한 기능의 완전 무료 오픈소스도 있을까?

===

있습니다. 그리고 **AMU처럼 TypeScript/React 기반에서 AI 영상 자동화를 붙이려는 목적이라면 꽤 괜찮은 후보가 몇 개 있습니다.**

제가 현재 기준으로 보면 **Revideo → Motion Canvas → Rendiv** 순으로 먼저 검토할 만합니다.

| 프로젝트              | 라이선스           | React     | TypeScript | 서버 렌더링 | Remotion 유사도 | 현재 판단       |
| ----------------- | -------------- | --------- | ---------- | ------ | ------------ | ----------- |
| **Revideo**       | **MIT**        | Player 지원 | ✅          | ✅      | ★★★★☆        | **가장 추천**   |
| **Rendiv**        | **Apache 2.0** | ✅ 핵심      | ✅          | ✅      | ★★★★★        | 매우 흥미롭지만 신생 |
| **Motion Canvas** | **MIT**        | ❌         | ✅          | 가능     | ★★★☆☆        | 모션그래픽 강점    |
| MoviePy           | MIT            | ❌ Python  | ❌          | ✅      | ★★☆☆☆        | 후처리용        |
| FFmpeg            | LGPL/GPL       | ❌         | ❌          | ✅      | ★☆☆☆☆        | 최종 렌더 엔진    |

### 1. Revideo — 지금 AMU라면 가장 먼저 테스트

**MIT 라이선스**입니다. 개인·기업·SaaS·상업적 자동 영상 생성 서비스에서도 별도 라이선스 비용 없이 사용할 수 있습니다. ([github.com][1])

구조도 AMU와 상당히 잘 맞습니다.

```text
TypeScript Scene
        ↓
텍스트 / 이미지 / Video / Audio
        ↓
animation
        ↓
headless renderer
        ↓
FFmpeg
        ↓
MP4
```

그리고 중요한 기능들이 이미 들어 있습니다.

* TypeScript 기반
* headless rendering
* Node 환경에서 `renderVideo()`
* 병렬 렌더링
* React `<Player />`를 통한 브라우저 미리보기
* Video / Audio
* 프레임 단위 동기화
* Cloud Run 같은 서버 환경에서 렌더링 가능

특히 프로젝트 자체가 **AI가 TypeScript scene을 생성하는 사용 사례**를 명시적으로 염두에 두고 있습니다. 공식 README에서도 Claude나 Codex가 프롬프트에서 scene을 생성할 수 있다고 설명합니다.

예를 들어 AMU에서는:

```text
Magazine 글
 ↓
Intelligence
 ↓
AI 대본
 ↓
scene JSON
 ↓
Gen Studio 이미지
 ↓
ElevenLabs 음성
 ↓
Revideo
 ├─ 이미지
 ├─ 자막
 ├─ 카메라 이동
 ├─ 텍스트 애니메이션
 ├─ BGM
 └─ Transition
 ↓
9:16 Shorts / Reels
```

같은 파이프라인을 만들 수 있습니다.

**현재 제일 현실적인 Remotion 대체재라고 봅니다.**

---

### 2. Rendiv — 사실 구조만 보면 Remotion과 가장 비슷함

이건 더 흥미롭습니다.

Rendiv는 아예 스스로를

> React + TypeScript 기반 AI-first programmatic video editor

로 정의하고 있습니다.

그리고 **Apache 2.0**, 즉 상업적 SaaS에서도 사용할 수 있는 완전한 오픈소스입니다.

API도 Remotion과 상당히 닮았습니다.

Remotion:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

return (
  <AbsoluteFill>
    ...
  </AbsoluteFill>
);
```

Rendiv:

```tsx
const frame = useFrame();
const { fps } = useCompositionConfig();

return (
  <Fill>
    ...
  </Fill>
);
```

그리고 현재 기능도 꽤 놀랍습니다.

```text
React 18/19
TypeScript
Vite
Playwright
FFmpeg

Sequence
Series
Loop
Freeze

interpolate()
spring()

Video
Audio
Image
AnimatedImage

Transitions
SVG
Lottie
Three.js
Captions
Motion Blur

Browser Player
Studio
Timeline
Server Render API
Docker
```

심지어 AI 에이전트용 Skill도 제공합니다.

그래서 **기능 철학만 보면 AMU에는 Rendiv가 제일 잘 맞습니다.**

문제는 성숙도입니다.

현재 GitHub 규모가 약 **124 stars** 수준이라, 4천 stars 수준의 Revideo나 1.9만 stars 수준의 Motion Canvas보다 훨씬 젊습니다.

따라서 지금 바로 AMU의 핵심 인프라를 걸기에는 조금 공격적인 선택입니다.

---

### 3. Motion Canvas — 모션그래픽이라면 강력

Motion Canvas도 **MIT 라이선스**입니다.

그리고 상당히 성숙했습니다. 현재 GitHub 약 **19K stars** 수준입니다.

다만 철학이 다릅니다.

Remotion이

```text
React UI
+
시간(frame)
=
Video
```

라면 Motion Canvas는

```text
Canvas Scene
+
Generator
+
Timeline
=
Animation
```

쪽입니다.

그래서 이런 영상:

```text
텍스트 모션그래픽
인포그래픽
다이어그램
그래프
교육 콘텐츠
코드 설명
데이터 시각화
키네틱 타이포그래피
```

에는 오히려 Remotion보다 잘 맞을 수도 있습니다.

반면

```tsx
<div>
  <Image />
  <Caption />
  <Video />
</div>
```

같은 **웹 UI를 그대로 영상으로 만드는 방식**에서는 Remotion/Revideo/Rendiv 쪽이 편합니다.

---

## 그리고 FFmpeg는 거의 반드시 들어갑니다

FFmpeg 역시 무료 오픈소스입니다.

기본 FFmpeg는 주로 **LGPL 2.1+**이고, 특정 GPL 옵션을 활성화하면 전체 빌드가 GPL 조건을 따르게 됩니다.

FFmpeg는 Remotion 대체재라기보다:

```text
Revideo / Rendiv / Motion Canvas
             ↓
          FFmpeg
             ↓
MP4 / WebM / Audio / Encoding
```

처럼 **최종 영상 처리 엔진** 역할입니다.

---

# AMU라면 이렇게 선택하겠습니다

현재 구조를 고려하면 저는 **Revideo를 1순위 PoC**로 봅니다.

```text
                  AMU Video Engine

Magazine / Gen Studio / Marketing Oops
                  │
                  ▼
          Video Composition JSON
                  │
      ┌───────────┼────────────┐
      ▼           ▼            ▼
   Script       Assets        Audio
      │        Gen Studio   ElevenLabs
      └───────────┬────────────┘
                  ▼
               Revideo
                  │
                  ▼
                FFmpeg
                  │
         ┌────────┼────────┐
         ▼        ▼        ▼
       9:16     1:1      16:9
      Shorts  Instagram YouTube
```

그리고 중요한 건 **Revideo 자체를 영상 생성기의 SSOT로 만들지 않는 것**입니다.

AMU 내부에는 이런 중립적인 composition contract를 두는 게 좋습니다.

```ts
type VideoComposition = {
  scenes: VideoScene[];
  width: number;
  height: number;
  fps: number;
  duration: number;
  audio?: AudioTrack[];
};
```

각 Scene이:

```ts
{
  type: "image",
  start: 0,
  duration: 4,
  asset: "...",
  animation: {
    type: "zoom-in",
    easing: "ease-out"
  }
}
```

처럼 되고,

```text
AMU VideoComposition
       ↓
Revideo Adapter
       ↓
Revideo Scene
```

로 변환하게 만드는 겁니다.

그러면 나중에

```text
Revideo
→ Rendiv
→ 자체 WebGL Renderer
→ FFmpeg
```

로 바꾸더라도 **AMU 영상 데이터와 AI 프롬프트 시스템은 그대로 유지**할 수 있습니다.

### 제 선택

**지금 당장 PoC:** `Revideo + FFmpeg`

**장기적으로 계속 관찰:** `Rendiv`

**인포그래픽·교육·모션그래픽 특화:** `Motion Canvas`

특히 **Rendiv는 AMU가 원하는 “AI가 React 코드를 만들고 그것이 곧 영상이 되는 시스템”과 거의 정확하게 일치**해서, 아직 작다는 점만 아니면 오히려 가장 매력적입니다. Revideo와 Rendiv 두 개를 실제 **AMU Gen Studio 자동 숏폼 생성 기준으로 기능·렌더링 아키텍처·서버 비용·Three.js 지원·AI 에이전트 생성 난이도까지 비교**해보면 어느 쪽을 선택해야 할지 꽤 명확해질 것 같습니다.

[1]: https://github.com/midrender/revideo "https://github.com/midrender/revideo"

===

좋아. 경량화를 포함해서 제안한 기준들과 함께 비교해줘. 

===

비교해보면 결론이 조금 바뀝니다. **AMU가 지금 “완전 무료 오픈소스 + 자동 숏폼 대량 생성 + 경량화”를 우선한다면 Revideo를 1순위로 두는 편이 좋습니다.** Rendiv는 React/AI 친화성에서는 더 매력적이지만, 지금 AMU가 필요로 하는 건 영상 편집기 자체보다 **안정적이고 값싸게 반복 렌더링하는 Gen Studio용 영상 엔진**에 더 가깝기 때문입니다.

현재 기준으로 네 가지를 같이 놓고 보면 이렇습니다.

### 종합 비교

| 기준           |   Revideo |           Rendiv | Motion Canvas |      Remotion |
| ------------ | --------: | ---------------: | ------------: | ------------: |
| 완전 무료 OSS    | ★★★★★ MIT | ★★★★★ Apache 2.0 |     ★★★★★ MIT | ★★☆☆☆ 특수 라이선스 |
| 렌더링 경량성      | **★★★★★** |            ★★★☆☆ |         ★★★★☆ |         ★★★☆☆ |
| 서버 비용 잠재력    | **★★★★★** |            ★★★☆☆ |         ★★★★☆ |         ★★★☆☆ |
| React 친화성    |     ★★★☆☆ |        **★★★★★** |         ★★☆☆☆ |     **★★★★★** |
| TypeScript   |     ★★★★★ |            ★★★★★ |         ★★★★★ |         ★★★★★ |
| Next.js 연동   |     ★★★★☆ |        **★★★★★** |         ★★★☆☆ |         ★★★★★ |
| AI Agent 생성  |     ★★★★☆ |        **★★★★★** |         ★★★★☆ |         ★★★★★ |
| 이미지 기반 숏폼    |     ★★★★★ |            ★★★★★ |         ★★★★☆ |         ★★★★★ |
| 자막/오디오       |     ★★★★☆ |            ★★★★★ |         ★★★☆☆ |         ★★★★★ |
| Three.js/3D  |     ★★★★☆ |        **★★★★★** |         ★★★☆☆ |         ★★★★★ |
| Lottie 등 확장  |     ★★★☆☆ |            ★★★★★ |         ★★★☆☆ |         ★★★★★ |
| 브라우저 Preview |     ★★★★★ |            ★★★★★ |         ★★★☆☆ |         ★★★★★ |
| 서버 렌더 API    |     ★★★★★ |            ★★★★★ |         ★★★☆☆ |         ★★★★★ |
| 분산 렌더링       |     ★★★★☆ |            ★★★☆☆ |         ★★☆☆☆ |     **★★★★★** |
| 프로젝트 성숙도     |     ★★★★☆ |            ★★☆☆☆ |         ★★★★☆ |     **★★★★★** |
| 라이선스 락인 위험   | **매우 낮음** |        **매우 낮음** |         매우 낮음 |            있음 |
| AMU 현재 적합도   | **★★★★★** |            ★★★★☆ |         ★★★☆☆ |         ★★★★☆ |

Revideo는 MIT이고 현재 약 4천 GitHub stars를 갖고 있으며, headless rendering·React Player·병렬 렌더링을 공식적으로 지원합니다. Rendiv는 Apache 2.0이고 React 18/19 + TypeScript + Vite + Playwright + FFmpeg 구조지만 아직 약 124 stars 수준이며 distributed/cloud rendering은 로드맵 단계입니다. ([GitHub][1])

---

# 1. 경량화에서는 Revideo가 확실히 흥미롭다

둘의 렌더링 구조가 상당히 다릅니다.

### Revideo

```text
TypeScript Scene
       ↓
Canvas rendering
       ↓
WebCodecs VideoEncoder
       ↓
Mute MP4
       │
       ├── Audio/Video audio extraction
       │          ↓
       │       FFmpeg
       │
       └──────────┐
                  ↓
             Final MP4
```

Revideo 공식 문서에 따르면 **렌더링 대부분이 브라우저 Canvas + WebCodecs에서 진행되고**, Node 측 FFmpeg는 주로 오디오 처리와 최종 병합을 담당합니다. 멀티 워커와 `renderPartialVideo()`를 통한 serverless 병렬화도 지원합니다. ([GitHub][2])

반면 Rendiv는:

```text
React Component
       ↓
Vite bundle
       ↓
Playwright
       ↓
Chromium
       ↓
Frame capture
       ↓
PNG/Image frames
       ↓
FFmpeg
       ↓
MP4
```

형태입니다. 공식적으로 Playwright/Chromium이 프레임을 병렬 캡처한 뒤 FFmpeg가 합성합니다. concurrency도 조정할 수 있습니다. ([GitHub][3])

그래서 서버 관점에서는 일반적으로:

| 자원                   | Revideo      | Rendiv          |
| -------------------- | ------------ | --------------- |
| Chromium             | 필요           | 필요              |
| DOM 렌더               | 적음           | **많음**          |
| Canvas 중심            | **예**        | 경우에 따라          |
| 프레임 이미지 생성           | 최소화 가능       | **핵심 과정**       |
| FFmpeg 역할            | 주로 Audio/Mux | 프레임→영상 핵심       |
| Disk/Memory 압력       | 상대적으로 낮음     | 상대적으로 높음        |
| concurrency 증가 시 RAM | 증가           | **더 빠르게 증가 가능** |

따라서 **같은 서버에서 수십~수백 개 숏폼을 만드는 목적이라면 Revideo 구조가 상당히 매력적입니다.**

다만 이건 현재 두 엔진의 **아키텍처를 기반으로 한 판단**입니다. 동일한 AMU 영상 템플릿으로 직접 벤치마크한 결과는 아니므로 “몇 % 싸다” 같은 숫자를 붙이는 건 아직 이릅니다.

---

# 2. 그런데 개발 경험에서는 Rendiv가 이긴다

Rendiv는 사실상 Remotion 방식입니다.

```tsx
function Scene() {
  const frame = useFrame();

  return (
    <Fill>
      <h1
        style={{
          opacity: interpolate(frame, [0, 30], [0, 1]),
        }}
      >
        AMU
      </h1>
    </Fill>
  );
}
```

그냥 **React Component**입니다.

현재 AMU가 Next.js / React / TypeScript 기반이라는 점에서는 굉장히 큰 장점입니다.

AI에게도:

> “첫 30프레임 동안 제목을 fade-in하고 60프레임부터 이미지를 zoom-in해.”

라고 하면 React 코드를 생성시키기 쉽습니다.

Rendiv 자체도 이걸 핵심 방향으로 잡고 있고 AI agent skill까지 제공합니다. Composition을 deterministic React function으로 설계하고 Claude Code 등의 CLI 에이전트를 Studio 안에서 실행할 수 있게 해놓았습니다. ([GitHub][3])

### Revideo는 조금 다릅니다.

```tsx
export default makeScene2D(function* (view) {
  const title = createRef<Txt>();

  view.add(
    <Txt
      ref={title}
      text="AMU"
      opacity={0}
    />,
  );

  yield* title().opacity(1, 1);
});
```

JSX처럼 보이지만 **React JSX가 아닙니다.**

Generator + Signal + Scene Graph를 이해해야 합니다.

그래서 AI 입장에서:

```text
React / CSS
→ 엄청나게 학습 데이터 많음

Rendiv/Remotion API
→ React 지식 대부분 재사용

Revideo
→ 별도 DSL/API 학습 필요
```

가 됩니다.

다만 Revideo도 현재 README에서 Claude/Codex가 scene을 직접 생성하는 것을 공식 사용 사례로 내세우고 있습니다. ([GitHub][1])

그래서 AI 생성 난이도는:

**Remotion ≈ Rendiv > Revideo > Motion Canvas**

정도로 보겠습니다.

---

# 3. Three.js까지 생각하면 Rendiv 쪽이 편하다

이건 Rendiv가 꽤 매력적입니다.

현재 별도 패키지들이 이미 나뉘어 있습니다.

```text
@rendiv/three
@rendiv/lottie
@rendiv/captions
@rendiv/transitions
@rendiv/shapes
@rendiv/paths
@rendiv/motion-blur
@rendiv/fonts
@rendiv/gif
```

즉 필요한 것만 가져올 수 있습니다. ([GitHub][3])

예를 들어 AMU의 고품질 인터랙티브 콘텐츠에서 사용하려는:

```text
Three.js Scene
+
AI 생성 이미지
+
카메라 이동
+
텍스트
+
Particles
+
Lottie
+
자막
```

같은 조합에서는 Rendiv가 자연스럽습니다.

Revideo도 Three.js 예제 프로젝트를 공식적으로 제공하고 있고 WebGL/shader 관련 기능도 존재합니다. ([GitHub][4])

다만 생태계가:

```text
Rendiv
@rendiv/three

vs

Revideo
Canvas/WebGL/custom integration
```

이라는 차이가 있어서 **3D 제작 개발 경험은 Rendiv 쪽이 좋아 보입니다.**

참고로 이 분야의 기준점은 여전히 Remotion입니다. `@remotion/three`가 있고 React Three Fiber를 공식 지원하며 captions와 Lottie 역시 별도 공식 패키지가 존재합니다. ([GitHub][5])

---

# 4. 대량 숏폼에서는 Three.js보다 이쪽이 더 중요하다

AMU가 실제 자동화하려는 영상을 생각하면 대부분이:

```text
이미지
+
Ken Burns Zoom/Pan
+
텍스트
+
AI Voice
+
Caption
+
Background Music
+
Transitions
+
일부 Particle / Shader
```

일 가능성이 높습니다.

이런 영상에서 매번 React DOM과 Three.js를 풀로 돌릴 이유는 없습니다.

예를 들어 30초 × 30fps면:

```text
900 frames
```

입니다.

100개 영상이면:

```text
90,000 frames
```

이고,

1,000개라면:

```text
900,000 frames
```

입니다.

이 단계부터는 개발 편의성보다:

```text
한 프레임 렌더 비용
×
총 프레임 수
```

가 중요해집니다.

그래서 **AMU의 기본 영상 Renderer는 가능한 가벼워야 한다**고 봅니다.

이 점 때문에 Revideo를 다시 1순위로 올리는 겁니다.

---

# 5. Rendiv에서 가장 걱정되는 것은 성능보다 성숙도다

기능 목록만 보면 오히려 Rendiv가 가장 좋습니다.

문제는 아직 매우 젊다는 겁니다.

현재 GitHub 규모가 약 124 stars 수준인 반면:

```text
Remotion     ≈ 58K
MotionCanvas ≈ 19K
Revideo      ≈ 4K
Rendiv       ≈ 124
```

정도입니다. ([Remotion][6])

그리고 Rendiv의:

```text
Cloud / distributed rendering
```

은 아직 로드맵 항목입니다. ([GitHub][3])

AMU 핵심 인프라에 넣는다면 이 차이가 큽니다.

영상 렌더링은 생각보다:

```text
폰트
오디오 sync
remote image
CORS
codec
alpha
frame drop
Chromium crash
memory leak
FFmpeg
timeout
GPU
```

같은 엣지 케이스가 많기 때문입니다.

---

# 6. 그렇다고 Revideo가 완전히 안정적이라는 뜻도 아니다

여기도 주의점은 있습니다.

현재 공개 issue에는:

* multi-scene audio
* local audio
* FFmpeg
* shader
* rendered video sound

관련 이슈들이 남아 있습니다. ([GitHub][7])

그리고 문서도 최근 큰 리팩터링 이후 새 문서로 이전 중이며, 공식 docs repo 자체가 아직 work-in-progress라고 명시하고 있습니다. ([GitHub][8])

즉 안정성은:

**Remotion > Revideo > Rendiv**

정도로 보는 게 안전합니다.

완전 OSS 조건을 걸면 **Revideo가 현재 가장 균형이 좋다**는 얘기입니다.

---

# 7. Motion Canvas는 왜 1순위가 아닌가

Motion Canvas 자체는 훌륭합니다.

MIT이고 약 1.9만 stars이며 2026년에도 repo 업데이트가 있습니다. ([GitHub][9])

하지만 공식 설명 자체가:

> informative vector animations와 voice-over synchronization을 위한 specialized tool이며 traditional video editing software의 대체재가 아니다

라고 되어 있습니다. ([GitHub][10])

그래서:

```text
경제 데이터 그래프
↓
막대 상승
↓
화살표
↓
텍스트 강조
↓
다이어그램
```

같은 **AMU Magazine 설명형 영상**에는 굉장히 좋습니다.

반면 Gen Studio의 범용 AI 영상 엔진으로 쓰기에는 Revideo/Rendiv가 더 적합합니다.

---

# 8. AMU 기준으로 가중치를 적용하면

제가 AMU 상황이라면 가중치를 이렇게 잡겠습니다.

| 평가 기준             |      비중 |
| ----------------- | ------: |
| 렌더링 경량성 / 비용      | **25%** |
| React/TS 및 AMU 통합 |     15% |
| AI Agent 생성성      |     15% |
| 안정성 / 성숙도         | **15%** |
| 완전 OSS / 락인       |     10% |
| 영상 기능             |     10% |
| Three.js 등 확장     |      5% |
| 대규모 렌더링           |      5% |

이를 현재 상황에 적용한 제 평가치는:

| 엔진            |       AMU 점수 |
| ------------- | -----------: |
| **Revideo**   | **약 82/100** |
| Rendiv        |     약 77/100 |
| Motion Canvas |     약 72/100 |
| Remotion      |    약 86/100* |

* Remotion은 기술적으로는 가장 완성도가 높지만 **완전 무료 OSS 조건을 충족하지 않으므로 실질 후보에서는 제외**합니다. 현재 4인 이상 영리 조직은 Company License가 필요합니다. ([Remotion Pro][11])

---

# 9. 그런데 AMU에서는 Renderer 자체를 SSOT로 만들면 안 된다

이게 실제 선택보다 더 중요합니다.

제가 제안하는 구조는:

```text
                   Gen Studio
                       │
                       ▼
              Video Composition
                  Contract
                       │
       ┌───────────────┼───────────────┐
       │               │               │
     Script           Assets          Audio
       │               │               │
       │        ┌──────┴──────┐        │
       │       Image        Video      │
       │        │             │        │
       └────────┴──────┬──────┴────────┘
                       ▼
                Revideo Adapter
                       │
                       ▼
                Render Worker
                       │
                 WebCodecs/FFmpeg
                       │
                       ▼
                    Asset
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Magazine   Marketing Oops   Store
```

여기서 AMU가 저장해야 하는 것은 **Revideo 코드가 아니라 영상의 의미 구조**입니다.

예를 들어:

```ts
type VideoScene = {
  id: string;
  durationMs: number;

  layers: VideoLayer[];

  transition?: {
    type: "fade" | "slide" | "zoom";
    durationMs: number;
  };
};
```

그리고:

```ts
type VideoLayer =
  | ImageLayer
  | TextLayer
  | VideoLayer
  | AudioLayer
  | CaptionLayer
  | ShapeLayer;
```

정도로 시작합니다.

AI도:

```text
LLM
 ↓
VideoComposition JSON
 ↓
Validation
 ↓
Revideo Adapter
 ↓
Video
```

로 해야 합니다.

**AI가 매번 Revideo TypeScript를 자유롭게 작성하게 만드는 구조는 초기에는 추천하지 않습니다.**

---

# 10. 이 구조가 AI 생성에도 더 좋다

예를 들어 AI가 이런 JSON만 만들게 합니다.

```json
{
  "durationMs": 5000,
  "layers": [
    {
      "type": "image",
      "assetId": "img_123",
      "animation": {
        "type": "zoom",
        "from": 1,
        "to": 1.12
      }
    },
    {
      "type": "caption",
      "text": "가격은 숫자가 아니라 비교의 문제입니다.",
      "startMs": 800,
      "endMs": 4000
    }
  ]
}
```

그러면 Renderer가 바뀌어도:

```text
Revideo
    ↓
Rendiv
```

Adapter만 바꾸면 됩니다.

또한 LLM이 잘못된:

```tsx
useEffect(...)
setInterval(...)
fetch(...)
random()
```

같은 코드를 영상 렌더 과정에 끼워 넣는 문제도 차단할 수 있습니다.

이건 Intelligence System에서 provider/model 저장 계약을 중립화했던 것과 비슷한 철학입니다.

---

# 11. Renderer는 Next.js 프로세스와 분리하는 게 좋다

경량화 관점에서 이것도 중요합니다.

이렇게는 권하지 않습니다.

```text
Next.js
 ├ API
 ├ SSR
 ├ User request
 └ Chromium + FFmpeg ❌
```

렌더 하나가 CPU/RAM을 먹으면 일반 웹 요청까지 영향을 받습니다.

대신:

```text
Next.js / Gen Studio API
          │
          ▼
      Render Job
          │
          ▼
┌─────────────────────┐
│ Video Render Worker │
│                     │
│ Revideo             │
│ Chromium            │
│ FFmpeg              │
└─────────────────────┘
          │
          ▼
        Asset
```

가 좋습니다.

처음에는 별도 대규모 인프라까지 만들 필요 없이:

```text
1 worker
concurrency 1~2
```

로 시작하면 됩니다.

사용량이 올라오면:

```text
worker 1
→ worker N
→ job queue
→ autoscaling
```

순으로 확장하면 됩니다.

이게 AMU의 현재 단계에도 맞습니다.

---

# 최종적으로는 이렇게 선택하겠습니다

**지금은 Revideo 하나만 도입하는 쪽입니다.**

```text
P0
VideoComposition Contract

        ↓

P1
Revideo Adapter

        ↓

P2
독립 Render Worker

        ↓

P3
Gen Studio
"영상 생성" 기능

        ↓

P4
Marketing Oops
Shorts / Reels 자동 생성

        ↓

P5
실제 렌더 벤치마크
CPU / RAM / render time / 비용

        ↓

P6
필요할 경우 Rendiv 재평가
```

특히 **Revideo와 Rendiv를 처음부터 동시에 지원할 필요는 없습니다.** 그건 현재 AMU에는 오버엔지니어링입니다.

대신 Contract만 renderer-neutral하게 잡아 놓고 **Revideo를 실제 생산 엔진으로 사용**하는 게 가장 단순합니다.

그리고 6~12개월 뒤 Rendiv가

```text
distributed renderer 안정화
커뮤니티 확대
benchmark 축적
Three.js/Lottie 안정화
caption/audio edge case 안정화
```

까지 오면 그때 교체 여부를 보면 됩니다.

### 한 문장으로 정리하면

**Remotion의 가장 좋은 무료 대체재를 찾는다면 Revideo, Remotion과 가장 닮은 미래형 대체재를 찾는다면 Rendiv입니다.**

그리고 **AMU처럼 영상 생성량이 늘어날 가능성이 크고 서버 비용까지 중요하다면 현재는 Revideo 쪽에 한 표를 주겠습니다.** 특히 Gen Studio의 기본 2D/이미지 숏폼은 Revideo로 처리하고, 나중에 정말 고급 3D 영상 수요가 확인됐을 때만 Three.js 전용 경로를 추가하는 게 가장 가볍고 안정적인 방향입니다.

[1]: https://github.com/midrender/revideo?utm_source=chatgpt.com "GitHub - midrender/revideo: Create Videos with Code · GitHub"
[2]: https://github.com/midrender/revideo/blob/main/packages/docs/src/content/guide/rendering-videos.mdx?utm_source=chatgpt.com "revideo/packages/docs/src/content/guide/rendering-videos.mdx at main · midrender/revideo · GitHub"
[3]: https://github.com/thecodacus/rendiv?utm_source=chatgpt.com "GitHub - thecodacus/rendiv: The video editor built for AI. Create videos with React + TypeScript — designed for AI agents, LLM pipelines, and automated production. Fully open source. · GitHub"
[4]: https://github.com/midrender/examples?utm_source=chatgpt.com "GitHub - midrender/examples: A collection of example projects built with Revideo · GitHub"
[5]: https://github.com/remotion-dev/skills/blob/main/skills/remotion-best-practices/remotion-markup/3d.md?utm_source=chatgpt.com "skills/skills/remotion-best-practices/remotion-markup/3d.md at main · remotion-dev/skills · GitHub"
[6]: https://www.remotion.dev/?from=explinks.com&utm_source=chatgpt.com "Remotion | Make videos programmatically"
[7]: https://github.com/midrender/revideo/issues?utm_source=chatgpt.com "Issues · midrender/revideo · GitHub"
[8]: https://github.com/midrender/docs?utm_source=chatgpt.com "GitHub - midrender/docs · GitHub"
[9]: https://github.com/motion-canvas/motion-canvas?utm_source=chatgpt.com "GitHub - motion-canvas/motion-canvas: Visualize Your Ideas With Code · GitHub"
[10]: https://github.com/motion-canvas/motion-canvas/blob/main/packages/docs/docs/intro.md?utm_source=chatgpt.com "motion-canvas/packages/docs/docs/intro.md at main · motion-canvas/motion-canvas · GitHub"
[11]: https://www.remotion.pro/license?utm_source=chatgpt.com "Licensing | Remotion Pro"

===

Rendiv와 MotionCanvas 두 축으로 가져가는 건 어때?? 각 콘텐츠의 목적에 맞게 모션을 구성하기에 좋을 것 같아.

===

네. **오히려 `Rendiv + Motion Canvas` 두 축은 `Revideo + Rendiv`보다 AMU에 더 설득력 있는 조합**이라고 봅니다.

이유는 간단합니다. Revideo와 Rendiv는 상당 부분 같은 문제를 풀기 때문에 중복이 큽니다. 반면 **Rendiv와 Motion Canvas는 영상의 목적 자체가 다릅니다.** Motion Canvas 공식 설명도 TypeScript generator 기반이며, 특히 **정보 전달형 벡터 애니메이션과 보이스오버 동기화**를 위해 설계된 도구라고 명시합니다. ([GitHub][1]) Rendiv는 반대로 React/TypeScript 기반의 범용 프로그래매틱 영상 제작과 AI 자동화를 목표로 하고 Three.js, Lottie, transition, media composition 등을 지원합니다. ([GitHub][2])

## 제가 잡을 경계는 이렇습니다

### ① Rendiv — Visual / Story / Media 축

**“보는 맛”이 중요한 콘텐츠**를 담당합니다.

```text
Rendiv
│
├─ AI 이미지 기반 숏폼
├─ 캐릭터 / 내러티브 영상
├─ 이미지 + 영상 합성
├─ 제품 / 커머스 영상
├─ Before / After
├─ 시네마틱 이미지 애니메이션
├─ Three.js 장면
├─ Lottie
├─ 텍스트 / 자막
├─ BGM / Voice
└─ 일반적인 Shorts / Reels
```

예를 들어 AMU에서:

> "할인 없이 매출을 올리는 방법"

이라는 Magazine 콘텐츠가 있다고 해보겠습니다.

Rendiv 버전은:

```text
매장 이미지
   ↓
"10% SALE"
   ↓
가격 숫자가 확대
   ↓
상품 A / B / C 등장
   ↓
가격 Anchor 변화
   ↓
실제 쇼핑 장면
   ↓
핵심 메시지
```

처럼 **스토리와 미디어 중심**으로 갑니다.

Rendiv가 React component를 영상으로 다루기 때문에 기존 AMU의 React/TypeScript 역량도 그대로 활용할 수 있습니다. AI agent가 React 코드를 직접 생성하는 것도 프로젝트가 공식적으로 지향하는 핵심 사용 사례입니다. ([GitHub][2])

---

# ② Motion Canvas — Knowledge / Explainer 축

반대로 **“이해하는 맛”이 중요한 영상**입니다.

```text
Motion Canvas
│
├─ 차트
├─ 그래프
├─ 인포그래픽
├─ 다이어그램
├─ 숫자 애니메이션
├─ 프로세스 시각화
├─ 경제/투자 데이터
├─ AI/기술 설명
├─ 비즈니스 프레임워크
├─ 타임라인
└─ 교육형 콘텐츠
```

같은 콘텐츠를 Motion Canvas로 만든다면:

```text
기존 가격
  ₩10,000
      ↓
기준 가격
  ₩15,000
      ↓
₩10,000이 상대적으로 저렴하게 인식

          Anchor
             │
      ┌──────┴──────┐
      ▼             ▼
  상품 A        상품 B
 ₩15,000       ₩10,000
```

이 관계가 **선, 도형, 숫자, 위치 이동, 색 변화**로 움직입니다.

이게 Motion Canvas가 특히 잘하는 영역입니다. 공식 프로젝트 자체가 일반 영상 편집기보다는 **정보형 vector animation + voice-over synchronization**에 특화돼 있습니다. ([GitHub][1])

---

# 그래서 AMU 콘텐츠 분류와도 상당히 잘 맞습니다

예를 들어:

| AMU 콘텐츠             | 우선 Engine     |
| ------------------- | ------------- |
| AI 이미지 활용법          | Rendiv        |
| AI 모델 비교 차트         | Motion Canvas |
| 캐릭터 스토리             | Rendiv        |
| 경제지표 설명             | Motion Canvas |
| 성공 스토리              | Rendiv        |
| 마케팅 퍼널 설명           | Motion Canvas |
| 스마트스토어 상품 광고        | Rendiv        |
| PER/PBR 설명          | Motion Canvas |
| Before/After 이미지    | Rendiv        |
| 시스템 아키텍처 설명         | Motion Canvas |
| AMU Build in Public | Rendiv        |
| 통계/데이터 분석           | Motion Canvas |

즉 AMU Magazine 카테고리와도 자연스럽게 연결됩니다.

---

# 특히 Shorts 전략에서 강점이 생깁니다

이렇게 두 가지 **영상 문법**을 보유할 수 있습니다.

### Story Short

Rendiv:

```text
Hook
 ↓
Scene
 ↓
Visual change
 ↓
Conflict
 ↓
Insight
 ↓
Conclusion
```

예:

> "6개월 만에 빅파워가 된 셀러들은 상품부터 찾지 않았다."

상품 이미지 → 검색 화면 → 경쟁 상품 → 매출 그래프 → 핵심 문장.

---

### Intelligence Short

Motion Canvas:

```text
Question
 ↓
Concept
 ↓
Visualization
 ↓
Relationship
 ↓
Insight
```

예:

> "PER 5배인 주식이 PER 20배보다 항상 싼 걸까?"

```text
기업 A        기업 B

주가 10,000   주가 20,000
EPS  2,000    EPS  1,000
   ↓             ↓
PER 5          PER 20
```

그다음 성장률을 애니메이션으로 넣으면서:

```text
현재 가치
≠
미래 가치
```

를 보여주는 겁니다.

이런 콘텐츠는 단순 이미지 슬라이드보다 훨씬 교육적입니다.

---

# 그리고 AMU Intelligence System과 연결하기 좋습니다

여기서 꽤 큰 시너지가 생깁니다.

현재 Intelligence가 글에서 이미:

```text
thesis
primaryQuestion
entities
topics
conditions
limitations
counterExamples
evergreenPrinciple
...
```

같은 구조를 만들어가고 있으니까, 이를 영상 구조 생성에 사용할 수 있습니다.

예를 들어:

```text
Magazine Article
       │
       ▼
AMU Intelligence
       │
       ├─ thesis
       ├─ claims
       ├─ entities
       ├─ examples
       ├─ data
       └─ relationships
       │
       ▼
Video Planner
```

Video Planner가 판단합니다.

```text
관계 / 숫자 / 개념 중심?
          │
         YES
          ↓
   Motion Canvas

         NO
          ↓
       Rendiv
```

그러면 자동 영상 생성 수준이 상당히 올라갑니다.

---

# 다만 여기서 중요한 설계 원칙 하나

두 엔진을 하나의 거대한 추상화로 통합하면 안 됩니다.

예를 들어 이런 걸 만들면:

```ts
interface UniversalAnimation {
  type:
    | "spring"
    | "camera"
    | "three"
    | "chart"
    | "path"
    | "svg"
    | "lottie"
    | ...
}
```

결국:

> Rendiv와 Motion Canvas의 모든 기능을 AMU가 다시 구현

하는 꼴이 됩니다.

그리고 두 라이브러리의 장점을 동시에 잃습니다.

### 공유해야 하는 것은 상위 계약까지만입니다.

```ts
type VideoProject = {
  id: string;

  format: "9:16" | "16:9" | "1:1";

  renderer:
    | "rendiv"
    | "motion-canvas";

  script: VideoScript;

  assets: VideoAsset[];

  audio?: AudioTrack;

  captions?: CaptionTrack;
};
```

여기까지만 공통.

그 밑은:

```text
VideoProject
     │
     ├──────────────┐
     ▼              ▼
RendivProject   MotionCanvasProject
     │              │
React/TS        Scene/Generator
```

로 분리하는 것이 좋습니다.

---

# 디자인 시스템은 공유할 수 있습니다

렌더러는 달라도 **AMU 영상의 브랜드 언어**는 같아야 합니다.

예를 들어:

```ts
export const AMU_VIDEO_THEME = {
  typography: {
    title: ...,
    body: ...,
    caption: ...,
  },

  spacing: {...},

  motion: {
    fast: ...,
    normal: ...,
    slow: ...,
  }
};
```

그리고:

```text
AMU Design Token
        │
    ┌───┴────┐
    ▼        ▼
 Rendiv   Motion Canvas
```

로 매핑합니다.

따라서 사용자는 엔진이 다른 걸 느끼지 못합니다.

---

# Audio / Caption / Asset 역시 공통화

이것도 굉장히 중요합니다.

```text
                 Gen Studio

                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
     Script       Asset        Voice
                    │
                    │
              ┌─────┴─────┐
              ▼           ▼
           Rendiv    Motion Canvas
```

특히 이런 것들은 하나만 구현해야 합니다.

```text
AI Voice
Caption timing
Asset storage
Font
BGM
SFX
Render job
Progress
Output
Thumbnail
Metadata
```

렌더 엔진별로 다시 만들 필요가 없습니다.

---

# 하이브리드도 나중에는 가능합니다

예를 들어 하나의 40초 영상이 있다고 해보겠습니다.

```text
0~10초
Rendiv
→ 강렬한 Hook

10~25초
Motion Canvas
→ 데이터 설명

25~40초
Rendiv
→ 사례 + Conclusion
```

각 segment를 만들고:

```text
Rendiv clip A
      +
Motion Canvas clip B
      +
Rendiv clip C
      ↓
    FFmpeg
      ↓
Final Video
```

로 합칠 수도 있습니다.

이렇게 하면 상당히 강력합니다.

하지만 **처음부터 이걸 구현할 필요는 없습니다.**

초기에는:

```text
1 Video
=
1 Renderer
```

를 유지하는 게 좋습니다.

---

# 영상 생성 UX도 엔진을 보여줄 필요가 없습니다

이것도 중요합니다.

사용자에게:

```text
○ Rendiv
○ Motion Canvas
```

를 선택하게 하면 안 됩니다.

사용자는 엔진에 관심이 없습니다.

대신 Gen Studio에서:

```text
영상 스타일

● 스토리형
  이미지와 장면 중심으로 구성

○ 설명형
  그래프와 시각화로 쉽게 설명

○ 자동 선택
  콘텐츠에 가장 적합한 형식 사용
```

정도로 보여주는 게 좋습니다.

내부적으로:

```text
스토리형
→ Rendiv

설명형
→ Motion Canvas

자동
→ Video Planner
```

로 매핑합니다.

---

# 서비스 책임도 명확합니다

AMU 구조에서는 이 엔진은 **Gen Studio의 책임**입니다.

```text
Gen Studio
=
Video Generation Infrastructure
│
├ Rendiv
└ Motion Canvas
```

Magazine은:

```text
Article
 → 영상으로 만들기
```

를 호출할 뿐이고,

Marketing Oops는:

```text
생성된 영상
 → Shorts
 → Reels
 → Instagram
 → YouTube
```

배포와 성과 분석을 담당합니다.

즉:

```text
Magazine
    │
    ▼
Gen Studio
 ┌──┴──────────────┐
 ▼                 ▼
Rendiv        Motion Canvas
 │                 │
 └───────┬─────────┘
         ▼
    Video Asset
         │
         ▼
 Marketing Oops
```

이 책임 분리가 가장 자연스럽습니다.

---

# 경량화 측면에서도 두 엔진 전략이 나쁘지 않습니다

핵심은 **항상 둘을 로드하지 않는 것**입니다.

```text
Render Job

renderer = rendiv
        ↓
Rendiv Worker

renderer = motion-canvas
        ↓
Motion Canvas Worker
```

처럼 독립적으로 실행하면 됩니다.

Next.js 앱에 두 렌더러를 전부 번들링하는 구조는 피합니다.

따라서:

```text
node-app
   │
   ▼
Render API
   │
   ▼
Queue
 ┌─┴──────────────┐
 ▼                ▼
Rendiv Worker   Motion Worker
```

가 좋습니다.

이렇게 하면 **웹앱 번들 크기에는 사실상 영향을 주지 않도록 설계할 수 있습니다.**

---

# 제 판단은 이전보다 이쪽에 더 기웁니다

제가 지금 다시 AMU 기준으로 선택한다면:

### 이전

> Revideo 하나로 시작하고 Rendiv를 관찰

보다는

### 지금

> **Rendiv + Motion Canvas를 서로 다른 목적을 가진 두 Engine으로 채택**

을 더 높게 평가합니다.

왜냐하면 AMU는 단순한 AI 광고영상 생성기가 아니기 때문입니다.

AMU가 다루는 게:

```text
Business
Investment
Marketing
AI
Technology
Productivity
Storytelling
Commerce
Characters
```

까지 넓습니다.

따라서 영상도 하나의 문법으로 통일하는 것보다,

**Visual Storytelling**

와

**Visual Explanation**

이라는 두 개의 문법을 확보하는 게 더 큰 자산이 됩니다.

---

## 제가 권하는 최종 구조

```text
                    AMU Intelligence
                           │
                           ▼
                     Video Planner
                           │
              ┌────────────┴─────────────┐
              │                          │
       Visual / Story              Knowledge / Explain
              │                          │
              ▼                          ▼
           RENDIV                  MOTION CANVAS
              │                          │
        React / Media               Vector / Data
        Three / Lottie              Chart / Diagram
        Image / Video               Typography
        Character                   Visualization
              │                          │
              └────────────┬─────────────┘
                           ▼
                     Render Worker
                           │
                         FFmpeg
                           │
                           ▼
                     AMU Video Asset
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
        Magazine      Marketing Oops      Store
```

**이건 단순히 렌더러 두 개를 쓰는 게 아니라 AMU가 두 종류의 콘텐츠 표현 언어를 갖는 것**이라고 보는 게 더 정확합니다.

특히 향후 Magazine Intelligence를 이용해 **같은 글을 `읽는 콘텐츠 → 설명형 Motion Canvas → 감성/스토리형 Rendiv → Shorts/Reels`로 확장**할 수 있다는 점이 이 구조의 가장 큰 장점입니다. 저는 이 방향이라면 두 엔진을 유지할 가치가 충분하다고 봅니다.

[1]: https://github.com/motion-canvas/motion-canvas/blob/main/README.md?utm_source=chatgpt.com "motion-canvas/README.md at main · motion-canvas/motion-canvas · GitHub"
[2]: https://github.com/thecodacus/rendiv?utm_source=chatgpt.com "GitHub - thecodacus/rendiv: The video editor built for AI. Create videos with React + TypeScript — designed for AI agents, LLM pipelines, and automated production. Fully open source. · GitHub"

===

해당 라이브러리를 활용해서 모션으로만 화면을 구성하고, 원하는 경우에만 영상으로 렌더링하도록 구현할 수도 있어??

===

가능합니다. 오히려 **그렇게 쓰는 방식이 AMU에는 더 자연스럽습니다.**

핵심은 `영상 제작 라이브러리`로 한정하지 않고, **시간축을 가진 모션 콘텐츠 런타임**으로 보는 겁니다.

Rendiv는 공식적으로 React 앱에 바로 넣을 수 있는 `<Player />`를 제공하고, 서버 없이 브라우저에서 composition을 재생할 수 있습니다. 같은 composition을 나중에 필요할 때 MP4/WebM/GIF 등으로 렌더링할 수 있습니다. ([GitHub][1]) Motion Canvas도 브라우저용 `player` 패키지를 따로 가지고 있고, 애니메이션을 실시간 미리보기한 뒤 필요할 때 이미지 시퀀스나 FFmpeg exporter로 영상화할 수 있습니다. ([GitHub][2])

즉 구조를 이렇게 가져갈 수 있습니다.

```text
AMU Interactive Content
        │
        ▼
   Motion Composition
        │
        ├───────────────┐
        │               │
        ▼               ▼
  실시간 웹 재생      영상 렌더 요청
        │               │
        │               ▼
        │          Render Worker
        │               │
        │               ▼
        │          MP4 / WebM
        │
        ▼
Magazine / Home / Archive / Play
```

## 예를 들어 Magazine 콘텐츠가 이렇게 바뀔 수 있습니다

현재 일반적인 글이:

```text
제목
↓
본문
↓
이미지
↓
차트
↓
본문
```

이라면 특정 고도화 콘텐츠는:

```text
제목 등장
      ↓
숫자 카운트업
      ↓
그래프가 그려짐
      ↓
핵심 문장이 확대
      ↓
스크롤
      ↓
다음 Scene
```

처럼 **페이지 자체가 Motion Canvas/Rendiv composition**으로 동작할 수 있습니다.

그리고 화면 어딘가에:

```text
[영상으로 저장]
```

또는 내부 자동화에서:

```text
Create Short
```

를 실행하면 **동일한 콘텐츠 정의를 영상으로 렌더링**하는 겁니다.

이게 상당히 강력합니다.

---

# Rendiv는 특히 이 용도에 잘 맞습니다

Rendiv의 핵심 모델이 아예:

```text
frame → React component
```

입니다.

그리고 공식 Player가 있습니다.

```tsx
<Player
  component={MyComposition}
  totalFrames={300}
  fps={30}
  compositionWidth={1080}
  compositionHeight={1920}
  controls
/>
```

이 composition을 웹에서는 그냥 재생합니다.

렌더링할 때만:

```ts
await renderMedia({
  compositionId: "MyComposition",
  codec: "mp4",
  ...
});
```

를 호출하면 됩니다. ([GitHub][1])

따라서:

```text
하나의 Composition
       │
   ┌───┴─────┐
   ▼         ▼
Player     Renderer

웹 화면      MP4
```

가 성립합니다.

### AMU에서 Rendiv를 이렇게 쓸 수 있습니다

```text
Home Hero
Interactive Archive
Build in Public
Gen Studio 결과 소개
Store 상품 소개
캐릭터 Story Scene
서비스 Onboarding
```

같은 화면을 **영상 같은 웹 경험**으로 만들 수 있습니다.

---

# Motion Canvas도 가능합니다

Motion Canvas도 원래:

> TypeScript animation library + real-time preview editor

구조이고, 별도의 브라우저 `player` 패키지도 존재합니다. ([GitHub][3])

특히:

```text
차트
다이어그램
텍스트
숫자
경로
Shape
Camera
```

같은 요소는 웹에서 실시간 렌더링하기 좋습니다.

그리고 Motion Canvas는 preview와 최종 render의 해상도/FPS를 별도로 설정할 수도 있습니다. 즉 웹에서는 낮은 비용으로 재생하고, 영상 생성할 때만 고품질로 렌더링할 수 있습니다. ([GitHub][4])

예를 들면:

```text
Web
720p / 30fps

↓

Video Export
1080p / 60fps
```

같은 식입니다.

이건 경량화에 꽤 중요한 장점입니다.

---

# 그래서 제가 생각하는 AMU 구조는 더 넓어집니다

앞에서는:

```text
Rendiv
= 영상 제작

Motion Canvas
= 설명 영상
```

으로 봤는데,

실제로는 이렇게 보는 게 더 좋습니다.

```text
Rendiv
=
Visual Experience Runtime

Motion Canvas
=
Knowledge Visualization Runtime
```

그리고 영상은 **출력 포맷 중 하나**입니다.

```text
                    AMU Motion Content

                          │
                  Motion Composition
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
           Rendiv               Motion Canvas
              │                       │
     Visual / Story             Knowledge / Data
              │                       │
              └───────────┬───────────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
           Web          Native       Video
         Player         WebView      Render
```

이렇게 되면 훨씬 재미있어집니다.

---

# 특히 AMU의 콘텐츠 경험 고도화와 잘 맞습니다

예전에 이야기했던 **Magazine 고퀄리티 인터랙티브 콘텐츠**에도 그대로 연결할 수 있습니다.

예를 들어 경제 콘텐츠라면:

```text
PER란 무엇인가?
```

일반 페이지를 보여주는 대신:

```text
기업 A          기업 B
  │               │
₩10,000         ₩20,000
  │               │
EPS 2,000       EPS 1,000

       ↓ animate

 PER 5           PER 20
```

숫자가 움직이고,

스크롤하면:

```text
PER
 ≠
싸고 비싼 주식의 절대 기준
```

이 나타나는 구조입니다.

### 웹에서는

사용자가 직접 읽고 탐색합니다.

### Shorts에서는

같은 composition을:

```text
0s → 12s
```

자동 재생시켜 렌더링합니다.

**한 번 만든 시각화가 웹 콘텐츠와 영상 콘텐츠를 동시에 만드는 셈입니다.**

---

# 여기서 더 중요한 가능성이 있습니다

인터랙션과 영상 재생을 분리할 수도 있습니다.

웹에서는:

```text
scroll
click
hover
drag
```

가 Scene progression을 제어하게 하고,

영상에서는:

```text
time
```

이 제어합니다.

예를 들어:

```ts
progress = web
  ? scrollProgress
  : frame / totalFrames;
```

라는 개념입니다.

실제 구현은 Renderer별 adapter에 두는 게 좋지만 철학은 이렇습니다.

### 웹

```text
사용자 스크롤
     ↓
progress = 0 → 1
     ↓
animation
```

### 영상

```text
frame
  ↓
progress = 0 → 1
  ↓
same animation
```

그러면 동일한 Scene을:

```text
Scroll Animation
&
Video Animation
```

두 형태로 사용할 수 있습니다.

---

# 다만 여기에는 중요한 제약이 하나 있습니다

**모든 인터랙티브 UI를 영상 composition으로 만들지는 않는 게 좋습니다.**

예를 들어:

```text
로그인 Form
검색
상품 편집
설정
Navigation
CRUD UI
```

같은 것은 일반 React UI가 맞습니다.

반대로:

```text
Storytelling
Data visualization
Hero
Explainer
Interactive article
Campaign
Product showcase
Character scene
```

처럼 **시간·장면·변화 자체가 콘텐츠인 영역**이 Motion Runtime의 대상입니다.

구분하면:

```text
일을 수행한다
→ 일반 React UI

내용을 경험한다
→ Rendiv / Motion Canvas
```

정도가 꽤 좋은 기준입니다.

---

# 또 하나: 렌더 가능한 콘텐츠는 결정적이어야 합니다

여기가 설계에서 가장 중요합니다.

예를 들어 웹에서:

```ts
Math.random()
new Date()
window.scrollY
mouse position
API 실시간 응답
```

에 따라 화면이 달라지면, 나중에 영상을 렌더했을 때 결과가 달라집니다.

따라서 **영상으로도 렌더할 수 있는 AMU Motion Content는 기본적으로 deterministic하게 설계**하는 게 좋습니다.

```text
Content Data
+
Assets
+
Timeline
+
Motion Parameters
=
항상 같은 결과
```

그리고 웹 interaction은 별도 input으로 넣습니다.

예:

```ts
type MotionContext = {
  progress: number;
  mode: "interactive" | "render";
};
```

이 정도면 충분합니다.

---

# 그래서 별도 `AMU Motion Content` 계층을 두는 걸 추천합니다

영상 중심의 `VideoComposition`보다 이름부터 더 넓게 잡는 게 좋겠습니다.

예:

```ts
type MotionContent = {
  id: string;

  engine: "rendiv" | "motion-canvas";

  format: {
    width: number;
    height: number;
  };

  duration?: number;

  scenes: MotionScene[];

  assets: MotionAsset[];

  renderable: boolean;
};
```

그리고:

```text
MotionContent
│
├─ Interactive
│    └─ Browser Player
│
└─ Render
     └─ MP4/WebM
```

으로 씁니다.

---

## Rendiv / Motion Canvas 역할도 더 명확해집니다

| 화면/콘텐츠          | 엔진                |
| --------------- | ----------------- |
| 시네마틱 Hero       | **Rendiv**        |
| AI 이미지 Story    | **Rendiv**        |
| Character Scene | **Rendiv**        |
| 제품 Showcase     | **Rendiv**        |
| Before/After    | **Rendiv**        |
| 데이터 차트          | **Motion Canvas** |
| 경제 개념 설명        | **Motion Canvas** |
| 프로세스 Diagram    | **Motion Canvas** |
| AI Architecture | **Motion Canvas** |
| 통계 시각화          | **Motion Canvas** |

그리고 둘 다:

```text
실시간 화면
→ 필요 시 영상
```

이 됩니다.

---

## 한 가지 현실적인 차이는 있습니다

**Rendiv는 이 구조를 바로 적용하기 더 쉽습니다.**

공식적으로 embeddable React Player가 명확하게 제공되기 때문입니다. ([GitHub][1])

Motion Canvas도 브라우저 Player 패키지가 존재하지만, 생태계와 문서의 중심은 여전히 자체 Editor/preview + export 쪽입니다. ([GitHub][2])

또한 서버에서 완전히 headless 자동 렌더링하는 공식적인 CLI 흐름은 Rendiv 쪽이 현재 훨씬 명확합니다. Motion Canvas는 headless rendering 관련 공식 문서/API가 상대적으로 부족하고, 2025년에도 이 부분에 대한 요청이 열린 이슈로 남아 있습니다. ([GitHub][5])

따라서 AMU라면:

```text
Rendiv
→ 웹 + 영상 동일 Composition 적극 활용

Motion Canvas
→ 웹 시각화 적극 활용
→ 영상 렌더 자동화는 별도 Worker 검증 후 확대
```

순서가 안전합니다.

---

### 결론

**가능하고, 저는 오히려 이것을 핵심 설계 철학으로 잡는 것을 추천합니다.**

즉,

> `Rendiv + Motion Canvas = 영상 생성 엔진`

보다

> **`Rendiv + Motion Canvas = AMU의 Motion Content Runtime`**
>
> **영상은 그 Motion Content를 export하는 여러 방식 중 하나**

라고 정의하는 겁니다.

이렇게 잡으면 지금 구상 중인 **Magazine 인터랙티브 콘텐츠 → Gen Studio 제작 → Shorts/Reels 재활용**이 별개의 세 시스템이 아니라 **하나의 콘텐츠 자산을 여러 경험으로 재생하는 구조**가 됩니다. 장기적으로 훨씬 가치가 큽니다.

[1]: https://github.com/thecodacus/rendiv?utm_source=chatgpt.com "GitHub - thecodacus/rendiv: The video editor built for AI. Create videos with React + TypeScript — designed for AI agents, LLM pipelines, and automated production. Fully open source. · GitHub"
[2]: https://github.com/motion-canvas/motion-canvas?utm_source=chatgpt.com "GitHub - motion-canvas/motion-canvas: Visualize Your Ideas With Code · GitHub"
[3]: https://github.com/motion-canvas/motion-canvas/blob/main/README.md?utm_source=chatgpt.com "motion-canvas/README.md at main · motion-canvas/motion-canvas · GitHub"
[4]: https://github.com/motion-canvas/motion-canvas/blob/main/packages/docs/docs/getting-started/rendering/index.mdx?utm_source=chatgpt.com "motion-canvas/packages/docs/docs/getting-started/rendering/index.mdx at main · motion-canvas/motion-canvas · GitHub"
[5]: https://github.com/motion-canvas/motion-canvas/issues/1218?utm_source=chatgpt.com "Help needed: Headless rendering without browser for automated pipeline · Issue #1218 · motion-canvas/motion-canvas · GitHub"

===

그럼 위의 툴들을 활용하면 에프터이펙트와 비교해서 어느 정도 수준까지 모션그래픽 구현이 가능할까?

===

가능합니다. 다만 핵심은 **“최종 결과물의 시각적 수준”과 “제작 방식의 범위”를 분리해서 보는 것**입니다.

`Rendiv + Motion Canvas + Three.js/WebGL` 조합이면 **일반적인 2D 모션그래픽, 인포그래픽, 키네틱 타이포그래피, 데이터 시각화, 숏폼 그래픽의 상당 부분은 After Effects와 비슷한 최종 품질까지 만들 수 있습니다.** 반면 실사 합성, 로토스코핑, 카메라 트래킹, 복잡한 VFX, 플러그인 기반 이펙트는 여전히 AE가 압도적입니다. Rendiv는 CSS·SVG·Canvas·WebGL·Three.js를 사용할 수 있고 Lottie, motion blur, transition 등을 공식 패키지로 제공합니다. Motion Canvas는 애초에 TypeScript 기반 정보형 벡터 애니메이션에 특화되어 있습니다. ([GitHub][1])

### 작업 유형별로 보면

| 작업                    | Rendiv + Motion Canvas |       AE 대비 |
| --------------------- | ---------------------: | ----------: |
| 키네틱 타이포그래피            |                  매우 강함 |  **85~95%** |
| UI / 앱 모션             |                  매우 강함 | **90~100%** |
| 인포그래픽                 |                  매우 강함 | **90~100%** |
| 차트 / 데이터 애니메이션        |             **오히려 강점** |   **100%+** |
| 다이어그램 / 설명 애니메이션      |             **오히려 강점** |   **100%+** |
| SVG / 아이콘 애니메이션       |                  매우 강함 | **90~100%** |
| 로고 모션                 |                     강함 |  **80~95%** |
| 이미지 기반 숏폼             |                  매우 강함 |  **85~95%** |
| 패럴랙스 / 카메라 이동         |                     강함 |  **80~90%** |
| 2.5D 장면               |                     강함 |  **70~90%** |
| Three.js 3D           |             다른 방식으로 강함 | **80~100%** |
| 파티클 / procedural FX   |                     강함 | **70~100%** |
| 캐릭터 모션                |                     가능 |  **50~70%** |
| 실사 영상 합성              |                    제한적 |  **30~50%** |
| Green Screen / Keying |                    제한적 |  **20~40%** |
| Rotoscoping           |                     약함 |  **10~20%** |
| Object Tracking       |               별도 기술 필요 |  **10~30%** |
| 3D Camera Tracking    |               별도 기술 필요 |  **10~20%** |
| 자연현상·시네마틱 VFX         |              상당한 개발 필요 |  **30~60%** |
| AE 플러그인 생태계           |                 비교 어려움 |   **매우 낮음** |

이 숫자는 벤치마크가 아니라 **구현 난이도와 실질적인 표현 범위를 기준으로 한 판단**입니다.

---

## 그런데 AMU가 만들 콘텐츠만 놓고 보면 상황이 달라집니다

AMU가 After Effects를 사용한다면 대부분 이런 작업일 가능성이 큽니다.

```text
텍스트 등장
숫자 카운트
이미지 이동/확대
차트 애니메이션
아이콘
그래프
Mask reveal
Blur
Gradient
Shape morph
Camera zoom
Parallax
자막
Transition
BGM / Voice
```

이 범위라면 **Rendiv + Motion Canvas만으로 85~95% 정도를 커버할 수 있다고 봅니다.**

더 중요한 건 단순히 “흉내 낼 수 있다”가 아닙니다.

일부 영역에서는 **AE보다 AMU 방식이 훨씬 유리합니다.**

---

# 1. 데이터 기반 모션은 AE보다 훨씬 좋습니다

예를 들어 이런 경제 콘텐츠가 있다고 해보겠습니다.

```text
2022 매출 100억
2023 매출 160억
2024 매출 240억
2025 매출 310억
```

AE라면 보통 데이터를 입력하고 레이어와 expression을 조정합니다.

Motion Canvas라면 그냥:

```ts
const revenue = [
  { year: 2022, value: 100 },
  { year: 2023, value: 160 },
  { year: 2024, value: 240 },
  { year: 2025, value: 310 },
];
```

에서 그래프를 생성할 수 있습니다.

그리고 API 데이터가 바뀌면:

```text
Mongo / Intelligence
        ↓
Motion Canvas
        ↓
새 애니메이션
```

이 됩니다.

AE도 expression과 외부 데이터를 이용해 자동화할 수 있지만, Motion Canvas는 애초에 **프로그래밍 가능한 애니메이션 시스템**이라는 차이가 있습니다. AE 역시 expression과 외부 데이터 연결을 지원하지만, 기본 UX는 여전히 시각적 제작 도구입니다. ([Adobe][2])

그래서:

**경제·투자·마케팅·AI 설명 콘텐츠**

에서는 Motion Canvas가 AE보다 오히려 AMU 목적에 더 적합합니다.

---

# 2. 타이포그래피도 상당히 높은 수준까지 가능합니다

예를 들어:

```text
AI가 일자리를
"없애는" 것이 아니라

일의 단위를
"바꾸고 있다"
```

라고 할 때,

글자가:

```text
opacity
scale
position
letter spacing
rotation
blur
mask
path
spring
```

등을 조합해서 등장하도록 만들 수 있습니다.

Rendiv에서는 React/CSS/SVG를 이용할 수 있고, frame 기반 interpolation과 spring도 제공됩니다. ([GitHub][1])

따라서 Apple 광고나 Vox 스타일의:

```text
텍스트
+
Shape
+
이미지
+
빠른 Transition
```

정도는 충분히 가능합니다.

---

# 3. Motion Canvas는 설명형 모션에서는 정말 강합니다

예를 들어:

> 복리 효과를 설명한다.

처음:

```text
100
```

이 나타나고

```text
100
 ↓
110
 ↓
121
 ↓
133
 ↓
146
```

숫자가 움직이며 증가하고,

옆에 그래프가 그려지고,

카메라가 이동하면서:

```text
수익률 10%
×
시간
=
복리
```

라는 관계가 나타나는 식입니다.

이런 콘텐츠는 Motion Canvas가 정확히 노리는 영역입니다. 공식 설명도 **정보 전달형 벡터 애니메이션과 voice-over synchronization**을 핵심 용도로 정의합니다. ([GitHub][3])

AMU에는 이쪽 콘텐츠가 상당히 많습니다.

---

# 4. 3D에서는 재미있는 역전도 가능합니다

After Effects는 현재 네이티브 3D shape, 3D 모델, 이미지 기반 조명, Cinema 4D 연동 등을 지원합니다. ([Adobe][2])

하지만 Rendiv에서는 WebGL과 Three.js를 쓸 수 있습니다. ([GitHub][1])

그래서 이런 것은:

```text
3D Globe
Particles
3D Text
Camera flight
Shader
Procedural geometry
Interactive object
```

오히려 웹 기술 쪽이 더 자유로울 수도 있습니다.

특히:

```text
웹에서는 Interactive Three.js

        ↓ 동일 Scene

영상에서는 Camera Timeline 자동 재생
```

구조가 가능합니다.

AE에서는 최종 결과는 만들 수 있어도 웹 인터랙션을 그대로 가져갈 수 없습니다.

이게 AMU에는 큰 차이입니다.

---

# 5. 절차적·Generative Animation에서는 코드 방식이 훨씬 강합니다

예를 들어 화면에 500개의 점이 있고:

```text
콘텐츠의 entity 관계
```

에 따라서 자동으로 연결된다고 해보겠습니다.

```text
Steve Jobs
 ├ Apple
 ├ Pixar
 ├ Design
 └ Innovation
```

Intelligence 데이터를 읽고:

```text
node 생성
→ edge 생성
→ force layout
→ camera 이동
→ 중요 node 강조
```

를 자동 생성할 수 있습니다.

이걸 AE에서 매번 만드는 건 비효율적입니다.

코드에서는:

```text
Data
 ↓
Algorithm
 ↓
Visual
```

이므로 콘텐츠가 몇 천 개라도 만들 수 있습니다.

여기가 **AMU에서 AE보다 코드 기반 Motion Runtime을 택할 가장 큰 이유**입니다.

---

# 반대로 AE를 대체하려고 하면 안 되는 영역도 명확합니다

After Effects에는 현재:

* AI Object Matte
* masking
* keying
* rotoscoping
* content-aware removal
* motion tracking
* stabilization
* 3D tracking
* footage compositing
* 3D model workflow
* 수백 개의 effects
* 400개 이상의 파트너 plugin

등이 있습니다. ([Adobe][4])

특히 **실제 영상의 픽셀을 분석해서 무언가를 하는 작업**에서는 차이가 큽니다.

예를 들어:

```text
사람 뒤로 글씨가 지나감
```

AE:

```text
Object Matte / Roto
        ↓
사람 분리
        ↓
Text
        ↓
Composite
```

Rendiv:

```text
??? 사람 segmentation 필요
```

입니다.

별도로:

```text
SAM
MediaPipe
OpenCV
Depth Anything
Segmentation model
```

같은 기술을 붙여야 합니다.

---

# Motion tracking도 마찬가지입니다

예를 들어 움직이는 자동차 위에:

```text
₩29,900
```

라는 텍스트를 고정하고 싶다면,

AE에서는 footage를 분석해서 tracking data를 만들 수 있습니다. Adobe는 single-point, two-point, customized tracking과 3D motion tracking을 지원합니다. ([Adobe][4])

Rendiv에서는 자체적으로 footage tracking 시스템을 제공하는 게 아닙니다.

그래서:

```text
OpenCV / AI Tracking
        ↓
tracking coordinates
        ↓
Rendiv
        ↓
Graphic overlay
```

가 필요합니다.

다만 일단 tracking data만 있으면 Rendiv에서 표현하는 건 어렵지 않습니다.

---

# 그래서 AMU에서는 AE와 경쟁할 필요가 없습니다

제가 생각하는 가장 좋은 경계는 이겁니다.

```text
                  Motion Content

                ┌───────┴───────┐

       Programmatic Motion      VFX / Artist Motion
               │                      │
               ▼                      ▼
      Rendiv / Motion Canvas     After Effects
```

그리고 실제 비중은 AMU에서는 아마:

```text
Rendiv / Motion Canvas
█████████████████ 85~95%

AE 또는 전문 영상툴
███ 5~15%
```

정도로 갈 가능성이 높습니다.

AE가 필요한 경우만 AE를 쓰는 겁니다.

---

# 오히려 AMU에는 코드 기반이 훨씬 큰 이점이 있습니다

AE에서 고퀄리티 영상을 하나 만들면:

```text
디자이너
 ↓
Timeline
 ↓
Keyframe
 ↓
Render

1 콘텐츠
=
1 작업
```

이 되기 쉽습니다.

AMU Motion Runtime에서는:

```text
Motion Template
       │
       ├ Article A
       ├ Article B
       ├ Article C
       ├ Article D
       └ Article E
```

가 가능합니다.

즉:

> **한 번 디자인하고 수천 번 생성**

할 수 있습니다.

이게 생성형 콘텐츠 플랫폼에서는 결정적인 차이입니다.

---

# 예를 들어 이런 Motion Template을 만들 수 있습니다

### `number-insight`

```text
HOOK
 ↓
큰 숫자 등장
 ↓
숫자 비교
 ↓
그래프
 ↓
Insight
```

### `concept-explainer`

```text
Question
 ↓
Diagram
 ↓
Relation
 ↓
Example
 ↓
Conclusion
```

### `story-visual`

```text
Image
 ↓
Camera motion
 ↓
Caption
 ↓
Scene transition
 ↓
Insight
```

### `comparison`

```text
A          B
│          │
▼          ▼
Metric    Metric
│          │
└──── VS ──┘
```

Intelligence가 데이터를 넣습니다.

```text
Magazine Intelligence
         ↓
Video Planner
         ↓
Motion Template
         ↓
Rendiv / Motion Canvas
```

그러면 거의 자동화된 모션그래픽 시스템이 됩니다.

---

# 품질을 좌우하는 것은 라이브러리보다 Motion Design System입니다

여기가 중요합니다.

Motion Canvas를 도입한다고 영상이 바로 멋있어지는 건 아닙니다.

결국:

```text
Typography
Spacing
Composition
Timing
Easing
Transition
Camera language
Color
Sound
```

을 어떻게 정의하느냐가 결과물을 좌우합니다.

예를 들어 AMU Motion Design System에:

```text
Entrance
- fade-up
- scale-in
- mask-reveal
- spring

Emphasis
- pulse
- underline
- number-count

Exit
- fade
- slide
- blur

Camera
- push
- pull
- pan
- orbit

Transition
- cut
- wipe
- zoom
- morph
```

정도를 SSOT로 정의해두면 AI가 임의의 애니메이션을 만드는 대신 **AMU의 시각 언어를 조합**하게 만들 수 있습니다.

그 순간 품질이 훨씬 안정됩니다.

---

## 그래서 목표를 이렇게 잡는 게 좋습니다

**“After Effects를 오픈소스로 복제한다”**

가 아니라:

> **“AMU가 반복적으로 사용하는 모션그래픽의 90%를 코드와 AI로 자동 생성할 수 있는 시스템을 만든다.”**

이게 맞습니다.

그 목적이라면 저는 `Rendiv + Motion Canvas` 조합을 꽤 높게 평가합니다.

특히 **Magazine Intelligence → 인터랙티브 모션 콘텐츠 → 동일 composition을 Shorts/Reels로 렌더링**하는 구조까지 고려하면, AE보다 표현 범위가 조금 부족한 대신 **자동화·재사용·데이터 연동·웹/영상 동시 사용에서는 비교가 안 될 정도로 강해집니다.**

그리고 AMU가 실제로 필요한 수준은 영화 VFX가 아니라 **“잘 설계된 Vox/Apple/정보형 YouTube 수준의 프로그램매틱 모션그래픽”**에 더 가까워서, 그 범위라면 충분히 주력 기술로 가져갈 만합니다.

[1]: https://github.com/thecodacus/rendiv?utm_source=chatgpt.com "GitHub - thecodacus/rendiv: The video editor built for AI. Create videos with React + TypeScript — designed for AI agents, LLM pipelines, and automated production. Fully open source. · GitHub"
[2]: https://www.adobe.com/kr/products/aftereffects/features.html?utm_source=chatgpt.com "After Effects 기능 살펴보기 | Adobe"
[3]: https://github.com/motion-canvas/motion-canvas/blob/main/README.md?utm_source=chatgpt.com "motion-canvas/README.md at main · motion-canvas/motion-canvas · GitHub"
[4]: https://www.adobe.com/products/aftereffects/motion-tracking.html?utm_source=chatgpt.com "Motion tracking in After Effects | Adobe"
