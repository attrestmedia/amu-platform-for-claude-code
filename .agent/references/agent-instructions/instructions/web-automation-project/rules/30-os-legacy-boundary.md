# OS & Legacy Boundary Rules

## 규칙
- Windows 전용 코드(`os.startfile`, `*.exe`, `C:\\` 경로)는 요청 없으면 변경하지 않는다.
- `utils/__temp.old/**`는 보관 영역으로 간주하고 수정하지 않는다.
- `utils/video_downloader/phdler/venv/**`는 내장 가상환경으로 간주하고 수정하지 않는다.
- 루트 `venv/**` 및 하위 가상환경 경로는 관리 대상에서 제외한다.
