export class ApiFailure extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfter: number
  constructor(status: number, code: string, retryAfter = 0) {
    super(code)
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}
