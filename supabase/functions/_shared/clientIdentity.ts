import { isIP } from 'node:net'

/** Opt-in only after verifying that the deployment proxy overwrites this header. */
export function createClientIdentity(
  header: string | undefined,
  salt: string | undefined,
) {
  return async (request: Request): Promise<string | null> => {
    if (!header || !salt) return null
    const value = request.headers.get(header)?.trim()
    // A verified single-address header is required; never choose a user-supplied XFF element.
    if (!value || !isIP(value))
      throw new Error('Verified client address unavailable')
    const canonical =
      isIP(value) === 6 ? new URL(`http://[${value}]`).hostname : value
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(salt),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const hash = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(canonical),
    )
    return Array.from(new Uint8Array(hash), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('')
  }
}
