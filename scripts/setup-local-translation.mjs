import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workerEnvFile = resolve('.dev.vars');
const frontendEnvFile = resolve('.env.local');
const existingWorkerEnv = existsSync(workerEnvFile)
  ? readFileSync(workerEnvFile, 'utf8')
  : '';
const existingGoogleKey = existingWorkerEnv
  .split(/\r?\n/)
  .find((line) => line.startsWith('GOOGLE_TRANSLATE_API_KEY='))
  ?.slice('GOOGLE_TRANSLATE_API_KEY='.length)
  .trim();
const token = randomBytes(32).toString('hex');

writeFileSync(workerEnvFile, [
  `GOOGLE_TRANSLATE_API_KEY=${existingGoogleKey || 'replace-with-a-google-cloud-api-key'}`,
  `TRANSLATION_ACCESS_TOKEN=${token}`,
  '',
].join('\n'));

writeFileSync(frontendEnvFile, [
  'VITE_TRANSLATION_API_URL=http://localhost:8787/translate-items',
  `VITE_TRANSLATION_ACCESS_TOKEN=${token}`,
  '',
].join('\n'));

console.log('Local translation token generated and configured in ignored environment files.');
console.log('Add your provider key to .dev.vars, then run worker:dev and dev.');
