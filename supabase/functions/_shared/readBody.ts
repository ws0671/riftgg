import { ApiFailure } from './errors.ts'

export async function readBody(request: Request, invalidCode = 'INVALID_RIOT_ID') {
  const reader = request.body?.getReader()
  if (!reader) throw new ApiFailure(400, invalidCode)
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    length += chunk.value.byteLength
    if (length > 2048) {
      await reader.cancel()
      throw new ApiFailure(413, 'BODY_TOO_LARGE')
    }
    chunks.push(chunk.value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ApiFailure(400, invalidCode)
  }
}
