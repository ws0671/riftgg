# Rift.GG 문서

후속 기능 개발 시 공통 아키텍처를 먼저 읽고, PRD에서 해당 범위를 확인한 뒤 관련 기능 문서를 참고한다. 로컬 실행과 검증 명령은 개발·배포 절차에서 확인한다.

## 공통 문서

| 문서 | 역할 |
| --- | --- |
| [제품 요구사항 v0.2](common/RiftGG_PRD_Product_v0.2.pdf) | 제품 목표, 기능 범위, 우선순위 |
| [아키텍처·개발 원칙](common/architecture.md) | 프론트엔드·서버 구조, 데이터 접근, 보안, 디자인 원칙 |
| [개발·배포 절차](common/development.md) | 환경 설정, 실행, 검증, 배포 |

## 기능별 문서

| 기능 | 문서 |
| --- | --- |
| 소환사 검색·프로필·랭크·수동 갱신 | [동작·API·검증 상태](features/summoner-search/README.md), [디자인 시안](features/summoner-search/RiftGG_Design_Themes.html) |
| 최근 경기 | [목록·페이지 조회·캐시](features/summoner-matches/README.md) |

새 기능은 `features/<기능명>/README.md`에 범위, 주요 동작과 계약, 검증 상태를 기록한다. 여러 기능에서 따르는 규칙은 `common/`에 두고 링크한다. 구현·계획·운영 검증 상태는 구분해서 표시한다.
