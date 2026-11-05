import SummonerError from '../features/summoner-search/components/SummonerError'
import { SearchError } from '../features/summoner-search/api'

export default function NotFoundPage() {
  return (
    <main className="mx-auto w-[min(calc(100%_-_64px),1040px)] max-[760px]:w-[calc(100%_-_40px)] max-[540px]:w-[calc(100%_-_32px)] flex-1 py-[65px]">
      <SummonerError
        error={
          new SearchError(
            'NOT_FOUND',
            '페이지 주소를 확인해주세요. 현재 한국 서버 검색을 지원합니다.',
          )
        }
      />
    </main>
  )
}
