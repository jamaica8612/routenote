# 구역노트 (Route Note) 배포 및 설정 가이드 (1개 프로젝트 공유용)

본 가이드는 Supabase 데이터베이스 설정, 에지 함수(Edge Functions) 배포, 로컬 실행 및 GitHub Pages 배포 방법을 설명합니다. 기존 Supabase 프로젝트에 얹어 쓰기 위해 모든 테이블에 `rn_` 접두사를 적용했습니다.

---

## 1. Supabase 데이터베이스 및 보안 설정

1. **기존 Supabase 프로젝트 선택**: 이미 사용 중인 Supabase 프로젝트 중 하나를 선택합니다.
2. **SQL 스키마 적용**:
   - Supabase Dashboard의 **SQL Editor**로 이동하여 새 쿼리창을 엽니다.
   - 프로젝트 폴더의 [supabase/schema.sql](file:///c:/work/routenote/supabase/schema.sql) 파일 내용을 전체 복사하여 붙여넣고 **Run** 버튼을 눌러 실행합니다.
   - 이 쿼리는 `rn_profiles`, `rn_route_zones`, `rn_route_tips` 등 `rn_` 접두사가 달린 테이블들을 생성하며, 기존 테이블들과 충돌하지 않도록 완벽히 분리되어 안전합니다.
3. **Storage 버킷 생성 (사진 첨부용)**:
   - Dashboard의 **Storage** 메뉴로 이동합니다.
   - **New bucket**을 클릭하여 버킷명을 `tip-photos`로 설정합니다. (기존에 이미 버킷이 있다면 그대로 사용하시면 됩니다.)
   - 배송 기사들이 사진을 직접 조회 및 등록할 수 있도록 버킷 권한을 **Public**으로 설정합니다.

---

## 2. 네이버 주소 검색 (Geocoding) Edge Function 배포

네이버 Geocoding API의 Client Secret 유출을 방지하기 위해 서버리스 함수(Deno)를 배포해야 합니다. 기존 기능들과 겹치지 않게 `rn-geocode` 로 명명합니다.

1. **Supabase CLI 설치 및 로그인** (설치되지 않은 경우):
   ```bash
   # npm으로 글로벌 설치
   npm install -g supabase
   # Supabase 계정 연동 로그인
   supabase login
   ```
2. **Supabase 프로젝트 링크**:
   ```bash
   # 프로젝트 디렉토리 루트에서 실행
   supabase link --project-ref <your-supabase-project-ref-id>
   ```
   *(프로젝트 Ref ID는 Supabase Settings -> General -> Reference ID에서 확인 가능)*

3. **네이버 API 키를 Supabase Secrets에 등록**:
   네이버 개발자 센터에서 획득한 Client ID와 Client Secret을 Supabase에 등록합니다. (이미 설정된 키가 있다면 이 단계를 건너뛰셔도 무방합니다.)
   ```bash
   supabase secrets set NAVER_MAP_CLIENT_ID="발급받은_네이버_클라이언트_ID"
   supabase secrets set NAVER_MAP_CLIENT_SECRET="발급받은_네이버_클라이언트_시크릿"
   ```
4. **Edge Function 배포**:
   주소 검색 및 우편번호 구역 경계 조회 기능에 필요한 서버리스 함수들을 배포합니다.
   ```bash
   supabase functions deploy rn-geocode
   supabase functions deploy rn-postcode-zone
   ```
   배포 후 주소 검색 및 우편번호 기반 구역 생성 기능이 Supabase Edge Functions를 거쳐 정상적으로 경유 동작합니다.

---

## 3. Google OAuth 로그인 설정

1. **Google Cloud Console**에서 OAuth 클라이언트 ID(웹 애플리케이션)를 생성합니다.
2. **승인된 리디렉션 URI**에 다음 주소들을 입력합니다.
   - 로컬 테스트용: `http://localhost:5173` 및 `http://localhost:5173/`
   - GitHub Pages 배포용: `https://<your-github-username>.github.io/routenote/`
3. **Supabase Auth 설정**:
   - Supabase Dashboard -> **Authentication** -> **Providers** -> **Google**로 이동합니다.
   - Google 활성화(Enabled)를 켜고, 발급받은 Client ID와 Client Secret을 입력 후 저장합니다.
   - 하단의 **Redirect URLs** 목록에 GitHub Pages 배포 도메인(`https://<your-github-username>.github.io/routenote/`)을 반드시 추가합니다.

---

## 4. 로컬 개발 및 실행

1. **환경 변수 구성**:
   - 프로젝트 루트의 `.env` 파일에 본인의 API 키 정보를 입력합니다.
   ```env
   VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   VITE_NAVER_MAP_CLIENT_ID=<your-naver-map-client-id>
   ```
2. **의존성 설치 및 로컬 서버 실행**:
   ```bash
   npm install
   npm run dev
   ```
   브라우저에서 `http://localhost:5173`으로 접속합니다. Google 로그인 연동 전이라면 **"테스트 모드"** 버튼을 통해 관리자 및 일반 기사님 권한으로 즉시 UI와 주요 지도의 기능을 확인해볼 수 있습니다.

---

## 5. GitHub Pages 배포하기

1. **package.json 수정**:
   - [package.json](file:///c:/work/routenote/package.json) 파일 상단의 `homepage` 값을 본인의 깃허브 배포 경로로 수정합니다.
   ```json
   "homepage": "https://<your-github-username>.github.io/routenote",
   ```
2. **GitHub 저장소 생성 및 코드 Push**:
   - GitHub에 `routenote` 라는 새로운 저장소를 만듭니다.
   - 로컬 프로젝트 폴더에서 git을 연결하고 push합니다.
   ```bash
   git init
   git add .
   git commit -m "First commit with rn_ prefixes"
   git branch -M main
   git remote add origin https://github.com/<your-github-username>/routenote.git
   git push -u origin main
   ```
3. **gh-pages 배포 명령어 실행**:
   ```bash
   npm run deploy
   ```
   이 명령은 프로젝트를 자동으로 빌드(`dist/` 폴더 생성)한 뒤, `gh-pages` 브랜치를 생성하여 정적 웹 자원을 자동으로 GitHub에 업로드합니다.
4. **GitHub Pages 설정 활성화**:
   - GitHub 레포지토리 Settings -> **Pages** 메뉴로 이동합니다.
   - Build and deployment의 Source가 **Deploy from a branch**로 되어 있는지 확인하고, Branch를 **`gh-pages`** (`/root`)로 지정한 뒤 저장합니다.
   - 약 1~2분 뒤 `https://<your-github-username>.github.io/routenote/` 경로에서 라이브 앱이 작동합니다.
