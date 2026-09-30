# Route Note 이관과 배포

현재 GitHub Pages 설정은 `main` 브랜치의 `/docs`입니다. 준비된 `.github/workflows/deploy.yml`은 GitHub Actions 방식으로 `dist/`를 배포합니다. 실제 전환 전에는 원격 데이터와 계정 검증을 끝내고 Pages 배포 방식도 맞춰야 합니다.

1. 대상 `xrrdokcjhjqdfvwtbenl`의 전용 `routenote_*` 스키마·계정 대응·사진·서버 설정을 준비합니다. 기존 `rn_*`와 플렉스노트의 구역노트는 보존합니다. 상세 내용은 [설정 가이드](deployment_guide.md)와 [마이그레이션 범위](supabase/migrations/README.md)를 참고합니다.
2. 대상 공개 키를 repository secret `ROUTENOTE_SUPABASE_PUBLISHABLE_KEY`로 설정합니다. 키가 없으면 빌드 workflow는 중단합니다. 서버 service role 키는 이 변수에 넣지 않습니다.
3. 대상에서 구역·팁·사진·로그인·주소 검색·알림을 검증하고 로컬 빌드를 확인합니다.

   ```bash
   npm run build
   ```

4. 전환 준비가 완료되면 GitHub Settings → Pages의 Source를 **GitHub Actions**로 변경하고 검토한 변경을 `main`에 반영합니다. `.github/workflows/deploy.yml`의 빌드·Pages 배포 결과를 확인합니다. 서버 함수 workflow는 새 `routenote-*` 함수 5개만 배포하며 기존 SQL이나 데이터를 재실행하지 않습니다.
5. https://jamaica8612.github.io/routenote/ 에서 라이브 요청이 대상 프로젝트와 전용 객체를 사용하는지 확인합니다. 원본 프로젝트는 전환과 기존 앱 확인이 끝날 때까지 보존합니다.

`npm run deploy`는 `gh-pages` 브랜치를 갱신하는 이전 방식입니다. 현재 `/docs` 설정 또는 준비된 Actions 배포 흐름과 혼용하지 않습니다. 배포 코드와 원격 준비를 완료하기 전에는 사이트 연결을 전환하지 않습니다.
