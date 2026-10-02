---
name: api-route
description: AMU 안전 패턴(인증/유효성검사/server-utils)을 적용한 Next.js 라우트 핸들러 구현
allowed-tools: Read, Grep, Edit
---

# AMU API 라우트 워크플로우

- 새 코드를 작성하기 전에 `libs/server-utils`의 **기존 미들웨어/유틸 패턴을 먼저 확인**
- 인증/인가는 반드시 **서버 측에서 강제**
- 부수 효과(DB 쓰기 등) 전에 **입력값을 반드시 검증**
- 에러 응답 형식은 프로젝트의 **기존 포맷과 일관성을 유지**
- 변경 사항은 **최소 패치 형태**로 반환
- 새 코드 작성 시 아래 형식의 `docHint` 추가, 기존에 있는 `docHint`가 해당 코드의 로직과 다르면 업데이트

```javascript
/**
 * @docHint
 * @purpose API 라우트(admin / payments / usage) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain payment
 * @scope admin-api
 */
```
