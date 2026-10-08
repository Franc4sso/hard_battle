import { getStore } from '@netlify/blobs'
import { handleKoRequest, type PortraitStore } from '../../server/portrait'

/** Copia i byte in un ArrayBuffer tutto suo: Blobs e Response non accettano una vista. */
const toArrayBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

interface Context {
  params: Record<string, string>
}

/** Le foto del K.O. stanno nello stesso store dei ritratti. */
function blobStore(): PortraitStore {
  const store = getStore('portraits')
  return {
    async get(key) {
      const buf = await store.get(key, { type: 'arrayBuffer' })
      return buf ? new Uint8Array(buf) : null
    },
    async set(key, data) {
      await store.set(key, toArrayBuffer(data))
    },
  }
}

export default async (req: Request, context: Context): Promise<Response> => {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })
  const p = context.params
  const out = await handleKoRequest(
    [p.wc, p.ww, p.lc, p.lw, p.arena],
    {
      accountId: process.env.CF_ACCOUNT_ID,
      token: process.env.CF_API_TOKEN,
      model: process.env.CF_IMAGE_MODEL,
      groqKey: process.env.GROQ_API_KEY,
      groqModel: process.env.PORTRAIT_TRANSLATE_MODEL,
    },
    blobStore(),
  )
  const body = out.body instanceof Uint8Array ? toArrayBuffer(out.body) : JSON.stringify(out.body)
  return new Response(body, { status: out.status, headers: out.headers })
}

export const config = { path: '/api/ko/:wc/:ww/:lc/:lw/:arena' }
