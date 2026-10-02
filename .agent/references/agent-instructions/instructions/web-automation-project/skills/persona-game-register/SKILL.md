---
name: persona-game-register
description: persona/game 로컬 JSON 데이터를 MongoDB에 upsert 등록한다.
---

# persona-game-register

## 목적
`persona` 파이프라인 데이터 등록 작업을 표준화한다.

## 절차
```bash
python3 persona/persona_data_register.py
python3 persona/game_data_register.py
```

## 검증
- `.env` Mongo URI 키 설정 확인
- 업데이트/신규/실패 건수 확인
