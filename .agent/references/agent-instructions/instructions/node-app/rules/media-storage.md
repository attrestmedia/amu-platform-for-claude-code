---
paths:
  - "src/app/api/**"
  - "src/libs/**"
  - "src/utils/**"
  - "src/components/**"
---

# AMU 미디어 저장소 규칙 (R2 단일 저장소 계약)

## 적용 범위

- AMU 플랫폼이 생성·업로드·가공·배포·참조하는 모든 이미지, 음성, 영상 및 파생 미디어
- Gen Studio, AMU Play 맵/건물/타일/캐릭터 스프라이트, 프로필, 대화 음성, 운영 콘텐츠

## 필수 계약

1. 신규 미디어 바이트의 영구 저장소는 Cloudflare R2만 허용한다.
2. `public/`, 로컬 파일시스템, 컨테이너 임시 디스크, DB base64/blob을 신규 영구 저장 경로 또는 R2 장애 시 폴백으로 사용하지 않는다.
3. R2 설정·업로드·검증이 실패하면 저장/게시 API는 fail-closed로 실패해야 한다. 로컬 성공으로 위장하지 않는다.
4. DB에는 바이트 대신 최소한 `driver=r2`, `access`, `bucket`, `key`, 전달 URL 또는 비공개 객체 식별자, MIME, bytes, sha256를 저장한다.
5. 공개 런타임 에셋은 public bucket/CDN URL을 사용하고, 비공개 원본은 private bucket과 만료형 signed URL을 사용한다.
6. 공개 게시 전에는 R2 객체 존재, MIME/크기/해시, 도메인 메타데이터(예: 스프라이트 프레임/방향)를 서버에서 검증한다.
7. 객체 키는 소유·도메인 경계를 드러내는 안정적인 prefix를 사용한다.
   - 예: `game/stages/{universeId}/{stageId}/{stageName}/...`
   - 예: `game/characters/{uid}/{characterId}/...`
   - 예: `gen-studio/users/{uid}/...`
8. 로그에는 bucket/key/assetId와 검증 결과만 기록하고, base64 원문·signed URL·자격증명은 기록하지 않는다.
9. `multipart/form-data`를 받는 신규·변경 업로드 API는 승인된 R2 저장 서비스만 호출한다. API/서버 코드에서 `public/` 하위에 `fs.writeFile`, `mkdir`, 이미지 변환기의 `toFile`로 신규 미디어를 기록하지 않는다.
10. 업로드 성공 응답은 `PUT` 완료만으로 반환하지 않는다. `HEAD`로 bytes·MIME·sha256를 대조하고, 검증 뒤 DB 자산 레지스트리 기록까지 성공해야 한다.
11. R2 업로드 후 DB 기록이 실패하면 방금 만든 객체를 삭제하는 보상 처리를 수행한다. 삭제 요청은 인증된 소유 scope와 DB의 asset/url 매핑을 함께 확인한다.
12. 프로모션 슬롯 소재는 `Marketing Oops > 매거진 슬롯`에서만 등록한다. 직접 업로드와 Gen Studio 결과 모두 R2 공개 객체와 assetId를 원장에 연결하며 WordPress 테마 리소스 폴더를 운영 원장으로 사용하지 않는다.
13. Persona Image Library와 Catalog 이미지의 신규·재가공 결과도 동일 계약을 적용한다.
   - Persona Image Library: `persona-image-library/users/{uid}/{generated|references}/{assetId}/...`
   - Catalog: `catalog/users/{uid}/{category}/{subcategory}/{assetId}.jpg`
   - 두 경로 모두 R2 `PUT` → `HEAD` 검증 → DB 메타데이터 기록 순서를 지키고, DB 실패 시 생성 객체를 삭제한다.
14. Gen Studio의 `saveBase64Image`와 게임 파이프라인 파생 이미지도 R2 PUT 시 sha256를 기록하고 HEAD에서 bytes·MIME·sha256를 검증한 뒤에만 후속 DB/에셋 등록으로 진행한다.

## 레거시 처리

- 기존 로컬 경로는 마이그레이션 기간 동안 읽기/삭제 호환만 허용한다.
- 신규 쓰기와 재게시에는 적용하지 않으며, R2 복사 → 해시/객체 검증 → DB 참조 교체 → 캐시 무효화 순으로 이전한다.
- 레거시 로컬 읽기/삭제 호환 코드는 신규 쓰기 서비스와 파일을 분리하고, 이름과 주석에 `legacy`/`migration` 목적을 명시한다.
- Asset Forge/운영 인벤토리에서 로컬·외부 URL 및 R2 메타 누락을 명시적으로 `migration-required`로 표시한다.
- 기존 Persona Image Library의 `/persona-image-library/...`와 Catalog의 `/shoplink/...` 상대 URL은 백필 실행 전까지 읽기 호환을 유지하고, 전송 모델에서 `driver=local`, `migrationState=migration-required`로 식별한다.
- 기존 Gen Studio의 `/apps/gen-studio/...` 상대 URL 및 R2 필수 메타데이터가 없는 외부 URL도 전송 모델에서 `migrationState=migration-required`로 식별한다. 로컬 읽기/삭제는 `genStudioLegacyStorage.ts` 경계에서만 수행한다.
- 요청 처리 경로에서 기존 자산을 암묵적으로 복사하거나 일괄 백필하지 않는다. 백필은 별도 승인된 마이그레이션 작업에서만 수행한다.

## 검증

- 저장 API: R2 미설정 시 명확한 오류 코드로 실패하는지 확인
- 게시 API: 존재하지 않는 객체, private 객체의 공개 게시, 메타 불일치를 차단하는지 확인
- 런타임: DB/R2 URL만으로 에셋을 로드하며 서버 로컬 디스크에 의존하지 않는지 확인
- 운영 UI: universe/stage/type/owner/status/storage 기준 필터와 부족·미연결 에셋을 확인할 수 있는지 점검
- 정적 회귀 검사: `src/app/api/**`, `src/libs/server-utils/**` 전체에서 `public/uploads`, `writeFile`, `appendFile`, `createWriteStream`, `copyFile`, `rename`, `mkdir`, 이미지 변환기의 `toFile` 신규 쓰기가 없고, 공용 업로드·Persona Image Library·Catalog 저장 서비스의 R2 PUT/HEAD/sha256/보상 삭제가 유지되는지 확인
