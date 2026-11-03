# Rift.GG

React + TypeScript + Vite와 Supabase를 사용하는 한국 서버 LoL 소환사 검색 서비스입니다. 블랙 디자인을 적용했습니다.

## 구현 범위

PRD 3.1: `Riot ID#태그라인` 검색, 한국 서버 우선 지원, 결과 페이지 이동·URL 공유, 로딩 및 존재하지 않는 소환사 안내.

- 검색 결과에 계정 이름·태그라인·프로필 아이콘·레벨을 표시합니다.
- 랭크·경기·통계·회원가입·즐겨찾기는 이번 구현에 포함하지 않습니다.
- 실제 데이터는 Supabase Edge Function에서 Riot API로 조회합니다. 설정이 없으면 준비 중 안내를 표시하며 예시 데이터를 대신 표시하지 않습니다.

## 로컬 실행

Node.js 22.14 이상을 권장합니다.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

`.env.local`에 다음 공개 설정을 입력합니다. 설정 변경 후 개발 서버를 다시 실행합니다.

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Riot API 키와 Supabase service role 키를 `VITE_` 변수에 넣으면 안 됩니다.

## Supabase 연결 및 배포

Supabase 프로젝트와 Riot 개발 키가 필요합니다. 아래 명령은 연결할 프로젝트를 확인한 후 실행합니다. 이 저장소 작업에서 원격 프로젝트 생성·DB 적용·함수 배포는 실행하지 않았습니다.

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
Copy-Item supabase/functions/.env.example supabase/functions/.env.local
```

`supabase/functions/.env.local`을 편집합니다.

```dotenv
RIOT_API_KEY=<riot-api-key>
ALLOWED_ORIGINS=http://localhost:5173,https://<frontend-host>
DDRAGON_VERSION=<valid-data-dragon-version>
```

`DDRAGON_VERSION`은 [Data Dragon 버전 목록](https://ddragon.leagueoflegends.com/api/versions.json)에서 선택합니다. 생략하면 대체 아바타를 표시합니다. 실제 키 파일은 Git에서 제외됩니다.

```powershell
npx supabase secrets set --env-file supabase/functions/.env.local
npx supabase functions deploy summoner-search
```

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 Supabase 함수 런타임이 제공합니다. 공개 검색 함수는 `verify_jwt = false`로 설정되어 있으며, 사용자 로그인 없이 호출됩니다. Function이 캐시와 Riot 키를 관리하고 브라우저는 DB에 직접 접근하지 않습니다.

전체 로컬 Supabase 환경을 사용할 경우 Docker를 실행한 뒤 `npx supabase start`, `npx supabase db reset`, `npx supabase functions serve summoner-search --env-file supabase/functions/.env.local`을 사용합니다. 프론트엔드에는 로컬 프로젝트 URL과 해당 공개 키를 설정합니다.

## API

```http
POST <supabase-url>/functions/v1/summoner-search
Content-Type: application/json
apikey: <publishable-key>

{"platform":"kr","gameName":"Rift Player","tagLine":"KR1"}
```

- ACCOUNT-V1은 ASIA 호스트에서 Riot ID를 PUUID로 해석합니다.
- SUMMONER-V4는 KR 호스트에서 LoL 프로필을 조회합니다.
- 계정 없음과 한국 서버 프로필 없음을 구분합니다. 태그라인이 KR1인지 여부로 서버를 판단하지 않습니다.
- 이름·태그 조합별 캐시 TTL은 5분, 갱신 리스는 20초입니다. 만료된 이름 대응은 Riot API로 다시 확인합니다.
- 공유 DB에서 전체 검색 120회/분·동일 검색 키 12회/분, Riot 외부 호출 8회/초·30회/120초를 제한합니다. 초기 보수적 한도이며 실제 키 할당량에 맞춰 조정해야 합니다. IP별 제한은 구현하지 않았습니다.
- Riot 429의 Retry-After는 DB에 저장해 다른 함수 인스턴스에도 적용합니다. 캐시·제한 저장소 장애 시 Riot 호출을 차단합니다.
- 원문 Riot 응답과 키를 클라이언트에 전달하지 않습니다. 오류 로그는 requestId와 오류 코드만 기록합니다.
- 서버의 사용하지 않는 캐시·제한 행은 마이그레이션 하단의 정리 SQL을 Supabase Cron으로 주기 실행할 수 있습니다. 공개 운영 전에 정리 작업을 설정하세요.

Riot 라우팅·키·응답은 [공식 LoL 문서](https://developer.riotgames.com/docs/lol), [API Reference](https://developer.riotgames.com/apis), [오류 및 제한 문서](https://developer.riotgames.com/docs/portal)를 기준으로 확인합니다.

## 검증

```powershell
npm test
npm run build
npm run test:e2e
```

- Vitest: 입력·URL, React 화면, 서버 함수, 실제 PostgreSQL 엔진(PGlite)으로 SQL·권한·리스·호출 제한 검증.
- Playwright: 검색·로딩·URL 복사·직접 접속·새로고침·뒤로 가기·404·429·이전 요청 경합·320px 화면 검증.
- Windows E2E는 설치된 Microsoft Edge를 사용합니다. 다른 OS는 `npx playwright install chromium`으로 브라우저를 준비합니다.
- E2E는 별도 5175 포트 서버와 가짜 공개 설정을 사용하고 API를 가로채 고정 응답을 반환합니다. 실제 Riot 연결 검증과 구분합니다.
- Deno 타입 검사: `npx --yes --package=deno deno check --config supabase/functions/summoner-search/deno.json supabase/functions/summoner-search/index.ts`

실제 키를 사용하는 연결 확인은 Supabase 설정 후 별도로 수행해야 합니다. 유효한 한국 서버 ID, 존재하지 않는 ID, KR 프로필이 없는 ID, 반복 검색의 캐시 적중을 확인하세요.

## 프론트엔드 배포

Vercel에 두 `VITE_` 공개 변수를 설정하고 `npm run build` 결과인 `dist`를 배포합니다. `vercel.json`에 공유 URL 직접 접속을 위한 SPA rewrite가 있습니다. 프론트엔드 운영 주소를 Function의 `ALLOWED_ORIGINS`에도 등록합니다.

## 문서

- [PRD](docs/RiftGG_PRD_Product_v0.2.pdf)
- [기술 설계](docs/RiftGG_Technical_Spec_v0.2.md)
- [블랙·화이트 디자인 시안](docs/RiftGG_Design_Themes.html)
- [검색 기능 설계](docs/RiftGG_Summoner_Search_Design_v0.1.md)
- [3.1 구현 기록](docs/RiftGG_Search_Implementation.md)
