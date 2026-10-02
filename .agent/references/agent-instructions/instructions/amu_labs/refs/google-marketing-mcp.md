<!-- 정본: /home/attrest-samsung-linux/Project/.agent/agent-instructions/instructions/amu_labs/refs/google-marketing-mcp.md — 변경은 이 문서를 먼저 수정한다. -->

# @amu_labs/mcp-google-marketing

Google Search Console 조회와 Google Ads Keyword Planner를 운영 Universe 자격증명으로 호출하는 MCP 서버

---

## 동작 구조

```text
Claude/Codex
  -> google-marketing MCP
    -> node-app /api/ai/agent/marketing
      -> Universe secure credential (google_ads)
        -> Google Search Console API
        -> Google Ads API
```

MCP 프로세스는 Google OAuth client secret, refresh token, Ads developer token을 직접 보관하지 않는다. Google 자격증명의 저장·갱신·권한 검사는 운영 애플리케이션의 기존 credential 계층이 담당한다.

---

## 환경 변수

- `AGENT_BASE_URL`
  - 마케팅 에이전트 API가 배포된 node-app URL
  - 기본값: `https://app.allmyuniverse.com`
- `AGENT_API_KEY`
  - node-app 에이전트 API 인증 키
- `GOOGLE_MARKETING_DEFAULT_UNIVERSE_ID`
  - 도구 입력에 `universeId`가 없을 때 사용할 기본 Universe

Google provider 자격증명용 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_ADS_*` 환경변수는 폐기되었다.

---

## 운영 자격증명 요구사항

대상 Universe의 `google_ads` credential이 다음 OAuth scope와 Ads 정보를 포함해야 한다.

- Search Console 읽기: `https://www.googleapis.com/auth/webmasters.readonly`
- Google Ads 읽기: `https://www.googleapis.com/auth/adwords`
- Google Ads developer token, customer ID, 선택적 login customer ID

Search Console scope가 없는 기존 refresh token은 Google 재동의 후 운영 credential을 갱신해야 한다.

---

## 제공 도구

- `search_console_sites`
  - 운영 credential 계정이 접근 가능한 Search Console 속성 목록 조회
- `search_console_query`
  - Search Analytics 데이터 조회
  - dimensions, rowLimit, query/page/country/device 필터 지원
- `google_ads_keyword_ideas`
  - Google Ads Keyword Planner `generateKeywordIdeas` 조회
  - keyword seed, URL seed, language, geo target, page size 지원

모든 도구는 선택적으로 `universeId`를 받고, 생략하면 `GOOGLE_MARKETING_DEFAULT_UNIVERSE_ID`를 사용한다. Google Ads customer ID는 MCP 입력으로 받지 않고 해당 Universe의 운영 credential에서만 결정한다.

---

## 패키지 점검

```bash
pnpm --filter @amu_labs/mcp-shared build
pnpm --filter @amu_labs/mcp-google-marketing typecheck
pnpm --filter @amu_labs/mcp-google-marketing build
node /home/attrest-samsung-linux/Project/amu_labs/apps/mcp/google-marketing/dist/index.js
```

---

## MCP 클라이언트 설정 예시

```json
{
  "mcpServers": {
    "google-marketing": {
      "command": "node",
      "args": ["/home/attrest-samsung-linux/Project/amu_labs/apps/mcp/google-marketing/dist/index.js"],
      "env": {
        "AGENT_BASE_URL": "https://app.allmyuniverse.com",
        "AGENT_API_KEY": "your-agent-api-key",
        "GOOGLE_MARKETING_DEFAULT_UNIVERSE_ID": "your-universe-id"
      }
    }
  }
}
```

---

## 운영 메모

- MCP가 보관하는 키는 에이전트 API 인증 키뿐이며, provider secret은 node-app 밖으로 전달되지 않는다.
- `ads_read` 권한이 없는 에이전트 키는 Google Ads 및 Search Console 조회가 거부된다.
- Search Console은 운영 OAuth 계정에 scope 또는 속성 접근 권한이 없으면 Google API의 401/403 오류를 반환한다.
- Google Ads는 운영 credential의 developer token, OAuth 계정 권한, 고객 계정 접근 권한을 모두 사용한다.
