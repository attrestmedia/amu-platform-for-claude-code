# Roadmap & Decisions Ledger (로드맵/확정 결정 원장)

> **용도**: 세션마다 같은 전략 판단을 재도출/재논쟁하지 않기 위한 살아있는 원장.
> 신규 전략/방향성 판단 전에 이 문서를 먼저 읽는다. 결정을 뒤집으려면 "재검토 조건"이 충족됐는지 먼저 확인한다.
> **갱신 규칙**: 새 결정이 확정되면 표에 행을 추가하고, 뒤집힌 결정은 삭제하지 말고 상태를 `superseded`로 바꾼다.

- 최종 갱신: 2026-09-13
- 근거 보고서: `~/Project/.agent/docs/project/2026/07/20260707_130900__*.md` ~ `20260707_173243__*.md` (보안/Play/마케팅 3주제 × 2모델), `20260706_170235__socket-communication-readiness-review.md`, `2026/08/20260806_114135__magazine-centric-business-pivot-review-and-work-breakdown.md`, `2026/08/20260813_172000__social-channel-cowork-comment-copilot-roadmap.md`, `2026/09/20260912_224000__elevenlabs-only-speech-cutover-redesign.md`

## 확정된 결정 (ADR)

| # | 결정 | 근거 요약 | 날짜 | 상태 | 재검토 조건 |
| --- | --- | --- | --- | --- | --- |
| 1 | 단일 전환축은 **Gen Studio** — 콘텐츠/광고/전환 설계는 Gen Studio 전환을 1차 목표로 정렬 | 마케팅 전략 보고서 공통 결론 | 2026-07-07 | **superseded** (2026-08-06, #16이 대체) | — |
| 2 | 마케팅 운영과 스토어는 **분리하지 않음** (현행 통합 운영 유지) | 보안/로드맵 보고서 | 2026-07-07 | 유효 | 운영 부하/조직 변경 발생 시 |
| 3 | 실시간/소켓(`amu-realtime`)은 **보류** — S0(HTTP 계약 안정화) 완료 전 S1 착수 금지 | 소켓 준비도 검토(2026-07-06) | 2026-07-06 | 유효 | S0 완료 + 실시간 필요 기능 확정 시 |
| 4 | AMU 자체 암호화폐/토큰은 **보류** — 법률 자문 전 착수 금지 | 가상자산이용자보호법 리스크 | 2026-07-07 | 유효 | 법률 자문 완료 시 |
| 5 | 로그라이크 death-model **완화안**(죽지만 유산은 박물관 보존 + 동면 기본, 완전 사망은 하드코어 opt-in) | Play 컨셉 보고서 2종 공통 권고 | 2026-07-07 | **제안** (사용자 최종 확정 대기 — 확정 전 mission.md/platform-profile.md 수정 금지) | 사용자 확정 시 → mission.md·platform-profile §2.3 reconcile |
| 6 | OpenAI `dall-e-2`는 선택/과금/카탈로그 정책에 **재추가 금지**, 레거시 DB 문서는 soft delete 대상 | ai-model-catalog-sync 규칙 | 2026-06 | 유효 | — |
| 7 | 토큰 과금 이미지 모델(현행 `gpt-image-2.5-flare`·`gpt-image-2.5-sunburst`)은 **hybrid 과금**(최소 고정 코인 + 초과분 추가) 유지 | ai-model-catalog-sync 규칙 | 2026-06 (2026-09-09 대상 모델 갱신) | 유효 | — |
| 8 | GPT-5.6 계열의 플랫폼 전환을 API 예산 복구 전까지 보류 | 최초 실호출의 `insufficient_quota` 진단 | 2026-07-14 | superseded | API 예산 추가 및 재검증 완료로 #9가 대체 |
| 9 | OpenAI 텍스트 정책을 GPT-5.6 계열로 활성화: Terra 기본, Sol 추천, Luna 경제형, GPT-5.5 이전 frontier. Chat Completions에서는 비기본 `temperature`를 전송하지 않음 | 예산 추가 후 Luna·Terra·Sol 실호출 3/3 성공, 공식 단가-내부 코인 원가 용량 정합, 프로덕션 배포·헬스체크 완료 | 2026-07-14 | 유효 | provider deprecation·가격/파라미터 변경 또는 실호출 회귀 시 |
| 10 | Gen Studio 에이전트 자동화는 **template/reference/group 원장 우선**으로 실행: 템플릿 정책 조회 → 필요 시 라이선스 확인 이미지 검색 → 비용 고지 생성, 그룹은 read → 승인된 write → read. 직접 DB 쓰기 금지, 운영 그룹 쓰기는 정확한 confirmation 필수 | 참고 이미지·검색·그룹 Agent API/MCP 구현 및 local 계약 검증 보고서 | 2026-07-16 | 유효 | Agent route/MCP target·권한·비용 계약이 변경될 때 |
| 11 | 운영 생성 증거는 **범용 DB 접근이 아니라 exact asset ID 기반 read-only MCP**로 제공: node-app Agent API가 자산·잡·과금 원장을 상관 검증하고 민감 필드를 제거하며, scoped key·production target 명시·rate-limit fail-closed를 강제 | P0-5 증거 bundle 보강과 P2 운영 검증을 위한 사용자 승인 및 최소권한 설계 보고서 | 2026-07-17 | superseded | 인증 env 계약은 #12가 대체, 나머지 read-only/target/fail-closed 원칙은 유지 |
| 12 | 운영 생성 증거 인증은 기존 단일 `AGENT_API_KEY + AGENT_UID`를 재사용하고 같은 key를 `AGENT_API_KEYS_JSON`에 중복 선언하지 않음. 다중 key 전환 시에만 legacy pair를 scoped JSON key로 대체하며 `genstudio:evidence:read`를 명시 | 운영 env에 이미 존재하는 단일 key/UID 계약을 유지해 secret 중복과 설정 드리프트를 방지하자는 사용자 확정 | 2026-07-17 | 유효 | 다중 agent key 운영 또는 key별 권한 분리 필요가 발생할 때 |
| 13 | 마케팅 OAuth 플랫폼 앱 자격증명은 **통합 관리자 전용 글로벌 secrets DB/UI**에서 provider별 단일 관리하고, 유니버스별 User ID/Access Token과 분리함. OAuth/lifecycle resolver는 DB 우선, env는 무중단 fallback으로만 사용 | callback은 universe/session 없이 App Secret을 해석해야 하고 글로벌 secret을 유니버스별로 복제하면 의미 충돌·회전 드리프트가 생기므로 사용자가 UI 단일 관리 구조를 확정 | 2026-07-23 | 유효 | 외부 secret manager 도입 또는 플랫폼 앱의 universe별 분리가 필요해질 때 |
| 14 | 플랫폼 주요 서비스를 **Play·Gen Studio·Tutors·Marketing Oops·Store의 5개**로 정의하고, Marketing Oops는 공개 랜딩(`/marketing-oops`)과 권한형 워크스페이스(`/marketing-oops/workspace`)를 분리한다. Store Manager는 `/store/[universeId]/manage`를 정식 경로로 사용한다 | 공개 서비스 브랜딩과 권한형 운영 화면을 분리하면서 서비스별 관리 문맥은 해당 서비스 URL 아래에 유지하기 위한 사용자 확정 | 2026-08-02 | 유효 | 서비스 포트폴리오 또는 운영 권한 모델 변경 시 |
| 15 | WordPress 고정 서비스 히어로는 Marketing Oops `home_hero` 슬롯을 원장으로 사용하고, 모든 신규 업로드 미디어는 **R2 저장 → HEAD 무결성 검증 → DB 자산 기록**을 통과해야 한다 | 프로모션 소재의 이중 원장과 컨테이너 로컬 저장 재발을 막기 위한 사용자 확정 | 2026-08-02 | 유효 | 미디어 저장소/배포 아키텍처 변경 시 |
| 16 | **AMU의 본업을 `AMU Magazine 중심 인터랙티브 미디어 생태계`로 재정의**한다. Magazine이 핵심 서비스이고 Gen Studio·Tutors·Play는 기사 맥락의 확장 계층, Marketing Oops·Store는 운영·상업화 계층이다. 마케팅 최상위 지표를 `Gen Studio 첫 생성`에서 **월간 활성 관계 독자 수(임시: 28일 재방문 사용자 수)**로 교체하고, 우선순위 등급을 P0~P4(Gen Studio 근접도)에서 **R0~R4(관계 기여도)**로 대체한다. **모든 기사에 Gen Studio CTA를 붙이는 운영을 중단**한다 | GA4 2026-08-06 실측: 매거진 28일 사용자 24,757명 중 `first_visit` 24,732명(99.90%), 1인당 세션 1.007회로 재방문이 사실상 0. 앱 28일 사용자 24명. 병목이 "매거진→앱 전환"만이 아니라 **미디어 자체가 관계를 만들지 못하는 것**임이 확인됨. ADR #1의 재검토 조건("신규 수익축이 실측 전환으로 검증될 때")이 아니라 **기존 축이 실측으로 반증된 경우**이므로 조건 미충족을 이유로 유지하지 않고 supersede | 2026-08-06 | 유효 | 재방문·관계 행동 지표가 4주 이상 개선되지 않고 다른 축이 실측으로 검증될 때 |
| 17 | **매거진↔앱 세션 연속성은 토큰 교환형 SSO**로 구현한다. 쿠키 보안 등급을 낮추지 않고 이미 검증된 HMAC 서명 브리지 패턴을 재사용하며, 티켓은 1회용·TTL 60초 이내·대상 도메인 바인딩·`returnTo` allowlist를 강제한다. **매거진 소셜 가입(Google·Kakao·Naver)은 앱의 기존 NextAuth 경로에 위임**하고 완료 후 티켓으로 매거진 세션을 수립해 원래 기사로 복귀시킨다 | NextAuth 세션 쿠키가 `__Host-na.session`이라 사양상 서브도메인 공유가 불가능하고, 접두사를 떼면 CSRF·세션 고정 방어 등급이 내려간다. 매거진에 OAuth 클라이언트를 새로 등록하면 검증된 `accountLinker` 경로가 이중화된다. 2026-08-06 사용자 결정 | 2026-08-06 | 유효 | 인증 아키텍처 또는 도메인 구조가 변경될 때 |
| 18 | **페이월·유료 멤버십·프리미엄 콘텐츠를 설계하지 않는다.** NYT 벤치마킹은 ① 여러 제품이 서로 다른 "매일 올 이유"를 만들고 하나의 계정으로 묶이는 구조 ② 편집 신뢰 우선 ③ 외부 검색 의존 탈피 ④ **기사 맥락에서 질문·생성·플레이가 이어지는 연결의 자연스러움**까지만 채택한다. 수익은 독자 기반(광고·제휴·디지털 상품) + 종량 코인 + B2B 세 축으로 만든다 | NYT의 All Access는 각 제품이 독립적으로 사람을 모으고 브랜드 신뢰가 확보된 뒤에 나온 결과다. AMU는 28일 재방문 독자가 사실상 0인 단계이며 이 상태의 페이월은 유일한 자산인 유입을 죽인다. 멤버십을 설계해도 검증할 표본이 없다. 2026-08-06 사용자 결정 | 2026-08-06 | 유효 | 반복 방문 독자 기반이 확보되고 구독 의향이 실측으로 확인될 때 |
| 19 | **소셜 채널 발행 cap의 단일 출처는 Marketing Oops `settings.marketingCriteria.uploadPolicy`**다. 정책 문서·에이전트 룰에는 cap 수치를 적지 않고, 소셜 콘텐츠 생성 사이클마다 `list_keyword_profiles`로 조회한다. 조회 실패 시 추정하지 않고 `blocked`로 중단한다(fail-closed) | 문서에 적힌 cap과 Marketing Oops 실제 설정이 어긋나는 사고가 반복됐다. 2026-08-06 실측에서 문서값 threads 2/2/14 대비 `uploadPolicy` v9의 실제값이 4/2/24로 확인됨. 두 원장이 존재하는 한 드리프트는 재발한다. 2026-08-06 사용자 지시 | 2026-08-06 | 유효 | Marketing Oops가 cap 관리 기능을 제공하지 않게 될 때 |
| 20 | **소셜 댓글 Cowork는 네이버 블로그·Threads만 지원**하고, 제품 목표를 `마케팅 목표 설정 → 후보 계정 선별 → 해당 계정의 공개 콘텐츠 취득 → 원문 근거형 댓글 샘플`로 고정한다. 네이버 댓글은 사람이 원문 확인 후 직접 등록한다. Threads는 공식 API와 별도 `engagementActionPolicy`·감사 게이트를 통과한 `outbound_reply`·`inbound_reply`만 제한 실행할 수 있다. 공개 HTML 읽기·본문 정제는 허용하되 로그인·접근 제어·robots/약관을 우회하지 않는다. 후보 수집에는 게시물 발행용 `uploadPolicy`를 적용하지 않는다 | 기존 원장은 댓글 등록과 4채널 확장을 중심으로 설계돼 실제 목표인 대상군 선별·콘텐츠 기반 초안과 어긋났다. LinkedIn·Instagram은 타인 콘텐츠 발견·본문 취득의 공식 경로가 제품 목표를 충족하지 못해 범위에서 제외한다. 후보 수집량과 AMU 게시물 발행 cap은 서로 다른 계약이다. 2026-08-13 사용자 결정 | 2026-08-13 | 유효 | 지원 채널 확대를 사용자가 다시 승인하거나 플랫폼 공식 API·약관·robots 정책이 바뀔 때 |
| 21 | **AMU의 신규 TTS/STT 런타임은 ElevenLabs 단일 provider로 전환**하고 OpenAI speech API 호출·기본값·fallback·사용자 선택 경로를 제거한다. OpenAI 텍스트 LLM은 유지한다. 기존 OpenAI 생성 음원·VoiceProfile provenance·과금 이력은 읽기 호환하되 신규 라우팅에 사용하지 않는다. ElevenLabs 장애 시 OpenAI로 되돌리지 않고 speech-off·text-only 또는 검증된 기존 asset 재생으로 수렴한다 | 2026-09-12 사용자 결정. Tutors 사용자의 실제 음성 분석 목적과 ElevenLabs 음성 데이터 제한을 재검토하여 #22가 Tutors STT·분석 범위를 대체했다. TTS와 기타 승인된 ElevenLabs 제작 음성의 판단 근거는 남는다 | 2026-09-12 | **superseded** (Tutors STT·분석 범위, 2026-09-13 #22) | — |
| 22 | **Tutors STT·교육용 원음 분석은 OpenAI, Assistant TTS는 ElevenLabs**로 역할을 분리한다. OpenAI 경로에 ElevenLabs Grant의 `verified_adult`를 요구하지 않되, 미성년 보호·목적별 동의·정책 게시·예산·품질·삭제·실사용 E2E를 각 gate로 판정한다. 전사는 발화 내용 확인이며 발음·발성의 객관적 점수로 간주하지 않는다. 기존 OpenAI 음원·과금·VoiceProfile 이력은 보존한다 | 사용자가 Tutors 음성 기능의 핵심 목적을 실제 음성에 대한 교육적 피드백으로 재확정했다. OpenAI 공식 미성년 가이드는 18세 미만 대상 추가 보호와 디지털 동의 연령 미만 개인정보의 ZDR 선행을 요구한다. STT만으로 발음 분석을 대신할 수 없으며 ElevenLabs TTS 사용 범위와 연령 조건은 별개다. 2026-09-13 사용자 결정 | 2026-09-13 | 유효 | 음성 provider 계약·품질·규제 조건이 바뀌거나 Tutors 학습 효과가 실측으로 반증될 때 |
| 23 | **로드맵의 미성년 규제 게이트는 전부 `pass`로 판정**하고, 실제 연령·본인 확인(연령대 자율 신고·step-up 인증·법정대리인 동의)은 구현 트리거가 생길 때 구현한다. 음성 동의·TTL·삭제, 수집 항목 고지, 프로바이더 계약상 연령 조건은 미성년 게이트가 아니므로 유지한다. #22의 미성년 보호 gate는 이 결정으로 대체된다 | 미성년 게이트가 주요 기능 로드맵을 반복적으로 지연시켰다. AMU는 전 연령에 안전한 콘텐츠를 지향하며, 참조 설계는 만 14세 이상 서비스 + 연령대 자율 신고(AMU Age Policy v1). 만 14세 미만 개인정보 처리 의무에 대한 잔여 리스크는 사용자가 수용했다. 근거 `.agent/references/AMU_APP/in_progress/Minors_Regulation_Scandal.md`, 2026-09-23 사용자 결정 | 2026-09-23 | 유효 | `compliance-guardrails.md` §3-1의 구현 트리거(유해매체물·성인 기능, 만 14세 미만 대상·인지, 프로바이더 연령 요건, 해외 서비스, 규제 지적·사고) 발생 시 해당 기능에 한해 |

## 우선순위 스냅샷 (2026-08-06 갱신 — ADR #16 반영)

**사업 방향 전환에 따른 P0 (2026-08-06)**

1. **트래픽 실체 검증** — 매거진 `first_visit` 99.9%가 실제 이탈인지 봇인지 계측 아티팩트인지 구분. 비용 0, 즉시 착수. 이 값이 확정되기 전에는 매거진 IA·리뉴얼 착수 금지
2. **관계 행동 계측 스펙 구현** — 저장·팔로우·이어읽기·구독 이벤트가 현재 0종. 계측 없이 새 지표를 판정할 수 없다 (`.agent/amu-platform-guide/MEASUREMENT-PLAN.md` §3.1)
3. **회원 가치 MVP + AMU ID 세션 연속성** — 둘은 **병행 필수**. 로그인만 통합하면 가입자는 계속 0이고, 가치만 만들면 앱과 끊긴다 (`AUDIENCE-AND-MEMBERSHIP.md` §10)
4. **개인정보처리방침·이용약관 개정** — 3번과 같은 작업 단위 (`rules/compliance-guardrails.md` §4-1)

**계속 유효한 기존 P0~P2**

- **P0 (착수 전 계약 고정)**: 비용 발생 엔드포인트 fail-closed 전환(R1), cost-preflight 강제, agent 키 스코프/로테이션(R4) — 계약 상세: node-app `rules/server-economy-security.md`
- **P1~P2 (규제 게이트 선행)**: Play 이원 경제/거래(에스크로), 음성 원음 정책(R7) — 미성년 게이트는 결정 #23에 따라 `pass` — 게이트: `{{AGENT_ROOT}}/rules/compliance-guardrails.md`
- **마케팅 Week 0**: 전환 추적 없이 광고 집행 금지 — 규약: `.agent/amu-platform-guide/MEASUREMENT-PLAN.md`

**동결·승격 재판정**: `.agent/amu-platform-guide/SERVICE-ROLE-MAP.md` §5 (뉴스레터·Tutors "기사에 질문하기" 승격, Play 로드맵 재작성 필요, 나머지 동결 유지)

- 세부 로드맵 항목·순서는 `.agent/todo-amu-integrated-reorganization.json`(구조 개편·구현 실행 정본)과 근거 보고서 원문을 따른다. 폐기 실행 문서의 인벤토리는 `.agent/todo-ledgers/README.md`에서만 확인한다.
