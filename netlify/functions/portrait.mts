import { getStore } from '@netlify/blobs'
import { handlePortraitRequest, type PortraitStore } from '../../server/portrait'

/** Copia i byte in un ArrayBuffer tutto suo: Blobs e Response non accettano una vista. */
const toArrayBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

/** Quello che serve del contesto Netlify: i parametri del percorso. */
interface Context {
  params: Record<string, string>
}

/** I ritratti restano per sempre su Netlify Blobs: una coppia personaggio + arma si genera una volta sola. */
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
  const out = await handlePortraitRequest(
    context.params.character,
    context.params.weapon,
    {
      accountId: process.env.CF_ACCOUNT_ID,
      token: process.env.CF_API_TOKEN,
      model: process.env.CF_IMAGE_MODEL,
      pollinationsKey: process.env.POLLINATIONS_API_KEY,
      pollinationsModel: process.env.POLLINATIONS_IMAGE_MODEL,
      groqKey: process.env.GROQ_API_KEY,
      groqModel: process.env.PORTRAIT_TRANSLATE_MODEL,
    },
    blobStore(),
  )
  const body = out.body instanceof Uint8Array ? toArrayBuffer(out.body) : JSON.stringify(out.body)
  return new Response(body, { status: out.status, headers: out.headers })
}

export const config = { path: '/api/portrait/:character/:weapon' }
