# Route Note 배포 체크리스트

로컬에서 기능을 확인한 뒤 GitHub Pages에 반영할 때는 아래 순서를 사용합니다.

1. 최신 작업 브랜치에서 빌드 확인

   ```bash
   npm run build
   ```

2. 변경사항을 `main`에 병합하고 GitHub에 push

   ```bash
   git checkout main
   git pull origin main
   git merge <작업-브랜치>
   git push origin main
   ```

3. GitHub Pages 배포

   ```bash
   npm run deploy
   ```

4. 배포 후 확인

   - 사이트: https://jamaica8612.github.io/routenote/
   - 주소 검색 함수: `rn-geocode`
   - 우편번호 구역 함수: `rn-postcode-zone`

주의: `main`에 push하는 것만으로는 GitHub Pages가 자동 갱신되지 않습니다. 실제 서비스 화면은 `npm run deploy`가 갱신하는 `gh-pages` 브랜치를 봅니다.
