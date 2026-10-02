---
name: image-optimize
description: 이미지 확장자 변환 및 용량 최적화를 수행한다.
---

# image-optimize

## 목적
`img_convert` 스크립트로 이미지 변환/최적화를 수행한다.

## 절차
```bash
python3 img_convert/img_extension_converter.py
python3 img_convert/img_optimization_converter.py
```

## 검증
- 출력 파일 형식/크기 확인
- Linux 환경에서 `pngquant.exe` 의존성 이슈 확인
