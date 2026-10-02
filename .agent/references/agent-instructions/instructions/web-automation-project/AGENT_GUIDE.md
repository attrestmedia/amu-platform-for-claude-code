# AMU (All My Universe) - Python Automation Lab Guide

## 프로젝트 목적

1. Python 기반 웹 운영 자동화(게시글 등록/수정, 데이터 가공, 배포 보조)
2. 실험적 유틸리티 스크립트(크롤링, 문서/이미지 변환, 데이터 변환, OCR 등) 축적
3. 운영 환경과 로컬 실험 환경을 함께 다루는 작업 저장소

**가장 핵심적이고 자주 사용되는 폴더는 `wp_mng`**

## 우선순위(작업 기준)

1. `wp_mng` 관련 기능 안정성 유지 (게시/수정/동기화/배포)
2. 공통 모듈(`modules`) 호환성 유지 (`ssh_tunnel.py`, `gen_social_prompt.py`)
3. 실험/유틸(`utils`, `persona`, `img_convert`)은 목적 범위 내 최소 변경
4. 레거시/보관 폴더(`utils/__temp.old`, `utils/video_downloader/phdler/venv`)는 원칙적으로 비수정

## 기본 작업 원칙

- 모든 답변/설명은 한국어로 작성
- 요청 범위를 벗어난 리팩토링/정리 작업 금지
- 코드 변경 시 최소 범위 패치 우선
- 중복 로직은 공통 함수/모듈로 통합
- 보안정보(계정/키/토큰/비밀번호)는 코드 하드코딩 금지, `.env` 사용
- 운영성 스크립트(`wp_mng`) 변경 시 실행 경로/환경변수/롤백 경로를 반드시 함께 점검
- 코드 변경은 **항상 최소 patch(diff)** 문서로만 제시하고, 반드시 해당 **코드가 작동하는 원리/적용 이유/개념**을 상세히 작성 (전체 파일 재출력 금지)
- 단순 질의응답이 아닌, 분석/설계/패치 제안/운영 판단이 포함된 작업 요청은 반드시 **수정/개선 사항에 대한 패치 내용을 보고서 형식의 파일**로 저장
  > **별도의 요청이 있을 때까지 파일에 실제 수정/적용은 절대 금지**하고, **수정/패치 내용을 확인/검토할 수 있도록** 제공하여 요청이 있을 경우에만 파일 수정/적용을 실행
  > 설명/가이드 또는 보고서는 **파일 수정에 대한 예외 규칙**으로, 반드시 `.agent/docs/web-automation-project/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`의 형식으로 한글이 깨지지 않도록 저장하고, `todo-content.json`의 작업 요청 `TASK`가 있을 경우 해당 `TASK`의 `status` 업데이트
  > 수정/패치가 필요한 경우 반드시 **스켈레톤 코드가 아닌 전체 코드가 있는 실제 적용이 가능한 diff 코드** 형태의 패치 가이드로 제공
  > 로그는 `.agent/logs/web-automation-project/{YYYY}/{MM}/{YYYYMMDD}.json`에 남기고, **구조는 같은 폴더의 최신 파일을 그대로 따른다**

## 레포 구조 상세 분석

### 최상위 폴더

| 폴더          | 역할                            | 현재 상태/특징                                                             | 우선도 |
| ------------- | ------------------------------- | -------------------------------------------------------------------------- | ------ |
| `img_convert` | 이미지 확장자 변환/최적화       | Pillow 기반 변환 + `pngquant`(Windows exe 포함) 최적화                     | 중     |
| `modules`     | 공통 모듈                       | SSH 터널 관리(`ssh_tunnel.py`), 소셜 프롬프트 생성(`gen_social_prompt.py`) | 상     |
| `persona`     | 페르소나/게임 데이터 파이프라인 | MongoDB 등록, JSON 변환/검증, 게임 에셋 JSON 생성                          | 중     |
| `plugins`     | 외부 실행 바이너리 보관         | `ffmpeg-3.4.1/ffmpeg.exe` 포함                                             | 하     |
| `utils`       | 실험/유틸 스크립트 집합         | 범용 자동화 스크립트 다수, 레거시/아카이브 포함, 규모 큼                   | 중     |
| `venv`        | Python 가상환경                 | 로컬 실행 환경(관리 대상 아님)                                             | 하     |
| `wp_mng`      | 워드프레스 운영 자동화 핵심     | 포맷 변환, 게시 등록/수정, CI/CD 배포 스크립트                             | 최상   |

## 주의사항(중요)

1. 보안  
   하드코딩된 일부 레거시 스크립트는 신규 작업에서 반드시 `.env`로 교체
2. OS 의존성  
   Windows 전용 API(`os.startfile`, `.exe`, 경로 하드코딩)와 Linux 스크립트가 혼재되어 있어 실행 환경 확인 필수
3. 레거시/보관 영역  
   `utils/__temp.old`, `utils/video_downloader/phdler/venv`는 운영 핵심 경로가 아님. 별도의 요청이 없으면 수정 금지
4. 핵심 경로 보호
   - `wp_mng` 변경 시 실제 게시/배포에 직접 영향이 있으므로 반드시 **수정/패치 가이드**를 우선 제공하고, **입력(JSON/HTML) 백업과 dry-run 검토**를 우선할 것.
   - 실제 파일에 대한 수정/변경 요청이 없으면 절대 변경 금지

## 더 자세한 규칙/스킬

- 자세한 규칙은 `{{AGENT_ROOT}}/rules/`와 `{{AGENT_ROOT}}/skills/`를 따르고, 스킬 호출명은 아래의 각 "스킬명"(`SKILL.md`의 `name` 값)을 기준으로 검색

### 사용 가능한 스킬 목록 (`{{AGENT_ROOT}}/skills/`)

| 스킬명                  | 경로                                                   | 용도                                          |
| ----------------------- | ------------------------------------------------------ | --------------------------------------------- |
| `wp-post-ops`           | `{{AGENT_ROOT}}/skills/wp-post-ops/SKILL.md`           | 워드프레스 포스트 신규/수정 실행 및 사전 점검 |
| `wp-format-converter`   | `{{AGENT_ROOT}}/skills/wp-format-converter/SKILL.md`   | 문서 원본을 HTML/게시 JSON으로 변환           |
| `wp-sync-deploy`        | `{{AGENT_ROOT}}/skills/wp-sync-deploy/SKILL.md`        | `wp-resource`/`wordpress` 원격 동기화         |
| `mongo-collection-sync` | `{{AGENT_ROOT}}/skills/mongo-collection-sync/SKILL.md` | Mongo 컬렉션 dry-run/동기화 실행              |
| `node-release-deploy`   | `{{AGENT_ROOT}}/skills/node-release-deploy/SKILL.md`   | node-app 릴리즈 배포 및 헬스체크/롤백         |
| `persona-game-register` | `{{AGENT_ROOT}}/skills/persona-game-register/SKILL.md` | persona/game JSON Mongo upsert 등록           |
| `image-optimize`        | `{{AGENT_ROOT}}/skills/image-optimize/SKILL.md`        | 이미지 확장자 변환 및 최적화                  |
