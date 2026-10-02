# Monorepo / Env / Ops

- 패키지 매니저는 pnpm 우선 사용
- 환경변수는 client/server로 구분하고, NEXT_PUBLIC 노출은 신중히 고려할 것
- Docker/배포 관련 변경은 위험 작업으로 간주하여 신중하게 결정할 것(되돌리기 전략 포함)

## Node → WordPress 내부 API (2026-08-09 계약)

운영 `node-app` 컨테이너가 WordPress REST를 호출할 때는 **공개 Cloudflare 경로가 아니라
같은 Docker network의 `wordpress:80`을 쓴다.** Bot/WAF 정책 변경으로 서버 간 호출이 차단되는
재발을 막기 위한 계약이다.

```dotenv
WP_AUTH_URL=http://wordpress:80/wp-json/simple-jwt-login/v1/auth
WP_API_URL=http://wordpress:80/wp-json/wp/v2
WP_ME_URL=http://wordpress:80/wp-json/simple-jwt-login/v1/auth/validate
WP_PROMO_CACHE_PURGE_URL=http://wordpress:80/wp-json/amu24/v1/promo-cache/purge
```

- 위 값은 **production Docker 환경 전용**이다. 값의 단일 출처는 `amu_app/secrets/node-app.env`다
- Docker 밖의 로컬 개발에서는 `https://allmyuniverse.com/wp-json/...`로 덮어쓴다.
  **`.env.sample`이 공개 HTTPS URL을 보여주는 것은 로컬 기준이며, 운영 값을 그쪽으로 맞추지 않는다**
- 코드에 공개 URL 폴백을 만들지 않는다. 현재 `src/consts/env/runtime.ts`는 `requiredEnv()`로 강제한다.
  폴백을 넣으면 env 누락이 조용히 공개 경로 호출로 떨어져 계약이 무력화된다
- 내부 호출은 nginx를 거치지 않으므로 WordPress canonical URL과 HTTPS redirect가 발생하지 않는지 확인한다
- 배포 검증은 **인증 · 사용자 확인 · 게시물 조회 · 프로모션 캐시 purge 네 경로를 각각** 수행한다
- rollback은 네 값을 기존 공개 HTTPS URL로 되돌리는 것이지만,
  **먼저 Cloudflare에서 서버 호출이 허용되는지 확인**한다. 확인 없이 되돌리면 같은 차단으로 되돌아간다

## 빌드 시점 환경변수 (2026-08-31 신설)

`next.config.mjs`가 읽는 값은 **`next build` 시점에 정적 헤더·이미지 `remotePatterns`에 구워진다.**
`docker-compose`의 `env_file`은 런타임 전용이라 이미 구워진 값을 되돌리지 못한다.

**새 환경변수를 추가할 때 먼저 판정한다 — 이 값을 `next.config.mjs`가 읽는가?**

| 읽는다 | 읽지 않는다 |
| --- | --- |
| 빌드 시점에 주입해야 한다 | 런타임 `env_file`만으로 충분하다 |

빌드 시점 값은 **배포 스크립트의 화이트리스트에 등록한다** —
`web-automation-project/wp_mng/cicd/node-deploy.sh`의 `BUILD_TIME_ENV_KEYS`.

- 값의 단일 출처는 `amu_app/secrets/node-app.env`다. `.env.production`에 같은 값을 복사하지 않는다.
  두 곳에 두면 한쪽만 바뀌었을 때 빌드 산출물이 조용히 낡는다.
- 시크릿 파일 전체를 빌드 셸에 소싱하지 않는다. **비시크릿 설정값만 키 단위로 export한다.**
  `next.config.mjs`는 env를 로그로 출력하고, 미들웨어(Edge 런타임)는 `process.env`를 빌드 시점에
  인라인하므로 스코프에 있는 시크릿이 배포 산출물에 남을 경로가 실재한다.
- 화이트리스트에 없는 키는 `미설정(건너뜀)`으로 로그를 남기고 빌드를 막지 않는다. fail-open이 아니라
  **해당 기능이 fail-closed 기본값으로 떨어지는 것**이 의도다.

> 실측 사고(2026-08-31): `MAGAZINE_EMBED_ALLOWED_PARENT_ORIGINS`를 `secrets/node-app.env`에 올바르게
> 설정하고 재배포했는데도 운영 embed CSP가 `frame-ancestors 'none'`으로 남았다. 빌드가 시크릿 파일을
> 소싱하지 않아 `next.config.mjs`가 값을 못 본 채 `.next/routes-manifest.json`에 `'none'`을 구웠기 때문이다.
> 설정은 맞았는데 배포 경로가 값을 전달하지 않은 사례다.
