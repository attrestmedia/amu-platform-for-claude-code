---
name: wp-post-ops
description: wp_mng 포스트 신규/수정 스크립트를 안전하게 실행하고 검증한다.
---

# wp-post-ops

## 목적
`wp_mng/cicd/wp-post.sh`를 통해 신규 등록/수정 작업을 수행한다.

## 절차
1. `.env`의 DB/SSH 키 존재 여부 확인
2. 입력 JSON(`wp_mng/format_converter/json/new_post_datas.json`) 검토
3. 명령 실행

```bash
bash wp_mng/cicd/wp-post.sh new auto
bash wp_mng/cicd/wp-post.sh update auto
```

## 검증
- 실행 로그의 `target`, `ssh_enabled` 확인
- slug 충돌/등록 실패 메시지 확인
