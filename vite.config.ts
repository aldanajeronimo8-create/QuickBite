import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    allowedHosts: true,
    hmr: {
      overlay: true,
    },
  },
  plugins: [figmaAssetResolver(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  build: {
    minify: 'esbuild',
    cssMinify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('recharts')) return 'vendor-charts'
          if (id.includes('@mui/') || id.includes('@emotion/')) return 'vendor-mui'
          if (id.includes('@redoper1/xlsx-js-style') || id.includes('/xlsx/')) return 'vendor-xlsx'
          if (id.includes('@supabase/')) return 'vendor-supabase'
          if (id.includes('@radix-ui/')) return 'vendor-radix'
          if (id.includes('react-router')) return 'vendor-router'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    globals: true,
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
    coverage: {
      reporter: ['text', 'html'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
})
