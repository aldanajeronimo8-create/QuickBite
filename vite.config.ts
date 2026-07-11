import { defineConfig, type Plugin } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const useTypeScriptFallback =
  process.platform === 'win32' && process.env.QUICKBITE_ESBUILD_TS_FALLBACK === '1';

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '');
        return path.resolve(__dirname, 'src/assets', filename);
      }
    },
  };
}

function typescriptFallbackTransform(): Plugin {
  return {
    name: 'quickbite-typescript-fallback',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (file.includes('/node_modules/') || file.includes('\\node_modules\\')) return null;
      if (!/\.(mjs|mts|cjs|cts|js|jsx|ts|tsx)$/.test(file)) return null;

      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          sourceMap: true,
          inlineSources: true,
          isolatedModules: true,
          esModuleInterop: true,
        },
      });

      return {
        code: result.outputText,
        map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
      };
    },
  };
}

function disableEsbuildOnWindows(): Plugin {
  return {
    name: 'quickbite-disable-esbuild',
    enforce: 'post',
    config() {
      if (!useTypeScriptFallback) return undefined;

      return {
        esbuild: false,
        optimizeDeps: {
          noDiscovery: true,
          include: [],
        },
        build: {
          minify: false,
          cssMinify: false,
        },
      };
    },
    configResolved(config) {
      if (!useTypeScriptFallback) return;

      const mutableConfig = config as typeof config & {
        esbuild: false;
        optimizeDeps: typeof config.optimizeDeps;
      };
      mutableConfig.esbuild = false;
      mutableConfig.optimizeDeps.noDiscovery = true;
      mutableConfig.optimizeDeps.include = [];
    },
  };
}

export default defineConfig({
  cacheDir: '.vite-cache',
  esbuild: useTypeScriptFallback ? false : undefined,
  optimizeDeps: useTypeScriptFallback
    ? {
        noDiscovery: true,
        include: [],
      }
    : undefined,
  server: {
    host: '127.0.0.1',
    port: 5173,
    allowedHosts: true,
    hmr: {
      overlay: true,
    },
  },
  plugins: [
    figmaAssetResolver(),
    ...(useTypeScriptFallback ? [typescriptFallbackTransform()] : []),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    disableEsbuildOnWindows(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
    // Ensure only one copy of React is bundled, preventing "Invalid hook call" errors
    // that arise when the Figma preview iframe's React conflicts with the app's React.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  build: {
    minify: useTypeScriptFallback ? false : 'esbuild',
    cssMinify: useTypeScriptFallback ? false : 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
            return 'vendor-react';
          }
          return 'vendor-misc';
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
});
