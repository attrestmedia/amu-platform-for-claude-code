---
name: wp-naver-rewrite
description: 사용자가 선택한 WP 글을 원문 진단 후 전면 재작성해 같은 URL로 교체하거나, WP·네이버 원문을 다른 채널에 맞게 재가공. WP same-URL replacement와 source-based adaptation을 분리한다.
allowed-tools: Read, Grep, Edit, Bash, WebFetch
---

# WP Replace / Cross-channel Adaptation (Selected-only)

## 핵심 규칙

- 리라이팅은 “사용자가 제시한 URL/제목” 콘텐츠만 수행
- 구서비스 포지셔닝(캐릭터 챗봇, 온라인 직원, D2C 등)을 제거하고, 자연스러운 한국어 기사 또는 소셜 콘텐츠로 재작성
- **WP → WP 같은 URL 리뉴얼**은 `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`의 `wp_to_wp_replace` 모드로 처리한다. 원문·성과 신호·축적 지식·기존 자산을 모두 읽고 원문 진단을 먼저 수행한 뒤 전면 재작성한다. slug·postId·category는 운영 컨트롤러가 교체 등록 시점에 결합한다.
- **WP/네이버 → 네이버·소셜**은 source-based adaptation이다. 원문을 채널 문법으로 압축·재구성하는 모드이며, 같은 URL 교체 리뉴얼에는 이 압축·재구성 기준을 적용하지 않는다.
- **시리즈 형식의 연결 글이라도 글 제목과 본문은 하나의 주제를 가진 하나의 완전한 글로 완성한다.** 이전·다음 편을 읽어야 핵심 질문의 답·근거·적용 기준이 성립하는 결과물은 허용하지 않는다.
- 소셜 콘텐츠의 CTA는 1개만(목표 전환에 맞게)
- **소셜 산출물 어미는 친근한 존대어로 통일**. 소스가 매거진 평어/반말톤이어도 반말 종결을 그대로 옮기지 않고 존대어로 변환(`{{AGENT_ROOT}}/refs/content-policy/social_media_tone.md`의 "어미·존댓말 통일 규칙" 적용)

## 입력

- 네이버 글 URL 또는 제목/내용
- WP 포스트 URL (allmyuniverse.com)
- 작업 목표: WP same-URL replacement | 네이버·소셜 source-based adaptation | 검색 유입 | 브랜딩

## 모드 라우팅 (착수 전 필수)

| 입력과 산출 | 모드 | 원문 처리 |
| --- | --- | --- |
| WP URL → 같은 WP URL 갱신 | `wp_to_wp_replace` | 원문 전체를 읽고 진단한 뒤, 새 근거로 보강한 새 Brief에서 전면 재작성. 부분 수정 갱신은 금지 |
| WP → 네이버/소셜 | `source_based_adaptation` | 원문을 채널 목적에 맞춰 읽고 압축·재구성 가능 |
| 네이버 → 네이버/소셜 | `source_based_adaptation` | 원문을 채널 목적에 맞춰 읽고 압축·재구성 가능 |

- **대상이 여러 건이면 컨트롤러가 착수 전 우선순위를 판정한다** — `gsc_strength=strong` → `gsc_impressions>0` → 나머지 순. 클릭은 표본 부족으로 기준에 쓰지 않는다. 상세: `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`의 "대상 선정 우선순위". 성과 신호와 선정 근거는 재작성 설계의 입력이므로 writer에게도 전달한다.
- WP → WP 모드는 원문 진단(낡은 사실·유효한 근거·놓친 질문·구조 문제·빠진 조건)을 먼저 수행하고, 그 결과를 새 Brief에 반영한다. 진단 없이 착수하지 않는다.
- writer는 `amu-magazine` 검색·browse·read, ledger, `content-insights`, `customer-objections`, 기존 Gen Studio prompt/template/asset, 승인된 Intelligence Pattern을 모두 조회할 수 있다. 축적 지식의 재사용이 리뉴얼의 목적이다.
- 원문 문장·문단을 그대로 옮기지 않고, 원문의 H2 순서를 기본 구조로 삼지 않는다. 구조는 새 `primaryQuestion`에서 다시 도출한다.
- 집필 뒤 **집필자와 분리된 quality reviewer**가 9축·독자 보상·지식 계층과 함께 실질 개선 4항(낡은 사실 정정, 새 메커니즘·조건·한계 추가, 구조 재도출, 원문 문장 잔존 여부)을 판정한다. writer 자기검수로 통과시킬 수 없다.
- 기존 이미지 asset과 prompt/template은 `freshImageBrief`의 역할·권리·최신성·내용 적합성을 충족하면 재활용한다. 재활용 시에도 ALT·캡션·배치 이유는 새 본문 기준으로 다시 작성한다.

## 소스 수집 (`source_based_adaptation` 전용)

WP/네이버 원문을 다른 채널로 바꾸는 경우에만 WebFetch로 다음을 수집한다:

1. **필요 본문 범위**: 채널 재구성에 필요한 제목·섹션·구조
2. **필요 이미지 범위**: 재사용 후보의 URL, ALT 텍스트, 캡션, 본문 내 위치
3. **필요 메타데이터**: 채널 변환에 필요한 author, date, category, tags, 출처 정보

WebFetch 호출 시 필요한 범위의 본문·이미지·메타데이터를 요청한다.

> `wp_to_wp_replace`에서도 원문을 수집한다. 다만 목적이 채널 재구성이 아니라 **진단**이다. 원문의 사실·출처·구조·이미지를 지금 시점에서 검증하고, 무엇이 낡았고 무엇이 살아 있는지 판정한 뒤 새 근거로 보강해 전면 재작성한다.

## 이미지 처리 (모드별)

`source_based_adaptation`에서는 수집된 이미지를 아래 기준으로 분류하고 처리 방침을 결정한다:

| 유형            | 판단 기준                                          | 처리                                       |
| --------------- | -------------------------------------------------- | ------------------------------------------ |
| 튜토리얼/예시   | ALT에 프롬프트/설정값 포함, 본문에서 결과물로 참조 | 원본 재활용 (핵심만 선별)                  |
| 장식/분위기     | 본문과 직접 관련 없는 일반 비주얼                  | 재생성 프롬프트 제안                       |
| 도표/인포그래픽 | 데이터 시각화, 비교표                              | 원본 유지 + 한글화 제안                    |
| 썸네일          | 대표 이미지                                        | 리라이팅 톤에 맞는 새 썸네일 프롬프트 생성 |

원본 이미지 10개 이상 시 → 핵심 3~5개만 선별한다. `wp_to_wp_replace`에서는 새 기사 근거에 맞춰 `freshImageBrief`를 먼저 만들고, 기존 이미지 asset은 아래 조건을 모두 충족할 때만 그 역할에 배정한다.

- AMU가 사용할 권리·소유권이 확인됨
- 오래된 수치·UI·브랜딩·오해를 부르는 텍스트가 없음
- 새 `freshImageBrief`의 역할과 새 본문 사실에 부합함
- 기존 배치를 답습하지 않고 새 본문 기준으로 ALT·캡션·위치를 다시 정함
- 커버(썸네일)는 본문 이미지와 별도로 판정하며, Editorial Cover System 기준을 만족하지 못하면 교체함

### 이미지 계획과 발행 본문 분리

- 이미지 유형·원본 URL·재사용/재생성 판단·사유·생성 프롬프트는 작업 메모나 별도 이미지 brief에 기록한다. 이 정보는 발행용 본문 밖에 둔다.
- 발행용 본문에는 `<!-- IMAGE_GUIDE ... -->` 형식의 주석과 `유형:`·`판단:`·`사유:`·`ALT:`·`프롬프트:` 같은 이미지 작업 메모를 절대 넣지 않는다.
- 이미지 설명은 본문 이미지 문법의 `![설명](URL)`에 한 번만 쓴다. 변환기가 그 값을 `alt`와 `figcaption`으로 출력하므로 같은 이미지 설명을 그림 바깥 본문 문장·별도 문단·`ALT:` 행에 다시 적지 않는다. `figcaption`이 그림 설명으로 한 번 표시되는 것은 정상이다.
- 저장 직전에 발행 본문 전체에서 `IMAGE_GUIDE` 주석·이미지 작업 메모 및 그림 바깥 ALT 설명의 중복을 확인하고 발견하면 제거한다.

## 모드별 산출 규칙

| 항목      | WP 원문            | 네이버 리라이팅         | WP → WP 같은 URL 리뉴얼                    |
| --------- | ------------------ | ----------------------- | ------------------------------------------ |
| 글 길이   | 3,000~5,000자+     | 1,000~2,000자로 압축    | `content_production_workflow.md` “WP → WP 같은 URL 리뉴얼 절차”의 전면 재작성 기준 |
| 구조      | H2/H3/H4 깊은 계층 | H2 중심 3~6개로 평탄화  | 새 `primaryQuestion`에서 다시 도출 (원문 목차 답습 금지) |
| 톤        | 정보 전달, 건조    | 공감 질문 + 정보 공유 (친근한 존대어 통일, 반말 종결 금지) | 평어 에세이 톤 + 9축 품질 근거             |
| 이미지    | 10~20개            | 핵심 3~5개 선별         | `freshImageBrief` 기반 새 계획 + 게이트 통과 기존 asset 재활용 |
| CTA       | 없거나 약함        | 마지막 1개              | 답 이후의 실제 `nextQuestion`으로 닫기     |
| 내부 링크 | 기존 WP 내부 링크  | 네이버 내부 링크로 교체 | 새 기사의 실제 다음 질문에만 링크           |

## 출력

**워드프레스**

- 같은 WP URL 갱신은 `content_production_workflow.md` “WP → WP 같은 URL 리뉴얼 절차”를 적용해 원문 진단과 새 근거 보강을 거친 새 Brief로 전면 재작성한 기사로 교체한다. writer 산출물에는 slug·postId·category를 포함하지 않으며, 통과 후 컨트롤러가 운영값을 결합한다.
- 품질 출력에는 `memorableInsight`, `nextQuestion`, Curiosity / Surprise / Evidence / Participation / Payoff / Utility / Memorability / Continuation / Voice 9축의 구체 근거를 포함한다. 하나라도 비면 등록하지 않는다.
- 시리즈 형식이면 시리즈명·회차·앞뒤 링크를 제거해도 제목과 본문만으로 하나의 주제와 핵심 답이 완결되는지 확인한다.
- 링크·이미지 결합이 원고의 질문·논지·구조를 바꿨다면 quality reviewer 검토부터 다시 수행하고, 그 전에는 같은 URL 교체 등록을 실행하지 않는다.

**소셜 콘텐츠**

- 제목 3개(A/B/C)
- 리라이팅 본문(네이버 포맷: 소제목/H2 중심)
- 태그 후보(10개)
- 같은 소스를 기반으로 링크드인/스레드 축약본 제안
