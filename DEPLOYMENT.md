# Route Note 이관과 배포

현재 GitHub Pages는 GitHub Actions 방식이며 `.github/workflows/deploy.yml`이 `main`의 `dist/`를 배포합니다. 운영 주소는 https://jamaica8612.github.io/routenote/ 입니다.

2026-09-30 이관 완료: 대상 `xrrdokcjhjqdfvwtbenl`의 전용 테이블 21개에 3,510건, `routenote-photos`에 사진 83개를 복사했습니다. 변환 후 테이블 해시와 사진 SHA256을 대조했고 외래 키 위반은 0건입니다. 기존 앱의 테이블 26개는 이관 전 건수와 해시를 유지했습니다. 실제 Google 로그인, 지도 진입, 주소 검색과 우편번호 API를 확인했습니다. 원본 `dewusorjwzhsdhrsrvbg` 프로젝트는 자료를 비공개 로컬 폴더에 백업한 뒤 사용자 요청에 따라 삭제했습니다.

1. 대상 `xrrdokcjhjqdfvwtbenl`과 전용 `routenote_*` 객체를 사용합니다. 기존 `rn_*`와 플렉스노트의 구역노트는 보존합니다. 상세 내용은 [설정 가이드](deployment_guide.md)와 [마이그레이션 범위](supabase/migrations/README.md)를 참고합니다. 이미 적용한 이관 SQL과 데이터 복사를 다시 실행하지 않습니다.
2. 대상 공개 키를 repository secret `ROUTENOTE_SUPABASE_PUBLISHABLE_KEY`로 설정합니다. 키가 없으면 빌드 workflow는 중단합니다. 서버 service role 키는 이 변수에 넣지 않습니다.
3. 대상에서 구역·팁·사진·로그인·주소 검색·알림을 검증하고 로컬 빌드를 확인합니다.

   ```bash
   npm run build
   ```

4. 검토한 변경을 `main`에 반영하고 `.github/workflows/deploy.yml`의 빌드·Pages 배포 결과를 확인합니다. 서버 함수 workflow는 새 `routenote-*` 함수 5개만 배포하며 기존 SQL이나 데이터를 재실행하지 않습니다.
5. 운영 주소에서 대상 프로젝트와 전용 객체를 사용하는지 확인합니다. RouteNote는 독립 세션 저장 키 `routenote-auth-xrrdokcjhjqdfvwtbenl`과 로컬 범위 로그아웃을 사용합니다.

`npm run deploy`는 `gh-pages` 브랜치를 갱신하는 이전 방식입니다. 운영 Actions 배포 흐름과 혼용하지 않습니다. Android 소스와 설치 APK의 연결 전환은 이 저장소에서 검증하지 않았습니다. 사진 업로드, 실제 푸시 수신과 Realtime 왕복은 이번 검증 범위에 포함되지 않았습니다.
