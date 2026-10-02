---
name: content-audit
description: RSS/WP API 결과를 기반으로 콘텐츠 인벤토리/필러-클러스터/바리에이션 시리즈/4주 캘린더를 제작
allowed-tools: Read, Grep, Edit, Bash
---

# Content Audit (Reference-first)

## 입력 데이터(가능한 형태)

- RSS JSON: `python3 ~/Data/Docs/tools/rss_fetcher.py --feed all --count 100 --json`
- WP posts JSON: node-app `GET http://localhost:3000/api/thirdparty/wp/posts`
- WP categories JSON: node-app `GET http://localhost:3000/api/thirdparty/wp/categories`

네트워크 제한으로 수집 불가할 경우, 사용자가 수집한 JSON 파일을 제공받아 분석

## 목표

- “무엇을 쓸지”가 아니라 “무엇을 어떻게 빌드업할지(시리즈/바리에이션)”를 결정
- 매거진 콘텐츠를 중심에 두고, 재방문과 관계 행동(저장·팔로우·구독)에 기여하는 시리즈를 우선 편성한다 — 기준: `.agent/amu-platform-guide/MARKETING-STRATEGY.md` §1·§3

## 작업 순서

1. 인벤토리(표): 제목/URL/카테고리/발행일/요약/Layer/추천 채널/R 등급/목표 행동
2. 필러(3개)로 묶기:

- Pillar A: 창작·콘텐츠 실전(프롬프트·제작 과정·사례) — 기사 맥락에서 Gen Studio 확장이 성립하는 소재
- Pillar B: 자기계발(습관/학습/생산성)
- Pillar C: 비즈니스(마케팅/전략/제품)

3. 각 소스에 대해 바리에이션 3개(빌드업) 초안 생성
4. 4주 캘린더(주 1개 WP 기반 + 주 2~4개 소셜 변형) 제안
5. 네이버 레거시 글은 “리라이팅 후보”로만 제시(사용자 선택 전 리라이팅 금지)

## 출력

- 콘텐츠 인벤토리(표)
- 필러/클러스터(간단 맵)
- 소스별 바리에이션 3개 초안
- 4주 캘린더(채널/목표/CTA 포함)
