/**
 * @file build-exe.mjs
 * @description agent-monitor를 단일 exe로 패키징하는 빌드 스크립트
 *
 * 초보자 가이드:
 * 1. esbuild로 모든 소스+의존성을 하나의 ESM 파일로 번들링
 * 2. CJS 래퍼로 감싸서 pkg 호환 파일 생성
 * 3. pkg로 Node.js 런타임 포함 단일 exe 생성
 * 4. 실행: node build-exe.mjs
 */

import { build } from 'esbuild';
import { execSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist-exe');

// 1. dist-exe 디렉토리 생성
if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

// 2. esbuild로 단일 ESM 번들 생성 (top-level await 지원)
console.log('[1/4] Bundling with esbuild (ESM)...');
await build({
  entryPoints: [join(__dirname, 'src/server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: join(DIST, 'server.mjs'),
  external: [],
  minify: false,
  sourcemap: false,
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});
console.log('  → dist-exe/server.mjs created');

// 3. CJS 래퍼 생성 (pkg가 CJS만 지원)
console.log('[2/4] Creating CJS wrapper...');
const wrapper = `
const { pathToFileURL } = require('url');
const entryPath = require('path').join(__dirname, 'server.mjs');
import(pathToFileURL(entryPath).href).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
`;
writeFileSync(join(DIST, 'entry.cjs'), wrapper.trim(), 'utf-8');
console.log('  → dist-exe/entry.cjs created');

// 4. public 디렉토리 복사 (exe 옆에 배치)
const publicSrc = join(__dirname, 'public');
const publicDst = join(DIST, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDst, { recursive: true });
  console.log('  → public/ copied');
}

// 5. .env.example 복사
const envSrc = join(__dirname, '.env.example');
const envDst = join(DIST, '.env');
if (existsSync(envSrc)) {
  cpSync(envSrc, envDst);
  console.log('  → .env copied from .env.example');
}

// 6. pkg로 exe 생성
console.log('[3/4] Packaging with pkg...');
try {
  execSync(
    `npx pkg ${join(DIST, 'entry.cjs')} --targets node20-win-x64 --output ${join(DIST, 'agent-monitor.exe')} --compress GZip`,
    { stdio: 'inherit', cwd: __dirname },
  );
  console.log('[4/4] Done!');
  console.log(`\n  Output: ${DIST}`);
  console.log('  Files:  agent-monitor.exe + server.mjs + public/ + .env');
  console.log('  Deploy: 위 파일들을 장비 PC에 복사 후 agent-monitor.exe 실행');
} catch (err) {
  console.error('pkg failed:', err.message);
  process.exit(1);
}
