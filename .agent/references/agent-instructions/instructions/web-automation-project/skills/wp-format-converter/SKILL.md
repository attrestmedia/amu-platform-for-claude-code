---
name: wp-format-converter
description: 마크다운/텍스트를 WP 업로드용 HTML 및 JSON 데이터로 변환한다.
---

# wp-format-converter

## 목적
문서 원본을 `wp_mng` 게시 파이프라인 입력 형태로 변환한다.

## 절차
```bash
python3 wp_mng/format_converter/parse_markdown_files.py
python3 wp_mng/format_converter/post_format_converter.py
```

## 검증
- `wp_mng/format_converter/output/*.html` 생성
- `wp_mng/format_converter/json/new_post_datas.json` 누적 확인
