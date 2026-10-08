import fs from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * In sviluppo /api/battle è servita direttamente dal dev server, con lo stesso
 * codice della Netlify Function: niente netlify-cli. La chiave sta in .env.local.
 */
function devBattleApi(mode: string): Plugin {
  return {
    name: 'dev-battle-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/battle', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        // Un errore qui non deve mai far cadere il dev server.
        let out: { status: number; body: unknown } = { status: 500, body: { error: 'dev_server' } }
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          // Letta a ogni richiesta: si può cambiare chiave o modello senza riavviare.
          const env = loadEnv(mode, server.config.root, '')
          const { handleBattleRequest } = await server.ssrLoadModule('/server/handler.ts')
          out = await handleBattleRequest(Buffer.concat(chunks).toString('utf8'), {
            apiKey: env.GROQ_API_KEY,
            model: env.GROQ_MODEL,
            reasoning: env.GROQ_REASONING,
            secret: env.BATTLE_SECRET,
          })
        } catch (e) {
          console.error('[dev-battle-api]', e)
        }
        res.statusCode = out.status
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(out.body))
      })
    },
  }
}

/**
 * In sviluppo anche /api/portrait/:personaggio/:arma gira nel dev server. Le
 * immagini già generate restano in .netlify/portraits (ignorata da git).
 */
function devPortraitApi(mode: string): Plugin {
  return {
    name: 'dev-portrait-api',
    apply: 'serve',
    configureServer(server) {
      const dir = path.join(server.config.root, '.netlify', 'portraits')
      const store = {
        async get(key: string) {
          try {
            return new Uint8Array(await fs.readFile(path.join(dir, key)))
          } catch {
            return null
          }
        },
        async set(key: string, data: Uint8Array) {
          await fs.mkdir(dir, { recursive: true })
          await fs.writeFile(path.join(dir, key), data)
        },
      }
      /** /api/portrait/:c/:w?stage=1 e /api/ko/:wc/:ww/:lc/:lw/:arena, con lo stesso codice delle Netlify Functions. */
      const serve = (kind: 'portrait' | 'ko') => async (req: IncomingMessage, res: ServerResponse) => {
        const [path, query = ''] = (req.url ?? '').split('?')
        const ids = path.split('/').filter(Boolean)
        let out: { status: number; body: Uint8Array | object; headers: Record<string, string> } = { status: 500, body: { error: 'dev_server' }, headers: {} }
        try {
          const env = loadEnv(mode, server.config.root, '')
          const cfg = { accountId: env.CF_ACCOUNT_ID, token: env.CF_API_TOKEN, model: env.CF_IMAGE_MODEL, groqKey: env.GROQ_API_KEY, groqModel: env.PORTRAIT_TRANSLATE_MODEL }
          const mod = await server.ssrLoadModule('/server/portrait.ts')
          const stage = Number(new URLSearchParams(query).get('stage')) || 0
          out = kind === 'ko' ? await mod.handleKoRequest(ids, cfg, store) : await mod.handlePortraitRequest(ids[0], ids[1], cfg, store, stage === 1 || stage === 2 ? stage : 0)
        } catch (e) {
          console.error(`[dev-${kind}-api]`, e)
        }
        res.statusCode = out.status
        for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v)
        if (out.body instanceof Uint8Array) res.end(Buffer.from(out.body))
        else {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(out.body))
        }
      }
      server.middlewares.use('/api/portrait', serve('portrait'))
      server.middlewares.use('/api/ko', serve('ko'))
    },
  }
}

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      devBattleApi(mode),
      devPortraitApi(mode),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Rissa Assurda',
          short_name: 'Rissa Assurda',
          description: 'Crea il tuo mostro assurdo e sfida un amico: l’AI simula la rissa.',
          lang: 'it',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#FF4B3E',
          theme_color: '#FF4B3E',
          categories: ['games', 'entertainment'],
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
    test: { environment: 'node' },
  }
})
