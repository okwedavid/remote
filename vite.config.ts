import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Remote is deployed as a static site (Render Static Site) — there is no server
// component in this project. All traffic goes from the visitor's browser
// straight to the OpenCode server the user configures in Settings.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // Split the rarely-changing dependencies so repeat visits only refetch
        // Remote's own (tiny) bundle. highlight.js is already its own chunk
        // because it is imported dynamically.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          const match = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id)
          const pkg = match?.[1] ?? 'vendor'
          if (pkg.startsWith('@opencode-ai') || pkg === 'cross-spawn') return 'vendor-opencode'
          if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'vendor-react'
          if (pkg === 'react-markdown' || pkg === 'remark-gfm') return 'vendor-markdown'
          return 'vendor'
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Only relevant when running `npm run dev` inside a container/cloud IDE.
    allowedHosts: ['.e2b.app', '.onrender.com', 'localhost', '127.0.0.1'],
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: ['.e2b.app', '.onrender.com', 'localhost', '127.0.0.1'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
})
