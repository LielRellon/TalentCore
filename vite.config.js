import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/agent': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/agent/, ''),
        },
        '/api/chat': {
          target: 'https://api.groq.com',
          changeOrigin: true,
          rewrite: () => '/openai/v1/chat/completions',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${env.GROQ_API_KEY}`)
            })
          }
        },
        '/api/ollama': {
          target: 'http://localhost:11434',
          changeOrigin: true,
          rewrite: () => '/api/chat',
        }
      }
    }
  }
})