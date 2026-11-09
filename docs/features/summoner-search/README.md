# 소환사 검색

[PRD v0.2](../../common/RiftGG_PRD_Product_v0.2.pdf) §3.1·3.2의 비로그인 검색, 프로필, 솔로·자유 랭크, 수동 갱신을 구현했다. [최근 경기](../summoner-matches/README.md)는 별도 기능으로 관리한다. 경기 상세·통계·인증·즐겨찾기·다중 서버·자동완성·최근 검색·테마 전환은 후속 범위다.

## 검색과 화면

- 한 입력창에서 `Riot ID#태그라인`을 받는다. 구분자 하나와 비어 있지 않은 두 항목을 요구한다. 앞뒤 공백을 정리하고 NFC로 정규화하며, 이름 내부 공백과 대소문자는 보존한다. 제어문자와 한글 IME 조합 중 Enter 제출을 차단한다. 태그라인 자동 보충은 없으며 서버는 `platform: "kr"`로 결정한다.
- 폼 제출은 `/summoners/kr?gameName=Rift+Player&tagLine=KR1`로 이동한다. 검색 조건은 URL에서 복원한다. 결과 페이지가 조회하며, Riot 정식 이름·태그와 URL이 다르면 URL을 replace하고 Query 캐시를 이관한다. 다른 계정의 이전 응답으로 현재 화면을 덮어쓰지 않는다.
- 첫 조회에는 스켈레톤을 표시한다. 프로필에는 이름·태그·아이콘·레벨·갱신 시각을, 랭크에는 티어·LP·승패·승률을 표시한다. 이미지 실패에는 대체 아바타를 사용한다. 랭크 기록 없음과 조회 실패를 구분하고, 수동 갱신 중이나 실패 시 기존 결과와 성공 시각을 유지한다.
- [디자인 시안](RiftGG_Design_Themes.html)의 블랙 버전을 적용했다. 모바일 최소 폭 320px에서 확인했으며, 시안의 예시 경기·통계는 화면에 표시하지 않는다.

- 프로필 아래에 솔로·자유 랭크 카드를 나란히 표시한다. 랭크 엠블럼은 앱과 함께 배포하며, 지원하지 않는 티어 또는 이미지 로드 실패 시 기본 방패 아이콘과 티어 텍스트를 표시한다. [Riot 공식 엠블럼](https://developer.riotgames.com/docs/lol#ranked-info)

## 코드와 API 계약

[라우팅](../../../src/App.tsx) → [검색·결과 페이지](../../../src/pages) → [검색 UI·조회 훅·API 래퍼](../../../src/features/summoner-search) → [Edge Function](../../../supabase/functions/summoner-search) 순서로 흐름을 확인할 수 있다. 조회 Query와 수동 갱신 Mutation을 분리하고, 조회의 신선도는 서버의 남은 캐시 유효 시간을 반영한다.

```http
POST /functions/v1/summoner-search
Content-Type: application/json
apikey: <publishable-key>

{"platform":"kr","gameName":"Rift Player","tagLine":"KR1","forceRefresh":false}
```

- [함수 설정](../../../supabase/config.toml)에서 `verify_jwt = false`로 비로그인 호출을 허용한다. 요청·성공·오류의 필드와 검증 규칙은 [Zod 계약](../../../supabase/functions/_shared/contracts.ts)이 기준이다. 오류의 HTTP 상태와 코드 매핑은 [함수 핸들러](../../../supabase/functions/summoner-search/handler.ts)와 [Riot 클라이언트](../../../supabase/functions/_shared/riot.ts)에서 확인한다.
- ACCOUNT-V1은 ASIA에서 Riot ID를 PUUID로 해석한다. 이후 SUMMONER-V4와 LEAGUE-V4는 KR에서 PUUID로 프로필과 랭크를 조회한다. Riot 계정 없음과 한국 서버 프로필 없음은 별도 404로 처리한다. [Riot LoL 문서](https://developer.riotgames.com/docs/lol), [API Reference](https://developer.riotgames.com/apis)
- 프로필을 확보하면 랭크 조회 실패도 경고를 포함한 부분 성공으로 반환할 수 있다. 정상 조회에서 큐의 랭크가 비어 있으면 언랭크로 표시한다. 응답 메타데이터는 출처, 성공·만료 시각, 수동 갱신 가능 시각과 경고를 포함한다. 비2xx 응답은 HTTP 상태와 JSON 오류 코드를 함께 사용한다.

## 캐시와 호출 제한

| 항목 | 현재 동작 |
| --- | --- |
| 신선도 | Riot ID 대응(`riot_id_lookup_cache`), 프로필(`summoners`), 랭크 상태(`rank_cache_state`)는 각각 5분 TTL을 적용한다. 랭크 엔트리(`rank_entries`)는 상태 테이블의 TTL을 따른다. 이름 대응 만료 또는 수동 갱신 시 Riot ID를 재확인한다. |
| 동시 요청 | 검색 키와 PUUID별로 20초 리스를 사용한다. 저장 시 리스 소유자와 기한을 검증한다. 성공한 랭크 스냅샷은 트랜잭션으로 교체하며, 정상 빈 결과는 기존 엔트리를 삭제한다. |
| 수동 갱신 | PUUID당 60초 쿨다운을 DB와 UI에서 적용한다. 연속 갱신은 `429 REFRESH_COOLDOWN`을 반환한다. |
| 장애 시 응답 | 일시 장애 시 신원이 확인된 계정에 한해 30분 이내 데이터를 경고와 함께 반환한다. 404와 키 인증 오류는 오류로 처리한다. 캐시 저장만 실패하면 실제 조회 결과와 경고를 반환한다. 공유 DB 또는 제한 저장소에 장애가 발생하면 Riot 호출을 중단한다. |
| 서비스 요청 제한 | 전체 120회/분, 검색 키별 12회/분. 신뢰 IP 제한을 켠 환경에서는 IP별 30회/분을 추가한다. |
| Riot 호출 예산 | 라우팅별 기본 상한은 8회/초·30회/120초다. DB에서 예산을 원자적으로 예약하고 앱·메서드 제한 헤더를 반영한다. 429는 application/method/service 범위별로 공유 쿨다운을 적용하며, 범위를 알 수 없으면 전체에 적용한다. |
| IP 제한 | 기본 비활성이다. 프록시가 덮어쓰는 단일 IP 헤더를 확인한 배포에서 `VERIFIED_CLIENT_IP_HEADER`와 `CLIENT_IP_HASH_SALT`를 함께 설정하면 HMAC 식별자로 제한한다. |
| 정리 작업 | `select public.cleanup_summoner_search();`로 실행한다. pg_cron이 설치된 경우 세 번째 마이그레이션이 일일 작업을 등록한다. 그 외 환경에서는 운영 스케줄러에서 정리 함수를 실행한다. |

## 검증 상태

- 기존 구현 검증에서 Vitest 74개·Playwright 8개와 빌드·린트·Deno 타입 검사가 통과했다. 브라우저 테스트는 고정 API 응답으로 공유 URL·새로고침·뒤로 가기, 모바일, 오류, 요청 경합, 랭크 부분 실패와 정규 URL의 중복 호출 방지를 확인했다. 명령은 [개발·배포 절차](../../common/development.md)에 있다.
- 기존 로컬 실연동에서 데이터 초기화 없이 추가 마이그레이션을 적용했다. 실제 Riot 계정·프로필·랭크 조회, 반복 요청의 캐시 적중, 계정 없음 404, 수동 갱신 200 직후 60초 쿨다운 429를 확인했다.
- 운영 검증 대기. 운영 Supabase와 프론트엔드를 연결한 뒤 공유 URL 직접 접속·새로고침·CORS, 신뢰 IP 헤더, 실제 Riot 키 할당량과 제한 동작, 정리 스케줄러를 확인한다.
