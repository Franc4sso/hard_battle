import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Netlify non ha un database: la prima parte della rissa torna al telefono firmata,
 * e il telefono la rimanda per la seconda. La firma impedisce di modificarla
 * (cioè di infilare testo arbitrario nel prompt).
 */
const MAX_AGE_MS = 6 * 60 * 60 * 1000

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const mac = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest('base64url')

export function sign(payload: object, secret: string, now = Date.now()): string {
  const data = b64(JSON.stringify({ ...payload, iat: now }))
  return `${data}.${mac(data, secret)}`
}

export function verify<T>(token: unknown, secret: string, now = Date.now()): T | undefined {
  if (typeof token !== 'string' || token.length > 20_000) return undefined
  const [data, sig] = token.split('.')
  if (!data || !sig) return undefined
  const expected = Buffer.from(mac(data, secret))
  const got = Buffer.from(sig)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return undefined
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as T & { iat?: number }
    if (typeof payload.iat !== 'number' || now - payload.iat > MAX_AGE_MS) return undefined
    return payload
  } catch {
    return undefined
  }
}
