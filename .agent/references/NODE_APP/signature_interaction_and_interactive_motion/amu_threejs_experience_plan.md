최근 three.js로 웹사이트를 구현하는 것이 더 다이나믹하면서도 가벼운 사이트를 만드는 방법이라고 하는데, 아래의 내용을 AMU에 적용한다면??

===

디자인 팀 전체가 랜딩페이지 만드는 법을 바꿨습니다.
이 고백이 조회 20만을 넘겼어요.
디자인 교육으로 유명한 멩 투의 이야기예요.
이미지와 영상으로 짓던 랜딩페이지를
전부 three.js 3D 사이트로 갈아탔답니다.
오퍼스 5가 분해도와 와이어프레임 사이트를
너무 잘 만들어서요. 

작업 흐름이 단순합니다.
영상 레퍼런스를 하나 주면
AI가 three.js나 블렌더로 경험을 직접 짓습니다.
디테일, 텍스처, 조명은
후속 프롬프트로 다듬어가고요.
핵심 통찰이 이 문장에 있어요.
전부 코드라서, AI가 더 적은 반복으로
더 정밀하게 고친다. 

이미지 사이트와 코드 사이트의 차이가 왜 크냐면.
이미지는 AI에게 불투명합니다.
고치려면 다시 그려야 해요.
코드는 전부 읽고 쓸 수 있는 재료입니다.
색 하나, 각도 하나를 집어서 바꿀 수 있어요.
게다가 3D 코드 사이트가
이미지 잔뜩 실은 페이지보다 가볍답니다.
결과물 차이가 충격적이라는 게 본인 표현이에요. 

숫자가 이 방향을 증언합니다.
본인의 three.js 부품집 threeui.com이
하루 조회 10만을 받는 중이고,
깃허브 스타 3,800개를 나흘 만에 모았어요.
본인의 역대 오픈소스 중 최고 속도랍니다.
프론트 레고 얘기와 같은 결론이에요.
에이전트 시대의 디자인 자산은
이미지가 아니라 코드 조각입니다. 

저는 이 전환을 디자인의 문법 교체로 읽습니다.
디자이너가 완성된 그림을 넘기던 시대에서,
코드로 된 재료를 고르고 AI로 다듬는 시대로.
만드는 손은 빌릴 수 있게 됐고
남는 건 레퍼런스를 고르는 눈이에요.
좋은 영상 하나를 골라 오는 사람이
곧 좋은 사이트를 가진 사람이 됩니다. 

===

[있어빌리티 파티클의 비밀은 시간표였습니다]
"Three.js 현명하게 쓰는 법"
해외 디자인 커뮤니티에서 화제가 된 3D 사이트가 있습니다.
스크롤 한 번에 파티클 수만 개가 지형이 됩니다. 다시 구체로 모이고, 드론 위로 빨려 들어갑니다. 페이지 전환 없이. 같은 Three.js로요.
엄청난 셰이더 실력이 필요할 줄 알았습니다. 코드를 뜯어봤더니 전혀 아니었죠.

[원리는 이미지 두 장이었습니다]
파티클이 형태를 바꾸는 원리는 단순합니다. 현재 위치 이미지 한 장, 목표 위치 이미지 한 장. 셰이더가 이 두 장을 섞으면 끝입니다.
지형, 구체, 드론 중심 수렴까지 세 가지 전환이 이 구조 하나로 전부 돌아갑니다. 새 형태가 필요하면 목표 이미지만 바꿔 끼우면 되죠.
근데 이것만으로는 있어 보이지 않습니다.

[감각의 문제가 아니었습니다. 출발 시간의 문제였습니다]
"자연스러운 움직임은 타고난 모션 감각이 있어야 한다." 이것도 편견이었습니다. After Effects에서 레이어에 시차를 거는 것과 같은 원리입니다. 파티클마다 출발 시간을 조금씩 다르게 주면 뭉텅이 대신 흐름이 되죠.
셰이더 주석에 이런 경고까지 있었습니다. "출발 시간을 단순하게 밀면 멈춰 있을 때 형태가 15% 찌그러진다." 감각 대신 계산이 들어간 겁니다.
파티클 타이밍만 이렇게 정밀한 게 아니었습니다.

[코드 수천 줄 대신 숫자 120개였습니다]
몇 번 프레임에서 드론이 나타나고, 몇 번에서 파티클이 전환되고, 몇 번에서 착지하는지. 이 숫자들이 설정 파일 하나에 전부 정리돼 있었습니다.
코드를 새로 짤 필요가 없습니다. 숫자만 바꾸면 경험이 달라지는 구조입니다. 기획서가 곧 설정 파일인 셈이죠.
타이밍을 잡았으니 남은 건 화면의 품격입니다.

[영화 느낌의 정체는 기본 필터 8겹이었습니다]
영화 같은 느낌도 직접 짠 셰이더가 아니었습니다. 빛 번짐, 피사계 심도, 광선 효과 등 Three.js 기본 필터 8종을 겹친 겁니다. 지형 도면에는 재질 효과 하나만 넣었죠.
용도에 따라 3D 캔버스를 두 개로 나누고 각각 다른 필터 조합을 건 겁니다. 3D 모델 3개, 총 6MB. 생각보다 가볍습니다.

[있어빌리티의 차이는 설계 순서에서 갈렸습니다]
이전에 분석한 bunqlabs.com은 공간을 먼저 설계한 사이트였습니다. 이번 drone.riotters.com은 시간을 먼저 설계한 사이트입니다.
같은 Three.js인데 출발점이 달랐죠. 뭐가 언제 움직이는지를 먼저 정했을 뿐입니다.

===

가능합니다. 그리고 **AMU에는 꽤 잘 맞는 방향**입니다. 다만 방향을 이렇게 잡는 게 좋습니다.

> **AMU를 Three.js 사이트로 만드는 것이 아니라, Three.js를 기반으로 한 ‘Interactive Visual Runtime’을 AMU의 공통 표현 계층으로 만든다.**

이 차이가 중요합니다. Magazine 기사, Gen Studio의 폼, 설정 화면까지 WebGL로 바꾸는 것은 잘못된 접근입니다. 반대로 **브랜드 경험·서비스 설명·데이터 시각화·인터랙티브 콘텐츠·생성 결과 프리뷰** 같은 곳에서는 기존 이미지/영상보다 훨씬 강력한 AMU만의 자산이 될 수 있습니다.

## 1. 먼저 “Three.js = 더 가볍다”는 절반만 맞습니다

인용한 사례의 핵심은 맞지만, Three.js 자체가 이미지나 영상보다 항상 가벼운 것은 아닙니다.

예를 들어 20MB짜리 배경 영상 대신 수십 KB의 셰이더와 간단한 geometry로 같은 느낌을 만든다면 Three.js가 압도적으로 유리할 수 있습니다. 반대로 4K texture 여러 장, GLB 모델, bloom·DOF·SSR 같은 post-processing을 겹치면 다운로드 용량뿐 아니라 GPU와 배터리까지 훨씬 많이 씁니다. Three.js 공식 문서도 geometry·material·texture·render target 같은 GPU 리소스는 자동 정리되지 않으므로 직접 `dispose()`해야 한다고 명시합니다. ([Three.js][1])

특히 AMU가 모바일 퍼스트라면 **파일 크기뿐 아니라 GPU frame cost가 더 중요**합니다. 브라우저에서 부드러운 애니메이션은 매 프레임 렌더링 비용의 영향을 받고, GPU가 과부하되면 프레임 드롭과 배터리 소모가 발생합니다. ([Web.dev][2])

따라서 AMU의 원칙은:

**Video/Image → Three.js 전환**이 아니라

**정적인 자산으로 표현하기 비효율적인 경험 → Three.js**

가 되어야 합니다.

---

# 2. AMU에서 가장 가치가 큰 건 “3D”가 아니라 “Code-native Visual”

이 사례에서 제가 더 중요하게 보는 것은 Three.js 자체가 아닙니다.

기존 방식은 대략 이렇습니다.

```text
Figma
→ 이미지/영상 제작
→ 개발자 전달
→ HTML/CSS 구현
→ 수정
→ 이미지/영상 재제작
```

AI 시대에는 다음 구조가 가능합니다.

```text
Reference
↓
AI
↓
Scene Code
↓
Config
↓
실시간 Preview
↓
AI 수정
```

예를 들어 이런 식입니다.

```ts
{
  scene: "particle-morph",
  camera: {
    start: [0, 1, 8],
    end: [0, 0, 4]
  },

  phases: [
    {
      at: 0,
      target: "sphere"
    },
    {
      at: 2.4,
      target: "amu-logo"
    },
    {
      at: 4.8,
      target: "studio"
    }
  ],

  effects: {
    bloom: 0.35,
    depthOfField: false
  }
}
```

그러면 AI에게

> 로고가 나타나는 시간을 1초 늦춰줘.

라고 했을 때 전체 장면을 다시 만들 필요가 없습니다.

```diff
- at: 2.4
+ at: 3.4
```

로 끝납니다.

바로 인용한 두 번째 사례의 핵심입니다.

**기획 자체가 설정 파일이 되는 구조입니다.**

---

# 3. 이걸 AMU에서는 `AMU Visual Runtime`으로 보는 것이 좋습니다

처음부터 거대한 신규 플랫폼을 만들 필요는 없습니다.

개념적으로는 이렇게 두면 됩니다.

```text
AMU Experience
│
├─ DOM UI
│   ├─ Article
│   ├─ Form
│   ├─ Navigation
│   └─ Accessibility
│
└─ Visual Runtime
    │
    ├─ Scene
    ├─ Timeline
    ├─ Interaction
    ├─ Shader
    ├─ Particle
    ├─ Camera
    └─ Post Processing
```

그리고 구현은 AMU의 현재 Next.js / React 구조라면

```text
Next.js SSR
+
React UI
+
React Three Fiber / Three.js
```

구조가 가장 자연스럽습니다.

React Three Fiber도 공식 성능 가이드에서 object를 계속 mount/unmount하지 말고 geometry/material을 재사용하고, 대량 object는 instancing을 사용하며, render loop 안에서 React `setState`를 남발하지 않는 방식을 권장합니다. ([Poimandres Documentation][3])

---

# 4. AMU 서비스별로 보면 적용 가치가 크게 다릅니다

| 서비스                | Three.js 적합도 | 추천 활용                        |
| ------------------ | -----------: | ---------------------------- |
| **AMU Home**       |        ★★★★★ | 브랜드 Hero, 서비스 간 관계 표현        |
| **Magazine**       |        ★★★☆☆ | 일부 특집·데이터·스토리텔링              |
| **Gen Studio**     |        ★★★★★ | Interactive Scene 생성·Preview |
| **Marketing Oops** |        ★★★★☆ | 캠페인 랜딩·Interactive Creative  |
| **Tutors**         |        ★★★☆☆ | 개념 시각화·공간형 학습                |
| **Play**           |        ★★★★☆ | 3D가 필요한 게임만                  |
| **Store**          |        ★★★★☆ | 제품 Showcase·Exploded View    |

특히 **Home + Gen Studio + Marketing Oops** 세 영역이 가장 먼저 실험할 가치가 있습니다.

---

# 5. AMU Home에는 상당히 잘 맞습니다

최근 이야기했던 AMU 홈 개편과도 연결됩니다.

홈에서 기존 방식이라면

```text
Magazine
Gen Studio
Tutors
Play
Marketing Oops
Store
```

를 카드 여섯 장으로 보여주기 쉽습니다.

그런데 이건 정보는 전달하지만 **AMU라는 하나의 세계를 느끼게 하지는 못합니다.**

Three.js를 사용하면 예를 들어 하나의 입자가 등장하고,

```text
ARTICLE
    ↓
질문
    ↓
IDEA
    ↓
CREATE
    ↓
PLAY
    ↓
RETURN
```

처럼 계속 형태가 변하게 만들 수 있습니다.

AMU 로고에서 입자가 흩어졌다가

```text
Magazine
→ Tutors
→ Gen Studio
→ Play
```

의 형태로 morph하는 식입니다.

그리고 사용자가 포인터나 스크롤로 이동하면 카메라가 각 서비스 쪽으로 접근합니다.

### 중요한 건

그걸 그냥 “멋있는 우주 배경”으로 만들면 실패합니다.

AMU의 가치 구조인

> 읽기 → 질문 → 학습 → 제작 → 플레이

를 **움직임 자체로 설명해야 합니다.**

그러면 장식이 아니라 **제품 설명 UI**가 됩니다.

---

# 6. Magazine에서는 절대로 모든 기사에 넣으면 안 됩니다

Magazine은 오히려 Three.js를 가장 조심해서 사용해야 합니다.

Google도 콘텐츠 중심 페이지에서는 많은 클라이언트 JS보다 SSR이나 static rendering이 일반적으로 초기 렌더링과 응답성 측면에서 유리하다고 설명합니다. ([Web.dev][4])

그러므로 기본 기사는 계속

```text
WordPress SSR
+
HTML
+
Image
```

가 중심이어야 합니다.

대신 특정 글에서만:

```text
경제 데이터 변화
→ 3D/particle graph

AI 산업 구조
→ network visualization

부동산 시장
→ interactive map

기업 전략
→ ecosystem visualization

기술 설명
→ exploded model

Build in Public
→ AMU architecture visualization
```

같은 형태로 사용합니다.

### 즉

Magazine의 Three.js는

> Decoration

이 아니라

> Interactive Figure

에 가깝게 보는 게 좋습니다.

NYT의 interactive journalism과 더 가까운 방향입니다.

---

# 7. 그런데 가장 재미있는 곳은 Gen Studio입니다

여기서 이야기가 훨씬 커질 수 있습니다.

현재 Gen Studio는 기본적으로

```text
Template
→ Prompt
→ Model
→ Generate
→ Result
```

구조입니다.

실제 현재 구현에서도 Image Studio와 Content Studio는 템플릿 갤러리 → 설정 → 생성 → 결과 확인이라는 DOM 기반 작업 흐름을 사용하고 있습니다. 이런 UI 자체는 Three.js로 바꾸면 안 됩니다. 

대신 생성 타입을 장기적으로

```text
Image
Content
Video
Interactive
```

까지 확장할 수 있습니다.

예를 들어:

### Interactive Scene

사용자가

> AI 시대를 표현하는 미래적인 랜딩 Hero를 만들어줘.

라고 입력합니다.

Gen Studio가 생성하는 것은 이미지가 아니라:

```text
Scene
Timeline
Shader
Camera
Lighting
Interaction
Config
```

입니다.

결과:

```tsx
<AmuScene preset="particle-network" />
```

혹은:

```json
{
  "preset": "particle-network",
  "density": 0.7,
  "motion": "flow",
  "interaction": "pointer"
}
```

가 됩니다.

---

# 8. 그러면 Three.js 자산이 이미지 프롬프트처럼 축적됩니다

이게 AMU에서 상당히 중요한 부분입니다.

현재 Gen Studio에는 이미지 프롬프트 템플릿이 있습니다.

앞으로는:

```text
Prompt Template
+
Visual Template
```

이 존재할 수 있습니다.

예:

```text
/Particle Morph
/Product Explosion
/Floating Product
/Infinite Grid
/Orbital UI
/Data Stream
/Neural Network
/Liquid Glass
/Point Cloud
/Cinematic Product
```

각각이 코드 component입니다.

Meng To의 ThreeUI 프로젝트도 실제로 Three.js hero, shader, interactive component를 **복사·수정할 수 있는 코드 component catalog** 형태로 만들고 있습니다. 현재 공개 Community 저장소에는 50개의 parent component와 다수의 variant가 포함되어 있습니다. ([GitHub][5])

즉 AMU에서도

```text
Prompt Library
```

다음에

```text
Visual Primitive Library
```

가 생길 수 있습니다.

---

# 9. 두 번째 사례의 “Particle Morph”는 AMU에서 꼭 만들어볼 만합니다

다만 설명 중 한 부분은 조금 보정할 필요가 있습니다.

> 현재 위치 이미지 + 목표 위치 이미지

라는 표현은 일반 PNG 사진 두 장을 섞는다는 뜻이라기보다, 보통 **particle 위치 정보를 texture/buffer에 저장하고 GPU shader에서 보간하는 방식**에 가깝습니다.

개념적으로는:

```glsl
currentPosition
targetPosition

position = mix(
  currentPosition,
  targetPosition,
  progress
);
```

입니다.

따라서

```text
Sphere
AMU Logo
Person
Building
Graph
Product
```

가 있어도 shader 로직은 그대로입니다.

바뀌는 것은 target position data입니다.

그래서 재사용성이 매우 높습니다.

---

# 10. 여기에 `Timeline`을 붙이면 AMU다운 시스템이 됩니다

저라면 Particle보다 먼저 **Timeline abstraction**을 설계할 것 같습니다.

예:

```ts
const timeline = [
  {
    from: 0,
    to: 0.15,
    scene: "intro",
  },

  {
    from: 0.15,
    to: 0.35,
    action: "particle:morph",
    target: "amu",
  },

  {
    from: 0.35,
    to: 0.55,
    action: "camera:move",
    target: "magazine",
  },

  {
    from: 0.55,
    to: 0.75,
    action: "particle:morph",
    target: "studio",
  },
];
```

그러면 scroll은 그냥

```text
scrollProgress
↓
timeline
↓
scene state
```

를 제어합니다.

마우스나 touch도 같은 방식입니다.

```text
Pointer
Scroll
Tap
Swipe
Time
Audio
```

를 모두 trigger로 사용할 수 있습니다.

---

# 11. 그러면 AI에게 아주 좋은 구조가 됩니다

이게 앞서 소개한 사례의 진짜 장점입니다.

AI에게 복잡한 shader를 매번 다시 만들라고 하는 게 아닙니다.

이미 존재하는:

```text
ParticleMorph
CameraMove
ObjectReveal
Glow
Explode
Rotate
Focus
Blur
Scatter
```

같은 primitive를 조합하게 합니다.

예를 들어:

> 제품이 화면 중앙으로 등장하고 2초 후 부품이 폭발하듯 펼쳐진 다음 다시 합쳐져.

AI가 만드는 것은:

```json
[
  {
    "action": "camera.focus",
    "at": 0
  },
  {
    "action": "object.explode",
    "at": 2,
    "duration": 1.2
  },
  {
    "action": "object.assemble",
    "at": 4,
    "duration": 0.8
  }
]
```

가 됩니다.

즉,

> **AI가 코드를 생성하는 시스템**

보다

> **AI가 검증된 Visual Primitive를 조립하는 시스템**

으로 가는 것이 훨씬 안정적입니다.

---

# 12. Marketing Oops와 연결하면 더 재미있습니다

이렇게 만들어진 Scene은 단순 홈페이지 자산으로 끝나지 않습니다.

```text
Magazine
        ↓
Visual Pattern
        ↓
Gen Studio
        ↓
Interactive Creative
        ↓
Marketing Oops
```

가 가능합니다.

Marketing Oops가

> 이번 캠페인의 CTR이 떨어지고 있다.

고 판단하면 기존 랜딩을 새로 만들 필요 없이

```text
Hero A
Particle A
Copy A
CTA A
```

를

```text
Hero B
Particle C
Copy B
CTA A
```

처럼 조합해서 실험할 수 있습니다.

결국 **Interactive Creative도 Growth asset**이 됩니다.

---

# 13. AMU에서는 처음부터 `@amu-labs/three`를 만들 필요는 없습니다

여기서는 오버엔지니어링을 피하는 게 좋습니다.

처음에는 예를 들어:

```text
node-app/
  components/
    visual/
      ParticleMorph/
      ProductShowcase/
      ScrollScene/
```

정도로 실험합니다.

실제로 Magazine, Gen Studio, Marketing Oops 등 **3곳 이상에서 재사용되는 게 확인되면**

```text
@amu-labs/ui
```

또는 그 시점에 필요하다면 별도의 visual package 승격을 검토하면 됩니다.

처음부터 새로운 rendering framework를 AMU 전체 SSOT로 만들 필요는 없습니다.

---

# 14. 최초 POC는 딱 세 개가 좋습니다

제가 AMU에서 시작한다면 이 세 가지입니다.

1. **Particle Morph Hero**
   입자가 AMU → Magazine → Gen Studio → Tutors 등의 형태로 전환.

2. **Interactive Product Showcase**
   Gen Studio / Smartstore에서 상품을 회전·분해·집중 조명하는 장면.

3. **Scroll Story Scene**
   scroll progress에 따라 camera·particle·text가 움직이는 Article/landing용 scene.

이 세 개만 만들면 거의 모든 기술적 질문을 검증할 수 있습니다.

```text
shader
particle
GLTF
camera
scroll
pointer
mobile GPU
lazy loading
resource cleanup
fallback
accessibility
```

을 모두 테스트할 수 있기 때문입니다.

---

# 15. AMU에서는 성능 정책이 반드시 같이 들어가야 합니다

Three.js를 넣는 페이지에서도 HTML이 먼저 보여야 합니다.

```text
SSR HTML
↓
Hero placeholder
↓
Interactive JS lazy load
↓
WebGL ready
↓
canvas fade-in
```

구조가 좋습니다.

WebGL이 실패하거나 저사양 기기라면:

```text
Three.js
   ↓ fail / low power
Static Poster
```

로 내려갑니다.

그리고 `prefers-reduced-motion`도 지원합니다.

Core Web Vitals의 현재 권장 기준은 75 percentile 기준으로 LCP 2.5초 이하, INP 200ms 이하, CLS 0.1 이하입니다. Three.js 적용 후에도 이 기준을 유지하는 것을 AMU의 최소 guardrail로 두는 게 좋습니다. ([Web.dev][6])

---

# 16. 기술 구조는 이런 그림이 가장 적합합니다

```text
                 AMU Page
                    │
           ┌────────┴────────┐
           │                 │
        HTML/React      Visual Runtime
           │                 │
         SSR             Lazy Load
                             │
                      React Three Fiber
                             │
                 ┌───────────┼───────────┐
                 │           │           │
               Scene      Timeline    Interaction
                 │           │           │
             Geometry      Config      Scroll
             Material      Trigger      Pointer
             Shader        Easing       Touch
             GLTF          Phase        Audio
                 │
            Asset Manager
                 │
            R2 / CDN
```

그리고 가장 중요한 부분은 이 위입니다.

```text
                  Gen Studio
                      │
                     AI
                      │
            Scene Configuration
                      │
               Visual Runtime
```

여기까지 가면 **Three.js는 사이트 효과가 아니라 Gen Studio의 출력 포맷**이 됩니다.

---

## 제 판단

이 방향은 AMU와 상당히 궁합이 좋습니다.

다만 **“우리도 3D 홈페이지를 만들자” 정도로 접근하면 일시적인 디자인 유행에 그칠 가능성이 큽니다.**

오히려 AMU가 가져가야 할 아이디어는:

> **이미지와 영상을 소비하는 사이트에서
> 코드로 정의된 인터랙티브 경험을 조합하고 생성하는 플랫폼으로 한 단계 확장한다.**

입니다.

특히 AMU에는 이미 **Gen Studio라는 생성 인프라**, **Marketing Oops라는 실험 인프라**, **Magazine이라는 배포·발견 채널**이 있기 때문에 이 구조를 상당히 자연스럽게 연결할 수 있습니다.

그래서 우선순위를 잡는다면 저는 이렇게 봅니다.

**지금:**
`AMU Home용 Particle Morph + Scroll Timeline POC`

**다음:**
`재사용 가능한 Visual Primitive 3~5개`

**그 다음:**
`JSON 기반 Scene/Timeline Config`

**성공이 확인되면:**
`Gen Studio → Interactive Scene 생성`

여기까지 가는 순간 AMU는 단순히 Three.js를 “사용하는” 사이트가 아니라, **Three.js 경험 자체를 AI로 생성·편집·재사용하는 시스템**을 갖게 됩니다. 이게 위 사례에서 AMU가 가져올 수 있는 가장 큰 전략적 확장이라고 봅니다.

[1]: https://threejs.org/manual/en/how-to-dispose-of-objects.html?utm_source=chatgpt.com "How to dispose of Objects"
[2]: https://web.dev/articles/rendering-performance?utm_source=chatgpt.com "Rendering performance  |  Articles  |  web.dev"
[3]: https://r3f.docs.pmnd.rs/advanced/pitfalls?utm_source=chatgpt.com "Performance pitfalls - React Three Fiber"
[4]: https://web.dev/articles/rendering-on-the-web?hl=en&utm_source=chatgpt.com "Rendering on the Web  |  Articles  |  web.dev"
[5]: https://github.com/MengTo/threeui?utm_source=chatgpt.com "GitHub - MengTo/threeui: Open-source ThreeUI Community catalog with live interactive components and complete Community source. · GitHub"
[6]: https://web.dev/articles/vitals?hl=en&utm_source=chatgpt.com "Web Vitals  |  Articles  |  web.dev"

===

좋아. 그럼 최근에 논의했던 홈/아카이브의 인터렉션에 아래와 같은 애니메이션 효과를 three.js로 구현해서 적용하는 것에 대해서는 어떻게 생각해??

우선 홈/아카이브의 좌우 이동 인터렉티브에서 보여지는 썸네일은 매우 매력적이고 화려한 그래픽 베이스의 이미지를 배치하고, 해당 그래픽 이미지 위에 타이틀과 description 텍스트를 오버랩으로 올린 후 마치 틱톡이나 유튜브의 숏폼처럼 텍스트가 한줄씩 애니메이션되며 나타나는 것을 루프로 돌려서 마치 동영상을 보는 것 같은 효과를 주는 거야.

이걸 응용하면 해당 포스트의 상세 페이지의 헤더에도 동일한 효과를 적용할 수 있고, [영상으로 보기] 같은 버튼은 배치하고 해당 버튼을 누르면 각 틱톡이나 유튜브의 숏폼 같은 화면 레이아웃을 변경한 후 타이틀 부터 기사 내용을 순차적으로 텍스트 애니메이션 처리를 하면서 각 섹션이나 텍스트 내용에 맞는 이미지를 넣어서 동영상처럼 표현할 수도 있을 것 같아. 

더 장기적으로는 아예 해당 기사의 핵심내용만 추려서 정말 숏폼처럼 짧은 내용만 인사트를 담아서 보여주는 것도 가능할 것 같고, 일레븐랩스의 TTS를 연결해서 실제 영상처럼 만드는 것도 가능할 것 같아. 

네 생각은 어때??

===

좋아요. 제 생각은 **방향 자체는 매우 좋고, AMU만의 시그니처가 될 가능성이 큽니다.**
다만 핵심은 하나입니다.

> **“기사를 영상처럼 보이게 한다”가 아니라,
> “읽는 경험을 숏폼 문법으로 재구성한다”**

이 관점으로 가야 합니다.

그렇게 보면 제 답은 **찬성**입니다.
하지만 **Three.js를 전면 적용하는 방식**보다는, **Three.js는 시각적 런타임으로 제한하고, 텍스트·정보·내비게이션은 DOM 중심으로 유지하는 하이브리드 구조**가 맞습니다.

---

# 결론부터 말하면

당장 아이디어를 세 단계로 나눠보면 이렇습니다.

### 1) 홈/아카이브 썸네일

**매우 적합합니다.**
AMU의 차별화 포인트가 될 수 있습니다.

### 2) 포스트 상세 페이지 헤더

**꽤 적합합니다.**
특히 “읽기 전 몰입”을 만드는 데 좋습니다.

### 3) 기사 전체를 숏폼처럼 재생하는 모드

**장기적으로 매우 유망합니다.**
다만 이건 단순 UI 효과가 아니라 **새 콘텐츠 포맷**이 됩니다.

즉, 이건 “애니메이션 좀 넣자” 수준이 아니라
**AMU Magazine의 새로운 표현 계층**이 될 수 있어요.

---

# 왜 이 방향이 AMU에 잘 맞는가

AMU는 원래부터 단순 블로그가 아니라

* 읽고
* 질문하고
* 배우고
* 만들고
* 다시 돌아오는

인터랙티브 미디어 구조를 지향하잖아요.

그런데 기존 기사 UI는 대체로

```text
썸네일
제목
본문
```

구조입니다.

반면 지금 제안한 방식은

```text
시선 유도
→ 몰입
→ 핵심 메시지 강조
→ 계속 넘기게 만드는 리듬
→ 상세 읽기 또는 확장 행동
```

구조예요.

이건 특히 **홈/아카이브의 CTR**, **본문 진입률**, **체류시간**, **저장/공유**를 올릴 가능성이 있습니다.

---

# 그런데 “Three.js로 다 만들자”는 위험합니다

여기서 제일 중요한 경계가 있습니다.

사용자가 말한 효과 중에는 두 종류가 섞여 있습니다.

## A. Three.js가 잘하는 것

* 입자, 깊이감, 3D 공간감
* 카드 전환 시 왜곡/유체/패럴랙스
* 이미지의 시네마틱한 변형
* 배경 비주얼, 장면 전환
* 글래스/노이즈/조명/입체 모션

## B. 굳이 Three.js가 아니어도 되는 것

* 제목/설명 한 줄씩 등장
* 텍스트 루프 애니메이션
* CTA 버튼 등장
* 읽기 순서 제어
* 숏폼 스타일의 순차 텍스트 노출

즉, **텍스트 애니메이션은 DOM/CSS/Framer Motion 계열**,
**시각 효과와 장면 전환은 Three.js**가 더 적합합니다.

이걸 섞어야 합니다.

---

# 추천 구조: “DOM 위에 Three.js”

홈/아카이브 카드 1개를 예로 들면 이런 구조가 좋습니다.

```text
[Three.js layer]
- 배경 그래픽
- 미세한 카메라 움직임
- 파티클/노이즈/깊이감
- 좌우 이동 시 전환 효과

[DOM overlay layer]
- 제목
- description
- 카테고리
- 저장/좋아요
- 진행 인디케이터
- CTA 버튼
```

즉,

> **그래픽은 canvas**,
> **의미 있는 텍스트는 HTML**

이 원칙이 좋습니다.

이렇게 해야 하는 이유는 분명합니다.

### 이유 1. 접근성

캔버스 안 텍스트는 선택, 복사, 스크린리더, 반응형 대응이 불리합니다.

### 이유 2. SEO

홈/아카이브의 제목/설명은 검색과 링크 프리뷰 관점에서도 실제 DOM이 낫습니다.

### 이유 3. i18n

한글/영문 지원, 줄바꿈, 텍스트 길이 대응이 훨씬 쉽습니다.

### 이유 4. 수정성

콘텐츠팀이 제목/설명만 바꾸는 경우가 훨씬 많기 때문입니다.

---

# 홈/아카이브에 적용하면 가장 강력한 포인트

사용자가 말한 홈/아카이브 인터랙션과 결합하면 꽤 매력적입니다.

예를 들어 카드 한 장이 이런 흐름을 가질 수 있습니다.

```text
1. 화려한 그래픽 커버 등장
2. 제목 1행 등장
3. 제목 2행 등장
4. 짧은 description 한 줄씩 순차 노출
5. 마지막에 "탭해서 읽기" 또는 저장 유도
6. 다음 루프
```

이건 틱톡/유튜브 숏폼의 “정지 화면 같지만 계속 시선을 잡는 구조”를 웹에 번역한 겁니다.

특히 AMU 홈의 좌우 이동 인터랙션과 잘 맞습니다.

### 좋은 점

* 스크롤보다 **카드 1장 1경험**이 강해짐
* 썸네일이 단순 이미지가 아니라 **마이크로 스토리**가 됨
* 기사의 핵심 메시지를 읽기 전에 전달 가능
* “무슨 글인지 모르겠는 카드” 문제를 줄일 수 있음

---

# 다만 “모든 카드가 너무 화려하면” 오히려 역효과입니다

이건 꼭 경계해야 합니다.

AMU의 콘텐츠는 비즈니스, 투자, 자기계발, AI, 마케팅 등 정보성 비중이 크기 때문에
모든 카드가 지나치게 움직이면 사용자는 피로해집니다.

그래서 추천은:

## 카드 유형을 나누는 것

### 1) Standard Card

* 정적 이미지 또는 아주 약한 움직임
* DOM 텍스트만 가볍게 등장

### 2) Motion Card

* 루프형 텍스트 등장
* 배경에 약한 입자/깊이감
* 홈 히어로, 주요 추천 글에만 사용

### 3) Signature Card

* Three.js 전환까지 포함
* 캠페인성/대표 글/특집/브랜드 글에만 사용

즉, **모든 포스트에 풀 효과를 거는 게 아니라 등급화**해야 합니다.

---

# 포스트 상세 페이지 헤더에도 잘 맞습니다

이건 꽤 좋은 아이디어예요.

상세 페이지 상단에서

* 시네마틱 커버
* 제목 순차 등장
* 한 줄 요약
* 카테고리/작성일
* [영상으로 보기] 버튼

같은 구조를 두면
기사 진입 초반의 인상이 훨씬 강해집니다.

특히 지금 AMU가 고민하는 “기사의 매력도 부족” 문제를 해결하는 데 도움이 됩니다.

다만 여기서도 원칙은 같습니다.

## 헤더에서는

* Three.js: 배경 비주얼, 움직임, 전환
* DOM: 제목, 리드, 버튼, 메타 정보

이 조합이 맞습니다.

---

# [영상으로 보기]는 굉장히 좋은 확장 포인트입니다

저는 이 부분이 특히 좋습니다.

왜냐하면 이건 단순 버튼이 아니라
AMU Magazine을 다음 단계로 확장하는 포맷이기 때문입니다.

## 이 버튼의 본질은

“기사를 영상으로 만든다”가 아닙니다.

정확히는

> **기사를 ‘scene-based reading mode’로 변환한다**

입니다.

예를 들어 기사 내용을 6~10개의 장면으로 나눕니다.

```text
Scene 1
- Hook
- 큰 제목
- 핵심 메시지 1줄

Scene 2
- 문제 제기
- 관련 비주얼

Scene 3
- 핵심 포인트 1
- 짧은 문장 2~3개

Scene 4
- 사례

Scene 5
- 배울 점

Scene 6
- 적용법 / CTA
```

이걸 사용자는 세로형 숏폼 UI처럼 넘겨 보거나 자동 재생으로 볼 수 있습니다.

이건 텍스트 기사와 완전히 다른 사용자층도 잡을 수 있어요.

---

# 다만 “영상처럼 보이는 UI”와 “실제 영상”은 구분해야 합니다

이 두 가지는 전혀 다른 난이도입니다.

## 1단계: 영상처럼 보이는 인터랙티브 읽기 모드

* 웹 안에서 재생
* 실제 mp4 생성 없음
* 배경 이미지/애니메이션 + 텍스트 시퀀스
* 가장 빠르게 구현 가능

## 2단계: 자동 숏폼 생성용 스토리보드

* 기사 요약
* 장면 분할
* 컷별 카피 생성
* 음성 없이도 가능

## 3단계: TTS 포함

* ElevenLabs 음성
* 자막 타이밍
* 장면별 duration
* 오디오 싱크

## 4단계: 실제 영상 export

* mp4 렌더
* 유튜브/틱톡/릴스 업로드용

처음부터 4단계까지 한 번에 가면 무조건 무거워집니다.

---

# AMU에 가장 맞는 구현 전략

저는 이렇게 가는 게 가장 좋다고 봅니다.

## Phase 1. Home / Archive Motion Cover

목표: **발견 경험 강화**

구성:

* 카드 배경 비주얼
* 제목/설명 루프 애니메이션
* 좌우 전환 시 시네마틱 전환
* 일부 대표 카드만 Three.js 적용

성과 지표:

* 카드 클릭률
* 읽기 진입률
* 저장률

---

## Phase 2. Article Hero Motion Header

목표: **진입 몰입감 강화**

구성:

* 상세 페이지 상단 히어로
* 제목/리드 등장
* 이미지/그래픽의 subtle motion
* [영상으로 보기] 버튼 추가

성과 지표:

* 본문 스크롤 시작률
* 30초 체류율
* 공유/저장

---

## Phase 3. Story Mode

목표: **기사의 새로운 소비 포맷 생성**

구성:

* 기사 → scene JSON 변환
* 텍스트 순차 등장
* 이미지/그래픽 장면 전환
* 세로형 또는 풀스크린 모드

성과 지표:

* story mode 진입률
* 완주율
* 기사 본문 복귀율
* 공유율

---

## Phase 4. Shortform Summary + TTS

목표: **콘텐츠 재가공 자동화**

구성:

* 기사 핵심 요약
* 씬 분할
* ElevenLabs TTS
* 자동 자막
* 숏폼용 썸네일/표지

성과 지표:

* 숏폼 생성 효율
* SNS 유입
* 원문 기사 유입 환류

---

# 이걸 구현할 때 가장 중요한 건 “기사 → scene 데이터화”입니다

장기적으로는 기사 하나를 이런 식으로 다룰 수 있어야 합니다.

```ts
type ArticleStoryScene = {
  id: string;
  type: "hook" | "summary" | "point" | "case" | "cta";
  title?: string;
  lines: string[];
  image?: string;
  motionPreset?: string;
  duration?: number;
  ttsScript?: string;
};
```

그리고 포스트별로

```ts
type StoryModeMeta = {
  enabled: boolean;
  coverMotionPreset: string;
  cardLoopLines: string[];
  storyScenes: ArticleStoryScene[];
  shortSummary?: string[];
};
```

이런 구조가 있으면:

* 홈/아카이브 카드 루프
* 상세 헤더
* story mode
* 숏폼용 스크립트

를 하나의 데이터 원천에서 확장할 수 있습니다.

이게 중요합니다.

> **기사 본문 따로, 숏폼 따로, 헤더 따로**
> 로 만들면 운영 비용이 폭증합니다.

---

# Three.js는 어디까지 맡기는 게 좋은가

정리하면 이 정도가 مناسب합니다.

## Three.js 담당

* 배경 그래픽
* depth/parallax
* 카드 전환 효과
* image distortion
* particle motion
* immersive hero scene

## 일반 React/DOM/CSS 담당

* 텍스트 등장
* 제목/설명 라인 애니메이션
* 버튼
* 읽기 CTA
* 진행 바
* 저장/공유/좋아요
* 접근성 요소

즉, **Three.js는 연출 엔진**,
**콘텐츠 UI는 여전히 앱/웹 UI 계층**입니다.

이 원칙은 현재 Gen Studio UI가 템플릿·검색·설정·생성 결과를 DOM 중심으로 유지하고 있는 구조와도 일관됩니다. 즉, AMU는 생성/소비 UI의 핵심을 웹 UI로 두고, 시각적 몰입 요소를 별도의 계층으로 얹는 방식이 더 잘 맞습니다. 

---

# 우려해야 할 리스크도 분명합니다

## 1. 정보보다 연출이 앞설 위험

비즈니스/투자/AI 글인데 너무 광고 영상처럼 보이면 신뢰감이 떨어질 수 있습니다.

## 2. 성능

모바일에서 카드 여러 장이 동시에 움직이면 GPU 부담이 큽니다.

## 3. 콘텐츠 운영 비용

모든 기사에 motion scene을 수작업으로 붙이면 지속 불가능합니다.

## 4. 피로감

모든 텍스트가 항상 애니메이션되면 오히려 읽기 피곤합니다.

## 5. 접근성

자동 재생, 깜빡임, 과도한 움직임은 일부 사용자에게 불편합니다.

---

# 그래서 실무적으로는 이렇게 가는 게 좋습니다

## 원칙

* 모든 글에 적용하지 않기
* 기본은 정적, 중요한 글만 motion
* 텍스트는 DOM
* Three.js는 배경/전환에만
* Story mode는 별도 읽기 포맷으로 분리
* TTS와 실제 영상 export는 나중 단계

## 우선순위

1. 홈 히어로/대표 카드 3~5개
2. 아카이브 카드 1종 시범 적용
3. 상세 헤더 1종
4. Story mode MVP
5. 자동 숏폼/TTS

---

# 제 최종 판단

이건 단순한 애니메이션 아이디어가 아니라
AMU Magazine을 **“읽는 기사”에서 “재생되는 기사”까지 확장하는 전략**입니다.

그래서 저는 꽤 긍정적입니다.

다만 성공 조건은 분명합니다.

> **Three.js를 사이트 전체의 구현 방식으로 쓰지 말고,
> AMU만의 몰입형 콘텐츠 경험을 만드는 시각 런타임으로 써야 합니다.**

즉,

* 홈/아카이브 = **발견용 motion cover**
* 상세 헤더 = **몰입용 cinematic intro**
* 영상으로 보기 = **story mode**
* 장기적으로 = **shortform/TTS/video pipeline**

이 순서가 가장 좋습니다.

원하면 다음 단계로 바로 이어서
**“AMU 홈/아카이브/상세용 Motion Article System”의 구현 로드맵**을
`구조 설계 → 데이터 모델 → UI 흐름 → 성능 정책 → MVP 범위` 기준으로 구체적으로 정리해드릴게요.

===

좋아. 그럼 해당 시스템을 `https://chatgpt.com/g/g-p-68214e57361481919ea5ad1bd057e404/c/6a977d3e-b048-83e9-b5eb-d12f196676b8`에서 논의했던 AMU 스토리텔링 시스템과 통합한다면??

===

통합하는 편이 훨씬 좋습니다. 오히려 방금 논의한 Motion Article System을 별도 시스템으로 만드는 것보다, 기존 AMU 스토리텔링 시스템의 **“표현·재생 계층”**으로 넣는 것이 구조적으로 맞습니다.

핵심은 이렇게 잡겠습니다.

> **AMU Storytelling System = 무엇을 어떤 순서로 전달할지 결정**
> **Motion/Visual Runtime = 그것을 어떻게 보여주고 들려줄지 결정**

그리고 이 둘 사이의 SSOT를 `Story Manifest` 같은 구조화된 데이터로 두는 겁니다.

---

# 1. 그러면 AMU의 전체 구조가 상당히 깔끔해집니다

기존에 논의했던 구조에는 이미 두 종류의 스토리텔링이 있었습니다.

하나는 콘텐츠 제작 쪽의:

```text
Magazine Article
→ Content Director
→ Format / Hook / Story
→ Storyboard
→ Shot Graph
→ Character / Scene / Audio Bible
→ Production Grammar
→ Generation
```

이고,

다른 하나는 Play/Tutors 쪽의 동적인:

```text
Universe Canon
→ Character Arc
→ User Storyline
→ Story Beat
→ Choice / Event
→ State Change
```

구조였습니다.

이 둘에 이번 Motion Article을 세 번째 시스템으로 붙이는 게 아니라,

```text
                    AMU Story System
                           │
                     Story Manifest
                           │
          ┌────────────────┼────────────────┐
          │                │                │
      Magazine          Tutors/Play       Marketing
          │                │                │
     Story Mode       Narrative Runtime   Creative
          │
     Visual Runtime
     ├ DOM Motion
     ├ Three.js
     ├ Image
     ├ Audio/TTS
     └ Video
```

이렇게 만드는 것이 좋습니다.

즉 **스토리의 의미와 표현을 분리**합니다.

---

# 2. 가장 중요한 SSOT는 `Story Beat`가 됩니다

지금 홈에서 필요한 건 제목 애니메이션이고, 상세 페이지에서는 좀 더 긴 intro가 필요하며, Story Mode에서는 기사 전체를 여러 장면으로 보여줘야 합니다.

각각 따로 콘텐츠를 만들면 안 됩니다.

예를 들어 원문 기사가 있다고 해보겠습니다.

> AI 에이전트 사용량이 7배 늘었지만 비용은 증가하지 않았다.

스토리텔링 시스템이 먼저 이것을 의미 단위로 만듭니다.

```ts
type StoryBeat = {
  id: string;

  role:
    | "hook"
    | "context"
    | "problem"
    | "insight"
    | "evidence"
    | "example"
    | "turn"
    | "takeaway"
    | "cta";

  headline?: string;
  body: string[];

  importance: number;

  sourceRefs?: string[];

  visualIntent?: {
    concept?: string;
    mood?: string;
    subjects?: string[];
  };
};
```

예:

```json
{
  "id": "beat-01",
  "role": "hook",
  "headline": "AI 사용량은 7배 늘었다.",
  "body": [
    "그런데 비용은 늘지 않았다."
  ],
  "importance": 1
}
```

이게 **의미 SSOT**입니다.

Three.js도 없고 TTS도 없고 애니메이션도 없습니다.

여기서는 오직:

> 무엇을 전달할 것인가?

만 결정합니다.

---

# 3. 그다음 `Scene`이 표현을 결정합니다

Story Beat를 Visual Scene으로 compile합니다.

```ts
type StoryScene = {
  id: string;

  beats: string[];

  layout:
    | "cover"
    | "statement"
    | "image-text"
    | "quote"
    | "data"
    | "comparison"
    | "outro";

  visual?: {
    assetId?: string;
    preset?: string;
    motionPreset?: string;
  };

  text?: {
    reveal: "line" | "word" | "fade" | "none";
  };

  duration?: number;

  audio?: {
    narration?: string;
  };
};
```

예를 들어:

```json
{
  "id": "scene-01",
  "beats": ["beat-01"],
  "layout": "cover",
  "visual": {
    "assetId": "uber-ai-cost-cover",
    "motionPreset": "slow-depth-push"
  },
  "text": {
    "reveal": "line"
  },
  "duration": 4.8
}
```

그러면 방금 말한

> 화려한 이미지 위에서 문장이 한 줄씩 나타나는 효과

는 그냥 `scene`을 재생하는 표현 방식 중 하나가 됩니다.

---

# 4. 여기서 엄청난 장점이 생깁니다

같은 `StoryBeat`로 여러 결과물을 만들 수 있습니다.

## 홈

중요도가 높은 1~2개 Beat만 사용합니다.

```text
Beat 1
↓
Motion Cover
↓
3~6초 loop
```

예:

> AI 사용량은 7배 늘었다.
> 비용은 그대로였다.

---

## Archive

조금 더 많은 정보를 사용합니다.

```text
Hook
+
핵심 Insight
```

5~8초 정도.

---

## Article Hero

```text
Hook
+
Context
```

으로 cinematic intro를 만듭니다.

---

## [영상으로 보기]

전체 Story Beat를 사용합니다.

```text
Hook
↓
Problem
↓
Evidence
↓
Example
↓
Insight
↓
Takeaway
```

이게 Story Mode입니다.

---

## Shorts/Reels

중요 Beat만 다시 추립니다.

```text
Hook
→ Surprise
→ Evidence
→ Takeaway
```

20~40초 정도의 Short Story를 만들 수 있습니다.

즉,

> **하나의 기사 → 다섯 개 콘텐츠 제작**

이 아니라

> **하나의 Story SSOT → 다섯 가지 표현**

이 됩니다.

이 차이가 굉장히 큽니다.

---

# 5. TTS도 같은 구조에 자연스럽게 붙습니다

별도의 TTS 콘텐츠를 또 만들 필요가 없습니다.

Story Scene에 narration을 추가합니다.

```json
{
  "scene": "scene-02",

  "duration": 5.2,

  "audio": {
    "narration":
      "그런데 더 놀라운 것은 비용입니다. 사용량이 일곱 배 늘었지만 총비용은 거의 그대로였습니다."
  }
}
```

그러면 ElevenLabs는:

```text
narration
↓
TTS
↓
audio asset
↓
word timestamp
```

를 반환합니다.

그리고 그 timestamp로:

```text
음성
  ↓
단어
  ↓
자막
  ↓
텍스트 reveal
```

을 동기화하면 됩니다.

이전에 이야기했던 `WORD SYNC`가 바로 여기로 들어갑니다.

---

# 6. 그러면 Story Mode가 실제 영상보다 재미있어질 수도 있습니다

웹에서는 실제 mp4가 아니기 때문에 할 수 있는 게 훨씬 많습니다.

예를 들어:

```text
Scene 재생
    ↓
사용자가 화면을 터치

"왜 비용이 줄었지?"
    ↓

Tutors
```

또는:

```text
Scene 04
"Uber는 에이전트 스킬을 3,600개 운영했다."

[자세히 알아보기]
        ↓
본문 해당 섹션
```

혹은:

```text
핵심 개념 등장

[직접 만들어보기]
        ↓
Gen Studio
```

가 가능합니다.

영상은 결국 일방향입니다.

AMU Story는:

> **Playable / Interactive Story**

가 될 수 있습니다.

---

# 7. 그래서 `[영상으로 보기]`라는 이름도 나중에는 바뀔 가능성이 있습니다

MVP에서는 사용자가 이해하기 쉬우므로

**영상으로 보기**

가 좋습니다.

하지만 실제 제품의 본질은 영상이 아닙니다.

향후에는 예를 들어:

```text
읽기
Story
듣기
```

같은 mode selector로 발전할 수도 있습니다.

예:

```text
┌──────────────────────────────┐

          AI 에이전트의
          비용 혁명

      [ 읽기 ] [ Story ]

└──────────────────────────────┘
```

Story를 누르면

```text
9:16
full screen

Scene 1 / 7
─────────────

AI 사용량은
7배 늘었다.

그런데...

비용은
늘지 않았다.
```

로 전환됩니다.

이건 TikTok 복제품이라기보다 **AMU의 새로운 Reading Mode**입니다.

---

# 8. Three.js의 역할도 여기서 훨씬 명확해집니다

Three.js가 Story를 결정하면 안 됩니다.

Storytelling System:

```text
Beat
Scene
Timing
Visual Intent
```

↓

Motion Runtime:

```text
DOM Animation
CSS
Three.js
Audio
```

입니다.

예를 들어 Story Scene이

```json
{
  "visualIntent": "rapid network expansion"
}
```

이라고 하면 Visual Compiler가 적절한 primitive를 선택할 수 있습니다.

```text
rapid network expansion

→ ParticleNetwork
→ CameraPush
→ GlowPulse
```

정도로.

---

# 9. 그러면 우리가 앞에서 얘기했던 `Visual Primitive Library`가 중요해집니다

예:

```text
@ Visual Primitives

ParticleMorph
ParticleNetwork
ImageParallax
ImageDistortion
DepthPush
ObjectExplode
ObjectAssemble
DataStream
OrbitalCamera
FloatingText
Spotlight
BlurReveal
GlowPulse
```

AI가 Three.js 코드를 매번 생성하는 게 아니라

```json
{
  "visual": {
    "primitive": "ParticleNetwork",
    "params": {
      "density": 0.72,
      "spread": 1.4
    }
  }
}
```

처럼 조합합니다.

AI가 매번 셰이더를 발명하는 시스템보다 훨씬 안전합니다.

---

# 10. 그리고 여기서 `Production Grammar`와 그대로 연결됩니다

기존 숏폼/영상 제작 시스템에서 논의했던:

```text
OPEN STATE
ACTION
END STATE
NEXT

PREROLL
REACTION INSERT
FINAL BEAT HOLD

WORD SYNC
CUT CLOSURE

Scene Inventory
Audio Inventory
```

같은 개념을 폐기할 필요가 없습니다.

오히려 Motion Story에서도 사용할 수 있습니다.

예:

```text
Scene

OPEN
↓
배경 이미지 등장

PREROLL 300ms
↓
텍스트 없음

ACTION
↓
Headline reveal

ACTION
↓
Description reveal

FINAL BEAT HOLD 800ms
↓
전체 화면 유지

NEXT
↓
다음 Scene
```

즉 기존 Production Grammar가 **영상뿐 아니라 웹 Story Runtime에서도 사용할 수 있는 문법**이 됩니다.

이게 상당히 좋은 통합입니다.

---

# 11. 다만 Play/Tutors의 Narrative Runtime까지 완전히 같은 것으로 만들면 안 됩니다

여기는 중요한 경계입니다.

앞서 설계했던 Narrative Runtime은:

```text
Universe Bible
↓
Canon Registry
↓
Character Arc
↓
User Story
↓
Story Beat
```

이며 캐릭터와 사용자의 행동에 따라 미래가 달라집니다.

Magazine Article은 그렇지 않습니다.

Magazine:

```text
Fixed Source
↓
Story Beats
↓
Presentation
```

Play/Tutors:

```text
World State
+
Character State
+
User State
+
Canon
↓
Narrative Director
↓
Next Beat
```

입니다.

그러므로 **같은 Runtime으로 강제로 통합하면 안 됩니다.**

대신 하위 primitive를 공유합니다.

---

# 12. 저는 이렇게 계층을 나누겠습니다

```text
                    AMU STORY SYSTEM
                          │
                  ┌───────┴────────┐
                  │                │
          Editorial Story    Narrative Story
                  │                │
             Magazine        Tutors / Play
                  │                │
           Fixed Story       Dynamic Story
                  │                │
                  └───────┬────────┘
                          │
                      Story Beat
                          │
                     Story Scene
                          │
                Presentation Compiler
                          │
        ┌─────────┬───────┼─────────┐
        │         │       │         │
       Web      Audio    Video   Interactive
        │
   Motion Runtime
        │
 ┌──────┼────────┐
 │      │        │
DOM    CSS    Three.js
```

이 구조가 가장 안정적입니다.

---

# 13. 그러면 Gen Studio는 이 시스템의 제작 도구가 됩니다

여기서 Gen Studio의 역할도 아주 자연스럽게 정리됩니다.

예를 들어 Magazine 편집자가 기사에서

> Story 생성

을 누릅니다.

Gen Studio가:

```text
ARTICLE
↓
Story Director
↓
Story Beats
↓
Scene Planner
↓
Visual Planner
↓
Asset Generator
↓
Story Preview
```

를 실행합니다.

편집자는 결과를 보고:

```text
Scene 01 ✓

Scene 02
이미지 변경

Scene 03
문장 삭제

Scene 04
duration 5s → 3s

Scene 05 ✓
```

정도만 수정합니다.

이게 AI 시대에 맞는 편집 workflow입니다.

---

# 14. 이후 Marketing Oops도 동일한 데이터를 사용할 수 있습니다

여기서 시스템의 복리 효과가 생깁니다.

Magazine 기사의 Story Manifest가 존재하면 Marketing Oops는 새로 콘텐츠를 이해할 필요가 없습니다.

```text
Story Manifest
│
├ Hook
├ Insight
├ Evidence
├ Visual
└ Takeaway
```

를 읽고:

```text
Threads
Instagram
LinkedIn
Shorts
Ad Creative
```

로 다시 compile하면 됩니다.

예를 들어:

```text
Magazine Story

        ↓

Marketing Oops

Threads
→ Hook + Insight

Instagram
→ Hook + Visual + Takeaway

LinkedIn
→ Context + Evidence + Insight

Shorts
→ Hook + Surprise + Evidence + Takeaway
```

입니다.

이건 AMU 콘텐츠 시스템 전체에 꽤 큰 변화입니다.

---

# 15. 그리고 더 장기적으로는 ‘영상’도 결과 포맷 중 하나가 됩니다

궁극적으로:

```text
             Story Manifest
                    │
        ┌───────────┼───────────┐
        │           │           │
       Web        Video       Audio
        │           │           │
Three/CSS       Renderer      TTS
```

가 됩니다.

그러면 동일한 Story Scene을:

### 웹

실시간 Three.js + DOM

### Reels

9:16 영상

### YouTube

16:9 영상

### Podcast/Audio

TTS + audio

로 렌더할 수 있습니다.

콘텐츠 제작 과정이 완전히 달라집니다.

---

# 16. 그래서 이번 아이디어에서 제일 중요한 것은 Three.js가 아닙니다

이번 논의를 합치면 오히려 방향이 더 명확해집니다.

AMU가 만들어야 하는 것은

**Three.js Article System**

이 아니라

# `AMU Story Runtime`

이라고 보는 게 맞습니다.

그리고 그 안에서:

```text
Story Layer
────────────────
Story Beat
Narrative
Story Arc
Scene

Presentation Layer
────────────────
Layout
Timeline
Motion
Transition

Visual Layer
────────────────
Image
Three.js
Graphic
Video

Audio Layer
────────────────
TTS
Music
SFX

Interaction Layer
────────────────
Tap
Swipe
Scroll
Choice

Expansion Layer
────────────────
Article
Tutors
Gen Studio
Play
```

가 조립됩니다.

---

# 17. 이 구조가 AMU에 특히 중요한 이유

이걸 제대로 만들면 한 가지 콘텐츠가 더 이상 **WordPress article 하나**로 끝나지 않습니다.

예를 들어 Magazine 기사 하나가:

```text
Article
   │
   ├─ Home Motion Cover
   │
   ├─ Archive Motion Card
   │
   ├─ Cinematic Article Hero
   │
   ├─ Story Mode
   │
   ├─ TTS Story
   │
   ├─ Shorts
   │
   ├─ Instagram
   │
   ├─ Threads
   │
   ├─ Tutors Lesson
   │
   └─ Play Mission
```

으로 확장될 수 있습니다.

하지만 중요한 건 이 열 가지를 각각 AI로 새로 만드는 게 아니라,

```text
                 Article
                    ↓
              Story Manifest
                    ↓
             Presentation
                    ↓
            Channel Compiler
```

로 만드는 것입니다.

그래서 **콘텐츠가 쌓일수록 제작 자산과 Visual Primitive, Story Pattern까지 함께 쌓입니다.**

이것은 AMU가 지향해온 Intelligence Pattern System하고도 결국 연결될 수 있는 구조입니다.

---

## 제가 지금이라면 설계 명칭부터 이렇게 정리하겠습니다

기존 Narrative Runtime을 없애거나 합치는 게 아니라 상위 개념을 둡니다.

```text
AMU Story System
│
├─ Story Core
│    ├ Story Beat
│    ├ Story Scene
│    ├ Story Manifest
│    └ Story Asset
│
├─ Editorial Story Director
│    └ Magazine
│
├─ Narrative Director
│    └ Tutors / Play
│
├─ Presentation Compiler
│    ├ Home Cover
│    ├ Archive Card
│    ├ Article Hero
│    ├ Story Mode
│    └ Shortform
│
├─ Motion Runtime
│    ├ DOM
│    ├ CSS
│    └ Three.js
│
├─ Production Runtime
│    ├ Image
│    ├ TTS
│    └ Video
│
└─ Channel Compiler
     ├ Magazine
     ├ Threads
     ├ Instagram
     ├ LinkedIn
     └ Shorts
```

이 구조라면 **이번 Three.js 아이디어가 일회성 UI 실험이 아니라, 기존 AMU 스토리텔링 전략에서 빠져 있던 ‘표현 런타임’을 채우는 역할**을 하게 됩니다.

그리고 이쪽이 더 큰 기회라고 봅니다. 궁극적으로 AMU Magazine의 기사는 더 이상 `title + content + thumbnail`만 가진 문서가 아니라 **자기 자신을 읽기·재생·듣기·공유·학습·플레이 형태로 변환할 수 있는 Story Object**가 되는 겁니다.

===

좋아. 그럼 '스토리모드로 보기'는 콘텐츠를 생성하면서 코인을 소비하는 구조가 될 수 밖에 없으니 자연스럽게 유료 콘텐츠로 연결이 되는 AMU의 플라이 휠 구조가 될 수 있을 것 같은데, 어떻게 생각해?? 

===

맞습니다. 다만 중요한 수정이 하나 있습니다.

> **‘스토리모드로 보기 = 무조건 사용자 코인 차감’으로 설계하기보다,
> ‘스토리모드가 AMU의 유료 생성 경험으로 자연스럽게 확장되는 구조’로 만드는 편이 더 좋습니다.**

왜냐하면 기사마다 Story Mode를 한 번 미리 생성해 캐시해두면, 이후 재생 자체는 생성 비용이 거의 들지 않을 수 있기 때문입니다. 반대로 **사용자 맞춤 요약·TTS·길이 변경·스타일 변경·개인화 장면 생성**까지 들어가면 실제 AI 비용이 계속 발생합니다.

이 차이를 활용하면 AMU의 플라이휠을 꽤 강하게 만들 수 있습니다.

## 추천하는 구조

```text
Magazine 발견
↓
기사 읽기
↓
무료 Motion Preview
↓
Story Mode 체험
↓
더 깊거나 개인화된 Story 생성
↓
Coin 사용
↓
Gen Studio / Tutors 확장
↓
결과 저장·공유
↓
Magazine 재방문
```

즉 **Magazine이 유료 콘텐츠를 파는 장소가 아니라, AI 생성 가치를 경험시키는 가장 좋은 진입점**이 됩니다.

---

## 1. 기본 Story Mode까지 전부 유료로 막지는 않는 게 좋습니다

예를 들어 기사에

**[스토리모드로 보기]**

버튼이 있다고 합시다.

클릭하자마자

> 30 Coin 필요

가 뜨면 사용자는 아직 가치도 모르는데 결제를 요구받는다고 느낄 수 있습니다.

오히려 이렇게 계층화하는 게 좋습니다.

### 무료

* Motion Cover
* 3~5개 핵심 장면
* 기존 생성 이미지 사용
* 음성 없음
* 표준 Story template

### Coin

* 기사 전체 Story
* AI가 새 visual 생성
* TTS
* 장면별 animation
* 사용자 취향에 따른 스타일
* 더 짧게/더 깊게 재구성

그러면 무료 Story Mode 자체가 **상품 데모** 역할을 합니다.

---

# 2. 특히 `개인화 Story`가 Coin과 가장 잘 맞습니다

예를 들어 기사 하단에서:

```text
스토리로 보기

[ 1분 핵심 ]
[ 자세히 보기 ]
[ 음성으로 듣기 ]
```

정도로 시작합니다.

그리고 좀 더 발전하면:

```text
어떻게 볼까요?

○ 30초 핵심
○ 2분 설명
○ 초보자용
○ 투자자 관점
○ 창업자 관점
○ 사례 중심
```

가 가능합니다.

이 순간 Story Mode는 단순한 영상 플레이어가 아니라 **AI 콘텐츠 생성 기능**이 됩니다.

예:

> 이 글을 창업자 관점에서 90초 Story로 만들어줘.

그러면:

```text
Article
↓
Story Manifest
↓
Perspective Filter
↓
Story Compiler
↓
새 Scene
↓
Visual / TTS
```

가 실행됩니다.

이런 요청은 Coin 과금에 대한 납득도가 훨씬 높습니다.

---

# 3. AMU Coin의 사용 이유도 훨씬 명확해집니다

AI 플랫폼에서 Coin이 자칫하면 그냥

> API 사용료를 대신 받는 화폐

처럼 보일 수 있습니다.

그런데 Story Mode가 붙으면 사용자는 Coin을 이렇게 인식할 가능성이 커집니다.

```text
Coin
=
콘텐츠를
내가 원하는 방식으로
다시 만들어주는 비용
```

이건 훨씬 좋은 가치 제안입니다.

예를 들어:

```text
10 Coin
→ 핵심 Story

20 Coin
→ 음성 Story

40 Coin
→ 고급 Visual Story

60 Coin
→ 개인화 Story
```

같은 상품 구조도 가능합니다.

숫자는 실제 모델 비용과 마진을 계산해 정해야 하지만, **상품 단위 자체는 상당히 자연스럽습니다.**

---

# 4. 여기서 Gen Studio와 연결되는 게 중요합니다

Story Mode를 보고 사용자가:

> 이런 스타일로 내 콘텐츠도 만들고 싶은데?

라고 생각할 수 있습니다.

그때 자연스럽게:

```text
이 Story 스타일로 콘텐츠 만들기
```

→ Gen Studio

로 연결합니다.

예:

```text
Magazine Story
"AI 사용량 7배, 비용은 그대로"

↓ Story Mode

[이 형식으로 만들어보기]

↓ Gen Studio

내 글 / URL / 이미지 입력

↓ Coin

Story 생성
```

이건 굉장히 좋은 Product-led Growth 구조입니다.

AMU가 직접 만든 콘텐츠가 곧 **Gen Studio의 살아있는 샘플**이 되는 셈입니다.

---

# 5. Marketing Oops에도 다시 연결됩니다

사용자가 만든 Story를:

```text
Instagram Reel
YouTube Shorts
Threads
LinkedIn
```

등으로 변환하고 싶을 수 있습니다.

그러면:

```text
Story 생성
↓
게시용 변환
↓
Marketing Oops
↓
성과 분석
↓
다음 Story 개선
```

이 됩니다.

그리고 AMU 내부적으로도 동일합니다.

```text
Magazine Article
↓
Story Mode
↓
Shorts
↓
Social Distribution
↓
새로운 사용자 유입
↓
Magazine
```

이게 진짜 Flywheel입니다.

---

# 6. Tutors와 연결하면 유료화의 폭이 더 넓어집니다

Story 중간에서 사용자가 어떤 부분을 이해하지 못했다고 합시다.

예:

> “Agent Skill 3,600개가 왜 중요한 거지?”

그러면:

```text
[이 부분 설명해줘]
```

→ Tutors

로 넘어갑니다.

Tutors가:

* 쉬운 설명
* 사례
* 질문
* 추가 학습

을 제공합니다.

그리고 다시:

```text
Story로 돌아가기
```

가 됩니다.

따라서:

```text
Magazine
↓
Story
↓
Question
↓
Tutors
↓
Understanding
↓
Magazine Return
```

이라는 AMU 특유의 루프도 살아납니다.

---

# 7. 가장 좋은 Flywheel은 이런 모양입니다

```text
                    Discovery
                        │
                    Magazine
                        │
                     Article
                        │
                Motion / Story Preview
                        │
                       ▼
                 Story Mode
                  FREE / COIN
                        │
            ┌───────────┼────────────┐
            ▼           ▼            ▼
         Tutors      Gen Studio    Share
            │           │            │
        Learn        Create       Social
            │           │            │
            └───────┬───┴────────────┘
                    ▼
                Relationship
              Save / Follow
                    │
                    ▼
                Magazine
```

그리고 외부 growth까지 붙이면:

```text
Story
↓
Shortform
↓
Marketing Oops
↓
Instagram / YouTube / Threads
↓
Discovery
↓
Magazine
```

가 추가됩니다.

---

# 8. 수익 모델도 한 종류가 아니라 여러 층으로 생깁니다

### A. Consumer Coin

개인화 Story 생성

### B. Subscription

월간 Story/TTS 생성 포함

### C. Creator

자신의 글을 Story로 제작

### D. Business

브랜드 콘텐츠 → Interactive Story

### E. Marketing

Story → SNS 광고/콘텐츠 전환

이렇게 보면 Story Mode는 **콘텐츠 유료화 기능 하나**가 아니라 AMU 전체의 monetization bridge가 됩니다.

---

# 9. 다만 기사 자체를 다시 Paywall로 만들지는 않는 게 좋습니다

여기서 가장 중요한 전략적 경계입니다.

추천하지 않는 구조:

```text
기사 읽기
↓
Story Mode
↓
결제 필요
```

만 있는 모델입니다.

그러면 AMU가 다시 콘텐츠 Paywall 서비스처럼 보일 수 있습니다.

제가 추천하는 구조는:

```text
무료 Article
↓
무료 Story Preview
↓
AI 확장 기능
↓
Coin
```

입니다.

즉 **정보가 유료가 아니라 변환·개인화·생성이 유료**입니다.

이게 AMU의 정체성과 훨씬 잘 맞습니다.

---

# 10. 사실 이건 AMU의 Coin 경제에도 매우 좋은 사용처입니다

Coin을 어디에 쓰느냐는 플랫폼에서 굉장히 중요합니다.

좋은 Coin sink는:

> 사용자가 돈을 잃는 느낌보다
> 새로운 결과물을 얻는 느낌이 강해야 합니다.

Story Mode는 여기에 잘 맞습니다.

사용자는

```text
30 Coin 소모
```

보다

```text
이 기사를
90초 Interactive Story로 생성
```

을 인식합니다.

결과물이 눈앞에 남기 때문입니다.

---

## 그래서 제 결론은

네. **Story Mode는 AMU의 Flywheel을 강화할 수 있는 꽤 중요한 유료화 계층**이 될 수 있습니다.

하지만 핵심은:

> **Story를 보는 행위 자체를 유료화하기보다,
> Story를 AI로 생성·변환·개인화하는 행위를 유료화한다.**

입니다.

그래야 구조가

```text
콘텐츠
→ 가치 경험
→ 생성 욕구
→ Coin
→ 결과물
→ 공유
→ 신규 유입
→ 콘텐츠
```

로 돌아갑니다.

특히 좋은 점은 기존처럼 Magazine이 단순히 **Gen Studio로 사람을 보내는 마케팅 채널**이 아니라, **Gen Studio가 왜 필요한지를 사용자가 직접 체험하게 만드는 제품 표면(Product Surface)**이 된다는 점입니다.

이 정도까지 발전시키면 Story Mode는 AMU의 부가기능이 아니라 **Magazine → Gen Studio → Marketing Oops → 다시 Magazine으로 이어지는 경제적 플라이휠의 핵심 연결점**으로 보는 것이 맞습니다.
