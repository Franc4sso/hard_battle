import { handleBattleRequest } from '../../server/handler'

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const out = await handleBattleRequest(await req.text(), {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL,
    reasoning: process.env.GROQ_REASONING,
    secret: process.env.BATTLE_SECRET,
  })
  return Response.json(out.body, { status: out.status })
}

export const config = { path: '/api/battle' }
