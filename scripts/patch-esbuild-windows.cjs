const fs = require('node:fs');

const marker = 'quickbite-windows-esbuild-fallback';

function patchEsbuild() {
  let mainPath;
  try {
    mainPath = require.resolve('esbuild');
  } catch {
    return;
  }

  let source = fs.readFileSync(mainPath, 'utf8');
  if (source.includes(marker)) {
    const updatedSource = source.replace(
      'return process.platform === "win32" && process.env.QUICKBITE_ESBUILD_TS_FALLBACK !== "0";',
      'return process.platform === "win32" && process.env.QUICKBITE_ESBUILD_TS_FALLBACK === "1";',
    );
    if (updatedSource !== source) fs.writeFileSync(mainPath, updatedSource);
    return;
  }

  const helper = `
// ${marker}
function quickbiteShouldUseTypeScriptFallback() {
  return process.platform === "win32" && process.env.QUICKBITE_ESBUILD_TS_FALLBACK === "1";
}
function quickbiteApplyDefine(code, define) {
  if (!define) return code;
  let next = String(code);
  for (const key of Object.keys(define).sort((a, b) => b.length - a.length)) {
    next = next.split(key).join(String(define[key]));
  }
  return next;
}
function quickbiteTSFallbackTransform(input, options = {}) {
  const ts = require("typescript");
  const loader = options.loader || "js";
  let code = quickbiteApplyDefine(input, options.define);
  if (loader === "json") {
    return { code: "export default " + String(code).trim() + ";\\n", map: "", warnings: [] };
  }
  if (!["js", "jsx", "ts", "tsx"].includes(loader)) {
    return { code: String(code), map: "", warnings: [] };
  }
  const jsx = options.jsx === "preserve"
    ? ts.JsxEmit.Preserve
    : options.jsx === "transform"
      ? ts.JsxEmit.React
      : ts.JsxEmit.ReactJSX;
  const result = ts.transpileModule(String(code), {
    fileName: options.sourcefile || "quickbite-esbuild-fallback." + loader,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx,
      jsxImportSource: options.jsxImportSource,
      sourceMap: Boolean(options.sourcemap),
      inlineSources: Boolean(options.sourcemap),
      isolatedModules: true,
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
    }
  });
  return { code: result.outputText, map: result.sourceMapText || "", warnings: [] };
}
`;

  const anchor = 'var version = "';
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex === -1) {
    throw new Error('No se pudo localizar el punto de parche en esbuild.');
  }
  source = `${source.slice(0, anchorIndex)}${helper}${source.slice(anchorIndex)}`;

  const originalTransform =
    'var transform = (input, options) => ensureServiceIsRunning().transform(input, options);';
  const patchedTransform = `var transform = (input, options) => {
  if (quickbiteShouldUseTypeScriptFallback()) return Promise.resolve(quickbiteTSFallbackTransform(input, options));
  return ensureServiceIsRunning().transform(input, options);
};`;
  if (!source.includes(originalTransform)) {
    throw new Error('No se pudo localizar transform() en esbuild.');
  }
  source = source.replace(originalTransform, patchedTransform);

  const originalTransformSync = 'var transformSync = (input, options) => {';
  const patchedTransformSync = `var transformSync = (input, options) => {
  if (quickbiteShouldUseTypeScriptFallback()) return quickbiteTSFallbackTransform(input, options);`;
  if (!source.includes(originalTransformSync)) {
    throw new Error('No se pudo localizar transformSync() en esbuild.');
  }
  source = source.replace(originalTransformSync, patchedTransformSync);

  fs.writeFileSync(mainPath, source);
  console.log('[quickbite] esbuild Windows fallback aplicado.');
}

patchEsbuild();
