import { readFile, access } from 'node:fs/promises';

const requiredFiles = ['src/app/pages/admin/AdminMenu.tsx', 'src/app/pages/admin/AdminNutrition.tsx'];
for (const path of requiredFiles) {
  const source = await readFile(path, 'utf8');
  if (!source.includes('Aplicar borrador pegado')) throw new Error(path + ' does not expose manual draft import.');
  if (/\bsuggestNutrition\b/.test(source)) throw new Error(path + ' still calls the paid nutrition AI service.');
  if (!source.includes("nutrition_source: 'ai_draft'")) throw new Error(path + ' does not preserve the unverified draft marker.');
}
for (const path of ['api/nutrition/suggest.ts', 'src/services/nutritionAiService.ts', 'scripts/nutrition-ai-live-smoke.mjs']) {
  try {
    await access(path);
    throw new Error(path + ' must be removed to prevent a paid AI path from being deployed or invoked.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be removed')) throw error;
  }
}
console.log('Manual nutrition draft workflow: PASS');
console.log('Both menu editors import unverified drafts without an AI API, and the paid endpoint/service are absent.');
