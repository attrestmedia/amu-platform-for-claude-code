---
paths:
  - "src/app/api/**/*.ts"
  - "src/libs/server-utils/**/*.ts"
---

# Backend / API

- 인증/권한은 서버에서 강제 적용
- 입력 검증(형식/범위/필수값) 후 처리
- 에러 응답 포맷은 기존 프로젝트 패턴 유지
- 외부 API 호출/비용 발생 작업은 사전 체크 + 로깅 필수
- 새로 생성하는 파일은 항상 아래 형식의 `docHint` 추가하고, 기존에 있는 `docHint`가 해당 코드의 로직과 다르면 업데이트

```javascript
/**
 * @docHint
 * @purpose API 라우트(admin / payments / usage) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain payment
 * @scope admin-api
 */
```
