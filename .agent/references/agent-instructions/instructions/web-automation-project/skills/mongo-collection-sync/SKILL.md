---
name: mongo-collection-sync
description: Mongo 컬렉션을 source->target으로 동기화하고 dry-run으로 사전 검증한다.
---

# mongo-collection-sync

## 목적
`wp_mng/cicd/mongo-collection-sync.sh`로 컬렉션 단위 동기화를 수행한다.

## 절차
```bash
bash wp_mng/cicd/mongo-collection-sync.sh --db <DB> --collection <COL> --dry-run
bash wp_mng/cicd/mongo-collection-sync.sh --db <DB> --collection <COL> --update-existing
```

## 검증
- source/target URI 동일 여부 방지
- inserted/existing/updated 통계 확인
