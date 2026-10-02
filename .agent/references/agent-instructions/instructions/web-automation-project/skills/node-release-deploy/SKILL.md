---
name: node-release-deploy
description: node-app 릴리즈 업로드, 원자적 교체, 헬스체크/롤백을 수행한다.
---

# node-release-deploy

## 목적
`wp_mng/cicd/node-deploy.sh`로 node-app 배포를 수행한다.

## 절차
```bash
bash wp_mng/cicd/node-deploy.sh
bash wp_mng/cicd/node-deploy.sh --skip-build
bash wp_mng/cicd/node-deploy.sh --install-deps
```

## 검증
- `.next/BUILD_ID` 확인
- `vendor/amu-labs/manifest.json` SHA-256 및 worker import 확인
- node health와 `studio worker started` 로그, restart count 안정성 확인
- 게이트 실패 시 자동 롤백과 worker의 배포 전 실행/중지 상태 보존 확인
