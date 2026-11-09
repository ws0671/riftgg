# 공통 아키텍처·개발 원칙

제품 범위는 [PRD v0.2](RiftGG_PRD_Product_v0.2.pdf), 실행 명령은 [개발·배포 절차](development.md)를 참고한다.

## 프론트엔드

- React·TypeScript·Vite를 사용한다. React Router와 TanStack Query의 공통 설정은 [AppProviders](../../src/app/AppProviders.tsx)에 둔다.
- [App.tsx](../../src/App.tsx)는 라우트를 연결한다. [pages](../../src/pages)는 URL 처리와 화면 구성을, [공통 레이아웃](../../src/components/layout)은 헤더·푸터·레이아웃을 담당한다. 기능 UI·조회 훅·API 래퍼는 [features](../../src/features) 아래 기능별로 관리한다.
- Tailwind CSS v4의 Vite 플러그인과 유틸리티 클래스를 사용한다. 확정된 블랙 테마의 색상·간격·애니메이션은 [tokens.css](../../src/styles/tokens.css)의 `@theme`에서 관리한다. 기본 간격 단위는 4px이다. 전역 글꼴·포커스 등 기본 스타일은 [index.css](../../src/index.css)의 `@layer base`에 둔다.
- 상태는 색상 외에 텍스트로도 전달한다. 키보드 포커스와 작은 화면에서의 배치를 검증한다.
- Zustand, shadcn/ui, Recharts는 기능 요구가 생길 때 도입 여부를 결정한다.

## 서버·데이터

- 브라우저는 supabase-js로 Edge Functions를 호출한다. Riot API 호출·응답 검증·DTO 변환·공용 캐시 접근은 TypeScript/Deno 함수에서 처리한다. 클라이언트·서버가 공유하는 Zod 계약과 오류 정의는 [함수 공통 모듈](../../supabase/functions/_shared)에 둔다.
- PostgreSQL 스키마·인덱스·권한·RPC는 [SQL 마이그레이션](../../supabase/migrations)으로 관리한다. 여러 쓰기를 함께 적용해야 하면 트랜잭션을 사용한다. 중복 저장은 고유 제약과 upsert로 방지한다.
- 캐시에 갱신 시각과 만료 시각을 둔다. 공유 상태로 동시 호출을 조정하고, 외부 통신에는 타임아웃을 둔다. 일관된 오류 코드와 제한 응답의 `Retry-After`를 사용한다.
- 경기 기능을 설계할 때 페이지 단위 조회와 이미지 지연 로딩을 고려한다. Lighthouse Performance 90점 이상은 기술 설계의 목표다.

## 보안·권한

- 프론트엔드에는 Supabase URL과 publishable key를 사용한다. Riot 키와 Supabase 관리 키는 서버 환경에서만 관리한다. 로그와 응답에서 키·토큰·상위 API 원문·원본 IP를 제외한다.
- 공용 캐시 테이블과 관리 RPC의 브라우저 직접 접근을 차단한다. 공개 함수는 JWT 설정을 명시하고 입력 검증, 허용 출처 CORS, 공유 저장소 기반 요청 제한을 적용한다. CORS는 출처 제어에 사용한다.
- 인증과 개인 데이터는 후속 범위다. 구현 시 Supabase Auth와 RLS로 본인 접근만 허용한다. 서비스 사용자 UUID와 Riot PUUID를 분리하고, 사용자 데이터의 소유자는 `auth.users.id`로 연결한다. RLS의 `USING`과 `WITH CHECK`를 해당 작업에 맞게 설정하고 익명·본인·타인 접근을 검증한다. 관리자 키는 RLS를 우회하므로 서버의 제한된 작업에 사용한다.
- 운영 환경에서는 개발 환경과 Secrets를 분리하고 Riot 키의 공개 서비스 승인 요건과 Supabase 운영 한도를 확인한다. [Riot 개발자 포털](https://developer.riotgames.com/docs/portal), [Supabase 함수 제한](https://supabase.com/docs/guides/functions/limits)

## 후속 데이터 모델 초안

| 대상 | 계획 |
| --- | --- |
| `profiles` | `id`가 `auth.users.id`를 참조하는 앱 프로필 |
| `matches`, `summoner_matches` | 경기 상세와 소환사-경기 관계. 경기 식별자와 관계 키에 고유 제약 적용 |
| `favorites`, `search_history` | 사용자별 즐겨찾기와 검색 기록. 사용자 ID와 대상 키로 중복 제어 |
