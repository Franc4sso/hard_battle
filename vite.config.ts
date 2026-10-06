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

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      devBattleApi(mode),
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
