# Rift.GG

React + TypeScript + Vite, Tailwind CSS v4, Supabase를 사용하는 한국 서버 LoL 소환사 검색 서비스입니다. 블랙 디자인을 적용했습니다.

## 구현 범위

검색 설계 v0.1의 PRD 3.1·3.2 범위를 구현했습니다. `Riot ID#태그라인` 검색, 한국 서버, 공유 URL, 프로필, 솔로·자유 랭크와 수동 갱신을 지원합니다.

- 검색 결과에 계정 이름·태그라인·프로필 아이콘·레벨을 표시합니다.
- 솔로·자유 랭크의 티어·LP·승패·승률을 표시하고, 랭크 조회 실패와 언랭크를 구분합니다.
- 정보 갱신 중·실패 시 기존 정보를 유지합니다. 수동 갱신은 PUUID당 60초 쿨다운을 적용합니다.
- 경기·통계·회원가입·즐겨찾기는 별도 후속 범위입니다.
- 실제 데이터는 Supabase Edge Function에서 Riot API로 조회합니다. 설정이 없으면 준비 중 안내를 표시하며 예시 데이터를 대신 표시하지 않습니다.

## 로컬 실행

Node.js 22.14 이상을 권장합니다.

```powershell
npm install
# 파일이 없을 때만 복사합니다. 이미 값을 입력했다면 복사하지 마세요.
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Git Bash에서는 복사 명령이 다릅니다. 파일이 없을 때 `[ -f .env.local ] || cp .env.example .env.local`을 사용합니다.

`.env.local`에 다음 공개 설정을 입력합니다. 설정 변경 후 개발 서버를 다시 실행합니다.

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Riot API 키와 Supabase service role 키를 `VITE_` 변수에 넣으면 안 됩니다.

## Supabase 연결 및 배포

Supabase 프로젝트와 Riot 개발 키가 필요합니다. 아래 명령은 연결할 프로젝트를 확인한 후 실행합니다. 이 저장소 작업에서 원격 프로젝트 생성·DB 적용·함수 배포는 실행하지 않았습니다.

프로젝트 ID(ref)는 Supabase 프로젝트 설정의 Project ID 또는 대시보드 주소 `https://supabase.com/dashboard/project/프로젝트ID`에서 확인합니다. API 키와 다른 값입니다. 아래 `YOUR_PROJECT_REF`를 실제 ID로 바꾸세요. `<project-ref>`를 명령에 그대로 입력하면 Git Bash에서 문법 오류가 납니다.

다음 명령은 PowerShell과 Git Bash 모두 사용할 수 있습니다. 로그인·연결·DB 적용을 한 줄씩 실행하고 성공을 확인한 후 다음으로 넘어가세요.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --linked
```

`login`이 이미 성공했다면 다시 실행할 필요가 없습니다. `link`가 성공하기 전에 `db push`를 실행하지 마세요. `--linked`는 원격으로 연결한 프로젝트에 적용한다는 뜻입니다.

함수 설정 파일은 이미 있으면 그대로 편집합니다. 없는 경우에만 사용하는 셸에 맞게 복사하세요.

```powershell
# PowerShell
if (!(Test-Path supabase/functions/.env.local)) { Copy-Item supabase/functions/.env.example supabase/functions/.env.local }
```

```bash
# Git Bash
[ -f supabase/functions/.env.local ] || cp supabase/functions/.env.example supabase/functions/.env.local
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
npx supabase functions deploy summoner-search --use-api
```

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 Supabase 함수 런타임이 제공합니다. 공개 검색 함수는 `verify_jwt = false`로 설정되어 있으며, 사용자 로그인 없이 호출됩니다. Function이 캐시와 Riot 키를 관리하고 브라우저는 DB에 직접 접근하지 않습니다.

전체 로컬 Supabase 환경을 사용할 경우 Docker를 실행한 뒤 `npx supabase start`, `npx supabase migration up`, `npx supabase functions serve summoner-search --env-file supabase/functions/.env.local`을 사용합니다. 현재 설치된 CLI의 `migration up`은 기본 대상이 로컬이며 기존 데이터를 초기화하지 않습니다. 프론트엔드에는 로컬 프로젝트 URL과 해당 공개 키를 설정합니다. 현재 작업 공간의 로컬 DB에는 추가 마이그레이션까지 적용했습니다.

`functions serve`는 별도 터미널에서 한 번만 실행하고 계속 켜둡니다. 이미 실행 중인 경우 다른 터미널에서 중복 실행하지 마세요. 재시작이 필요하면 기존 실행 터미널에서 Ctrl+C로 종료한 다음 다시 실행합니다. 로컬 설정 파일 변경 시 실행 중인 CLI가 자동으로 다시 불러올 수 있으므로 터미널 로그를 먼저 확인하세요. 중복 실행으로 `No such container: supabase_edge_runtime_riftgg`가 나오면 기존 serve 실행을 종료한 뒤 하나의 터미널에서만 다시 실행합니다.

원격 Supabase를 사용하는 위 절차는 로컬 DB를 시작하지 않습니다. `127.0.0.1:54322` 연결 오류가 나오면 원격 연결 상태와 명령 옵션을 먼저 확인하세요. Git Bash의 `Copy-Item: command not found`는 PowerShell 전용 명령을 사용한 오류이므로 Bash의 `cp`를 사용합니다. 함수 배포의 `--use-api`는 Docker 대신 서버에서 번들링합니다.

## API

```http
POST <supabase-url>/functions/v1/summoner-search
Content-Type: application/json
apikey: <publishable-key>

{"platform":"kr","gameName":"Rift Player","tagLine":"KR1","forceRefresh":false}
```

- ACCOUNT-V1은 ASIA 호스트에서 Riot ID를 PUUID로 해석합니다.
- SUMMONER-V4는 KR 호스트에서 LoL 프로필을 조회합니다.
- LEAGUE-V4의 PUUID 엔드포인트로 랭크를 조회합니다. 정상 빈 배열은 언랭크이며, 랭크 실패는 프로필 성공 + 경고로 반환합니다.
- 계정 없음과 한국 서버 프로필 없음을 구분합니다. 태그라인이 KR1인지 여부로 서버를 판단하지 않습니다.
- 이름 대응·프로필·랭크의 TTL은 각각 5분입니다. `riot_id_lookup_cache`, `summoners`, `rank_entries`, `rank_cache_state`로 분리했습니다. 이름 대응이 만료되거나 수동 갱신하면 Riot ID를 다시 확인합니다.
- 이름 조회와 PUUID별 갱신에 각각 20초 리스를 적용합니다. 저장 시 리스 소유자·기한을 검증하고 랭크 snapshot은 트랜잭션으로 교체합니다.
- 일시 장애 시 신원이 확인된 계정에 한해 30분 이내의 기존 정보를 경고와 함께 반환합니다. 404·키 인증 오류는 과거 성공 데이터로 숨기지 않습니다. 캐시 저장만 실패하면 실제 조회 데이터와 저장 실패 경고를 반환합니다.
- 전체 검색 120회/분·동일 검색 키 12회/분을 제한합니다. Riot 기본 예산은 라우팅별 8회/초·30회/120초이고 응답의 앱·메서드별 제한 헤더도 DB에 반영합니다. 실제 헤더가 기본값보다 더 큰 경우 기본값을 보수적 상한으로 유지합니다.
- Riot 429는 application/method/service 범위별로 공유 쿨다운을 적용합니다. 범위를 알 수 없으면 전체를 제한합니다. 공유 DB·제한 저장소 장애 시 외부 호출을 중단합니다.
- IP별 30회/분 제한은 검증된 프록시 헤더를 사용하는 배포에서만 켭니다. `VERIFIED_CLIENT_IP_HEADER`와 `CLIENT_IP_HASH_SALT`를 함께 설정하면 단일 IP를 HMAC으로 변환합니다. 기본값은 비활성이며 임의의 X-Forwarded-For를 신뢰하지 않습니다. 공개 전 해당 배포의 헤더 덮어쓰기 보장을 확인해야 합니다.
- 원문 Riot 응답·키·원본 IP를 클라이언트나 로그에 노출하지 않습니다. 로그는 requestId·오류 코드·상위 HTTP 상태만 기록합니다.
- 정리는 `select public.cleanup_summoner_search();`로 실행합니다. pg_cron이 이미 설치된 환경은 3번째 마이그레이션이 매일 정리 작업을 등록합니다. 현재 로컬 DB에는 pg_cron이 없으므로 정리 함수 수동 실행 또는 운영 환경의 스케줄러를 사용하세요.

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

현재 로컬 환경에서 실제 Riot 계정·프로필·랭크 조회, 반복 검색의 캐시 적중, 계정 없음 404, 수동 갱신 성공 및 직후 60초 쿨다운 429까지 확인했습니다. 운영 배포에서는 공개 URL의 직접 접속·CORS·발신 IP·실제 할당량을 별도로 확인해야 합니다.

## 프론트엔드 배포

Vercel에 두 `VITE_` 공개 변수를 설정하고 `npm run build` 결과인 `dist`를 배포합니다. `vercel.json`에 공유 URL 직접 접속을 위한 SPA rewrite가 있습니다. 프론트엔드 운영 주소를 Function의 `ALLOWED_ORIGINS`에도 등록합니다.

## 프론트엔드 파일 구조

```text
src/
  app/AppProviders.tsx          # Router와 QueryClient 공통 설정
  pages/                       # URL별 화면, Tailwind 클래스로 스타일 작성
    HomePage.tsx
    SummonerPage.tsx
    NotFoundPage.tsx
  components/layout/           # Header, Footer, AppLayout
  features/summoner-search/
    components/                # 검색 폼, 프로필, 로딩, 오류 UI
    hooks/useSummoner.ts       # 조회 조건과 TanStack Query 설정
    api.ts                     # Supabase Function 통신
    riotId.ts                  # 입력 검증과 URL 생성
  styles/
    tokens.css                 # Tailwind @theme 색상·간격·애니메이션 토큰
  App.tsx                      # 경로와 페이지 연결
  main.tsx                     # React 시작점
  index.css                    # Tailwind 진입점과 전역 기본 스타일
```

코드를 따라 읽을 때는 `App.tsx` → `pages/HomePage.tsx` → `SummonerSearchForm.tsx` → `pages/SummonerPage.tsx` → `hooks/useSummoner.ts` → `api.ts` 순서로 확인하세요. 페이지는 화면 구성과 URL 처리를, 컴포넌트는 UI를, 훅은 조회 상태를 담당합니다. 서버와 주고받는 공통 타입·검증 규칙은 기존 `supabase/functions/_shared/contracts.ts`에 유지합니다.

## Tailwind CSS 스타일 작성

`vite.config.ts`에 `@tailwindcss/vite`를 연결하고, `src/index.css`에서 Tailwind를 불러옵니다. v4의 CSS 기반 설정을 사용하므로 별도의 `tailwind.config.js`는 필요하지 않습니다. [공식 Vite 설치 안내](https://tailwindcss.com/docs/installation/using-vite)

색상은 `src/styles/tokens.css`의 `@theme`에서 정의합니다. `--color-surface`는 `bg-surface`, `--color-content-muted`는 `text-content-muted`처럼 사용할 수 있습니다. [공식 테마 안내](https://tailwindcss.com/docs/theme)

```tsx
<section className="rounded-[12px] border border-border bg-surface">
  <p className="text-[12px] text-content-muted">소환사 정보</p>
</section>
```

페이지·컴포넌트별 CSS 파일은 제거하고 `className`에 유틸리티를 작성합니다. 기존 화면의 간격을 보존하기 위해 `--spacing: 4px`를 설정했습니다. 따라서 `gap-2`는 8px이며, 기존 화면의 세밀한 값은 `gap-[23px]`처럼 표현합니다. `max-[540px]:text-[16px]`는 작은 화면에서 적용할 스타일입니다. 기본 글자 크기는 기존과 같은 14px입니다. 전역 글꼴·포커스·접근성 설정은 `index.css`의 `@layer base`에 유지합니다.

## 관련 문서

- [PRD](docs/RiftGG_PRD_Product_v0.2.pdf)
- [기술 설계](docs/RiftGG_Technical_Spec_v0.2.md)
- [블랙·화이트 디자인 시안](docs/RiftGG_Design_Themes.html)
- [검색 기능 설계](docs/RiftGG_Summoner_Search_Design_v0.1.md)
- [3.1 구현 기록](docs/RiftGG_Search_Implementation.md)
- [검색 설계 구현률 점검](docs/RiftGG_Summoner_Search_Progress.md)
