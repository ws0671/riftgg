import { TriangleAlert } from 'lucide-react'
import type { SearchError } from '../api'

const messages: Record<string, string> = {
  PROFILE_STALE: '현재 프로필을 갱신하지 못해 이전 정보를 표시합니다.',
  RANK_STALE: '랭크를 갱신하지 못해 이전 랭크와 마지막 갱신 시각을 표시합니다.',
  RANK_UNAVAILABLE:
    '랭크 정보를 불러오지 못했습니다. 잠시 후 정보 갱신을 눌러주세요.',
  CACHE_WRITE_FAILED:
    '정보를 조회했지만 저장하지 못했습니다. 다음 조회에서는 다시 요청할 수 있습니다.',
  REFRESH_IN_PROGRESS:
    '다른 요청에서 정보를 갱신하고 있습니다. 현재 저장된 정보를 표시합니다.',
}
export default function SummonerWarnings({
  codes,
  error,
}: {
  codes: string[]
  error: SearchError | null
}) {
  const lines = [
    ...codes.map((code) => messages[code]).filter(Boolean),
    ...(error
      ? [`갱신 실패: ${error.message} 마지막으로 조회한 정보를 유지합니다.`]
      : []),
  ]
  if (!lines.length) return null
  return (
    <div
      className="my-4 flex items-start gap-2 rounded-lg border border-border bg-surface-muted p-4 text-[12px] text-content-muted"
      role="status"
    >
      <TriangleAlert
        size={16}
        className="mt-px shrink-0 text-accent"
        aria-hidden="true"
      />
      <div>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  )
}
