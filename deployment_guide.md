# Route Note 배포 및 설정

Route Note는 Supabase 프로젝트 `xrrdokcjhjqdfvwtbenl`로 이관을 마쳤습니다. 이 프로젝트에는 다른 앱의 `rn_*` 객체가 이미 있으므로 Route Note는 아래 이름만 사용합니다.

- 테이블·DB 함수·Realtime 채널: `routenote_*`
- Edge Functions: `routenote-geocode`, `routenote-postcode-zone`, `routenote-zone-at-point`, `routenote-road-geometry`, `routenote-send-push`
- 사진 버킷: `routenote-photos`

기존 `rn_*` 테이블·함수와 `tip-photos` 버킷을 Route Note용으로 재사용하거나 수정하지 않습니다. 과거 공유 프로젝트의 데이터를 옮길 때는 Route Note 데이터만 복사하고, 사용자 ID·외래 키·사진 경로·RLS·Realtime publication을 함께 검증합니다. 이메일이 기존 사용자와 겹치면 Auth 계정 대응을 확정한 뒤 연결합니다.

## Supabase 준비

1. 대상 프로젝트가 `xrrdokcjhjqdfvwtbenl`인지 확인합니다.
2. 검토한 [전용 마이그레이션](supabase/migrations/20260930081141_isolate_routenote_schema.sql)만 적용합니다. `routenote_*` 이름이나 사진 버킷이 이미 있으면 덮어쓰지 않고 중단합니다. 기존 `schema.sql`이나 이전 `rn_*` 마이그레이션은 다른 앱과 충돌하므로 이 대상에서 실행하지 않습니다. 모든 새 테이블은 RLS를 사용하며 익명 사용자는 조회 권한만 받습니다.
3. `routenote-photos` 버킷의 공개 조회와 인증 사용자 업로드 정책을 확인합니다. 기존 사진을 복사한 뒤 DB에 저장된 원본 프로젝트의 사진 URL도 대상 프로젝트와 새 버킷 URL로 옮깁니다. 클라이언트는 DB의 URL을 그대로 사용합니다.
4. Route Note의 주소 검색·우편번호·도로 경계·푸시 함수만 새 이름으로 배포하고 필요한 서버 secrets를 설정합니다. 외부 API secrets는 `ROUTENOTE_NAVER_MAP_CLIENT_ID`, `ROUTENOTE_NAVER_MAP_CLIENT_SECRET`, `ROUTENOTE_VAPID_PUBLIC_KEY`, `ROUTENOTE_VAPID_PRIVATE_KEY`를 사용합니다. 서버 secrets와 서비스 키는 브라우저 환경 변수에 넣지 않습니다.
5. 클라이언트에서 사용하는 모든 `routenote_*` 테이블에 필요한 Data API 권한과 RLS를 확인합니다. 변경 구독 대상 테이블은 Realtime publication에도 등록합니다.
6. `routenote_ensure_profile()` RPC를 준비합니다. 로그인 사용자의 프로필이 없을 때만 클라이언트가 인자 없이 호출하며, RPC는 `auth.uid()`의 자기 프로필만 `member`로 생성하고 기존 프로필을 보존해야 합니다. 클라이언트는 생성 후 프로필을 다시 조회합니다. 실패하면 오류를 표시하고 로그인한 사용자 화면 진입을 중단합니다.

## Google 로그인

대상 프로젝트의 Google 제공자를 기존 RouteNote OAuth 클라이언트로 활성화했습니다. Site URL과 기존 Redirect URLs는 보존하고 실제 앱 주소와 네이티브 콜백을 추가했습니다. Google Cloud에는 `https://xrrdokcjhjqdfvwtbenl.supabase.co/auth/v1/callback`이 등록돼 있습니다. 이 OAuth 클라이언트는 RouteNote가 계속 사용하므로 원본 Supabase 프로젝트 삭제와 함께 삭제하지 않습니다.

Management API의 Auth 조회값을 실제 OAuth 비밀키로 복사하지 않습니다. 이관에는 대시보드에서 확인한 기존 원본 키를 사용했습니다. 비밀키는 Git, 문서와 로그에 저장하지 않으며 이관용 임시 CI secret은 제거했습니다.

이전 사용자 8명의 귀속을 유지했으며 같은 인증 이메일의 기존 계정 3명은 연결하고, 없는 계정 5명은 가져왔습니다. RouteNote는 별도 브라우저 저장 키 `routenote-auth-xrrdokcjhjqdfvwtbenl`을 사용하므로 다른 앱의 세션을 자동으로 이어받지 않습니다. 프로젝트가 바뀐 사용자는 Google로 다시 로그인합니다. 로그아웃은 해당 RouteNote 세션에만 적용합니다.

## 클라이언트 설정과 빌드

배포 환경에 대상 프로젝트의 공개 클라이언트 설정을 넣습니다. `VITE_SUPABASE_URL`은 `https://xrrdokcjhjqdfvwtbenl.supabase.co`이며, 공개 키는 기존 `VITE_SUPABASE_ANON_KEY` 변수로 전달합니다. `VITE_NAVER_MAP_CLIENT_ID`도 기존 방식으로 설정합니다. 실제 키는 문서·Git·로그에 기록하지 않습니다.

```bash
npm ci
npm run build
```

빌드 성공은 원격 DB·로그인·사진·함수 동작을 검증한 결과가 아닙니다. 배포 전에 대상 프로젝트에서 사용자 프로필, 구역·팁 조회, 사진 조회·업로드, 주소 검색, 알림·Realtime을 확인합니다.

## GitHub Pages 배포

현재 Pages Source는 GitHub Actions이며 workflow가 `main`의 `dist/`를 배포합니다. [배포 체크리스트](DEPLOYMENT.md)에 따라 배포하고 라이브 앱의 요청이 대상 Supabase 프로젝트와 `routenote_*` 객체를 사용하는지 확인합니다. 원본 프로젝트와 일회성 이관 실행 도구는 정리됐습니다.
