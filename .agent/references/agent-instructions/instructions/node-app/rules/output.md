# Output & Collaboration Rules

- 분석·설계·검토·판단 요청에는 파일을 고치지 말고 보고서로 답한다. 적용 요청에는 바로 적용한다.
  > 보고서 경로 `.agent/docs/node-app/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`
  > 로그 경로 `.agent/logs/node-app/{YYYY}/{MM}/{YYYYMMDD}.json` — 구조는 같은 폴더의 최신 파일을 따른다
- 코드 제안은 최소 patch(diff)로 제시하고, 동작 원리와 적용 이유를 함께 쓴다. 전체 파일 재출력은 하지 않는다.
  > 스켈레톤이 아닌 그대로 적용 가능한 diff로 제공
- 변경 파일 수는 최소화
- 불확실하면 “추정”으로 표시하고, 확인을 위해 어떤 파일을 봐야 하는지 제시할 것
- `/safe-refactor` SKILL 사용
- 코드 설계는 항상 FSD(Feature-Sliced Design)를 기반으로 현재의 플랫폼에 맞춰 작성하고, UI 설계는 항상 단순화한 Atomic Design 설계(ui, 모듈, 템플릿)를 적용하여 구현할 것
    > 작업 수행시 대상 화면의 기존 코드가 너무 길거나 크면 더 작은 컴포넌트로 분리
    > 각 단위에 어울리는 컴포넌트를 해당 폴더에 추가(전체 공통 가능성이 있으면 `src/components/ui` 또는 `src/components/module`, 특정 서비스 또는 페이지에서만 사용시 `src/components/template` 또는 각 페이지 단위(`src/app/(public)`)로 분류)
- lint는 아래의 기준으로 수정하되, 수정 또는 생성된 파일에서 lint 경고 또는 오류 발생 시 해당 파일에 대한 수정/패치를 즉시 진행하고, lint 경고에 대한 수정/패치를 진행하는 경우에는 항상 `src/utils/common/typeUtils.ts`을 참고하여 공통 함수를 활용할 것
    > lint: 기본은 수정된 파일들에 대해서만 lint를 실행. 단, `ESLint 설정, tsconfig, package, 공통 import 경로, 대규모 리팩토링`의 경우에는 반드시 전체 `pnpm run lint`를 실행하여 코드의 안정성과 정확성 체크.
    > typecheck: 항상 `pnpm run typecheck`로 전체 실행
    > build/CI: 반드시 전체 `pnpm run lint` + `pnpm run typecheck`를 실행하여 안정성과 정확성 체크.
    > 빌드 후 운영 배포가 필요한 경우 `/home/attrest-samsung-linux/Project/web-automation-project/wp_mng/cicd/CICD_README.md` 가이드를 참고하여 안전하게 배포 진행.