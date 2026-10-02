---
name: wp-sync-deploy
description: 워드프레스 리소스/소스를 원격 서버와 안전하게 동기화한다.
---

# wp-sync-deploy

## 목적
`wp-resource` 또는 전체 `wordpress` 디렉터리를 원격에 동기화한다.

## 절차
```bash
bash wp_mng/cicd/wp-resource-sync.sh --dry-run
bash wp_mng/cicd/wp-resource-sync.sh

bash wp_mng/cicd/wp-sync.sh --dry-run
bash wp_mng/cicd/wp-sync.sh
```

## 검증
- rsync 대상 경로 정확성
- 권한 복구(chown/chmod) 및 서비스 상태 확인
