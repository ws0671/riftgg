# 개발·배포 절차

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

아래 예시는 현재 소환사 검색 기능을 기준으로 합니다. Supabase 프로젝트와 Riot 개발 키가 필요합니다. 아래 명령은 연결할 프로젝트를 확인한 후 실행합니다.

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
npx supabase functions deploy summoner-matches --use-api
```

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 Supabase 함수 런타임이 제공합니다. 공개 검색 함수는 `verify_jwt = false`로 설정되어 있으며, 사용자 로그인 없이 호출됩니다. Function이 캐시와 Riot 키를 관리하고 브라우저는 DB에 직접 접근하지 않습니다.

전체 로컬 Supabase 환경을 사용할 경우 Docker를 실행한 뒤 `npx supabase start`, `npx supabase migration up`, `npx supabase functions serve --env-file supabase/functions/.env.local`을 사용합니다. 현재 설치된 CLI의 `migration up`은 기본 대상이 로컬이며 기존 데이터를 초기화하지 않습니다. 프론트엔드에는 로컬 프로젝트 URL과 해당 공개 키를 설정합니다.

`functions serve`는 별도 터미널에서 한 번만 실행하고 계속 켜둡니다. 이미 실행 중인 경우 다른 터미널에서 중복 실행하지 마세요. 재시작이 필요하면 기존 실행 터미널에서 Ctrl+C로 종료한 다음 다시 실행합니다. 로컬 설정 파일 변경 시 실행 중인 CLI가 자동으로 다시 불러올 수 있으므로 터미널 로그를 먼저 확인하세요. 중복 실행으로 `No such container: supabase_edge_runtime_riftgg`가 나오면 기존 serve 실행을 종료한 뒤 하나의 터미널에서만 다시 실행합니다.

원격 Supabase를 사용하는 위 절차는 로컬 DB를 시작하지 않습니다. `127.0.0.1:54322` 연결 오류가 나오면 원격 연결 상태와 명령 옵션을 먼저 확인하세요. Git Bash의 `Copy-Item: command not found`는 PowerShell 전용 명령을 사용한 오류이므로 Bash의 `cp`를 사용합니다. 함수 배포의 `--use-api`는 Docker 대신 서버에서 번들링합니다.

## 프론트엔드 배포

Vercel에 두 `VITE_` 공개 변수를 설정하고 `npm run build` 결과인 `dist`를 배포합니다. `vercel.json`에 공유 URL 직접 접속을 위한 SPA rewrite가 있습니다. 프론트엔드 운영 주소를 Function의 `ALLOWED_ORIGINS`에도 등록합니다.

## 검증 명령

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
```

Vitest는 단위·통합 테스트에, Playwright는 브라우저 흐름 검증에 사용합니다. DB의 SQL·권한·트랜잭션은 PGlite로 검증합니다. Playwright는 별도 5175 포트에서 API를 가로채 고정 응답을 사용합니다. Windows에서는 설치된 Microsoft Edge를 사용하며, 다른 OS에서는 `npx playwright install chromium`으로 브라우저를 준비합니다. 실제 외부 API 연동은 별도로 검증합니다.

Edge Functions의 Deno 타입 검사는 아래 명령으로 실행합니다.

```powershell
npx --yes --package=deno deno check --config supabase/functions/summoner-search/deno.json supabase/functions/summoner-search/index.ts
npx --yes --package=deno deno check --config supabase/functions/summoner-matches/deno.json supabase/functions/summoner-matches/index.ts
```
