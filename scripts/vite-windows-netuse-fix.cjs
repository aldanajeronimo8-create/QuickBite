const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const path = require('node:path');

const originalExec = childProcess.exec;
const originalSpawn = childProcess.spawn;
const originalLoad = Module._load;
const esbuildWrappers = new WeakMap();

function isEsbuildNativeBinary(command) {
  return (
    process.platform === 'win32' &&
    typeof command === 'string' &&
    command.toLowerCase().endsWith(`${path.sep}@esbuild${path.sep}win32-x64${path.sep}esbuild.exe`)
  );
}

function esbuildNodeBinary() {
  return require.resolve('esbuild/bin/esbuild');
}

childProcess.spawn = function patchedSpawn(command, args = [], options = {}) {
  if (isEsbuildNativeBinary(command)) {
    return originalSpawn.call(this, process.execPath, [esbuildNodeBinary(), ...args], options);
  }

  return originalSpawn.call(this, command, args, options);
};

function shouldUseTypeScriptFallback() {
  return process.platform === 'win32' && process.env.QUICKBITE_ESBUILD_TS_FALLBACK === '1';
}

function detectLoader(options = {}) {
  if (options.loader) return options.loader;
  const sourcefile = String(options.sourcefile || '');
  const extension = path.extname(sourcefile).replace('.', '');
  return extension || 'js';
}

function tsFallbackTransform(input, options = {}) {
  const ts = require('typescript');
  const loader = detectLoader(options);
  const jsx =
    options.jsx === 'preserve'
      ? ts.JsxEmit.Preserve
      : options.jsx === 'transform'
        ? ts.JsxEmit.React
        : ts.JsxEmit.ReactJSX;

  if (loader === 'json') {
    return {
      code: `export default ${input.trim()};\n`,
      map: '',
      warnings: [],
    };
  }

  if (!['js', 'jsx', 'ts', 'tsx'].includes(loader)) {
    return {
      code: String(input),
      map: '',
      warnings: [],
    };
  }

  const result = ts.transpileModule(String(input), {
    fileName: options.sourcefile || `quickbite-esbuild-fallback.${loader}`,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx,
      jsxImportSource: options.jsxImportSource,
      sourceMap: Boolean(options.sourcemap),
      inlineSources: Boolean(options.sourcemap),
      isolatedModules: true,
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });

  return {
    code: result.outputText,
    map: result.sourceMapText || '',
    warnings: [],
  };
}

function patchEsbuildModule(esbuild) {
  if (!esbuild || esbuild.__quickbiteWindowsPatch) return esbuild;
  if (esbuildWrappers.has(esbuild)) return esbuildWrappers.get(esbuild);

  const originalTransform = esbuild.transform?.bind(esbuild);
  const originalTransformSync = esbuild.transformSync?.bind(esbuild);
  const patched = {};

  for (const key of Object.keys(esbuild)) {
    Object.defineProperty(patched, key, {
      enumerable: true,
      configurable: true,
      get: () => esbuild[key],
    });
  }

  if (originalTransform) {
    Object.defineProperty(patched, 'transform', {
      enumerable: true,
      configurable: true,
      value: async (input, options = {}) => {
        if (shouldUseTypeScriptFallback()) {
          return tsFallbackTransform(input, options);
        }

        try {
          return await originalTransform(input, options);
        } catch (error) {
          if (error?.code === 'EPERM' || /spawn EPERM/i.test(String(error?.message))) {
            return tsFallbackTransform(input, options);
          }
          throw error;
        }
      },
    });
  }

  if (originalTransformSync) {
    Object.defineProperty(patched, 'transformSync', {
      enumerable: true,
      configurable: true,
      value: (input, options = {}) => {
        if (shouldUseTypeScriptFallback()) {
          return tsFallbackTransform(input, options);
        }

        try {
          return originalTransformSync(input, options);
        } catch (error) {
          if (error?.code === 'EPERM' || /spawn EPERM/i.test(String(error?.message))) {
            return tsFallbackTransform(input, options);
          }
          throw error;
        }
      },
    });
  }

  Object.defineProperty(patched, '__quickbiteWindowsPatch', {
    value: true,
    enumerable: false,
  });
  esbuildWrappers.set(esbuild, patched);
  return patched;
}

Module._load = function patchedModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);

  if (request === 'esbuild') {
    return patchEsbuildModule(loaded);
  }

  return loaded;
};

childProcess.exec = function patchedExec(command, ...args) {
  if (process.platform === 'win32' && command === 'net use') {
    const callback = args.find((arg) => typeof arg === 'function');
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    child.pid = 0;

    process.nextTick(() => {
      callback?.(new Error('Skipped net use during Vite build'), '', '');
      child.emit('exit', 0);
      child.emit('close', 0);
    });

    return child;
  }

  return originalExec.call(this, command, ...args);
};
