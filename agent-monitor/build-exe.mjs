/**
 * @file build-exe.mjs
 * @description agent-monitor를 단일 exe로 패키징하는 빌드 스크립트
 *
 * 초보자 가이드:
 * 1. public/index.html과 public/app.js를 JS 상수로 인라인 임베딩
 * 2. esbuild로 모든 소스+의존성을 하나의 CJS 파일로 번들링
 * 3. async IIFE로 감싸서 top-level await 지원
 * 4. pkg로 Node.js 런타임 포함 단일 exe 생성
 * 5. 결과: agent-manager.exe 하나만으로 실행 가능 (server.mjs, public/ 불필요)
 */

import { build } from 'esbuild';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist-exe');

// 1. dist-exe 디렉토리 생성
if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

// 2. public 파일을 읽어서 JS 상수로 임베딩 준비
console.log('[1/3] Reading public assets for embedding...');
const indexHtml = readFileSync(join(__dirname, 'public/index.html'), 'utf-8');
const appJs = readFileSync(join(__dirname, 'public/app.js'), 'utf-8');
console.log(`  → index.html: ${(indexHtml.length / 1024).toFixed(1)}KB`);
console.log(`  → app.js: ${(appJs.length / 1024).toFixed(1)}KB`);

// 3. esbuild로 단일 CJS 번들 생성 (public 파일 인라인 임베딩)
console.log('[2/3] Bundling with esbuild (CJS + embedded assets)...');
await build({
  entryPoints: [join(__dirname, 'src/server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: join(DIST, 'server.cjs'),
  external: [],
  minify: false,
  sourcemap: false,
  define: {
    'EMBEDDED_INDEX_HTML': JSON.stringify(indexHtml),
    'EMBEDDED_APP_JS': JSON.stringify(appJs),
  },
  banner: {
    js: '(async () => {',
  },
  footer: {
    js: [
      '})().catch(err => {',
      '  console.error("\\n========================================");',
      '  console.error("  Agent Manager 시작 실패:");',
      '  console.error("========================================");',
      '  console.error(err);',
      '  console.error("\\n  이 창은 30초 후 자동으로 닫힙니다.");',
      '  setTimeout(() => process.exit(1), 30000);',
      '});',
    ].join('\n'),
  },
});
console.log('  → dist-exe/server.cjs created (self-contained)');

// 4. .env.example 복사 (선택적)
const envSrc = join(__dirname, '.env.example');
const envDst = join(DIST, '.env');
if (existsSync(envSrc)) {
  cpSync(envSrc, envDst);
  console.log('  → .env copied from .env.example');
}

// 5. pkg로 exe 생성
console.log('[3/3] Packaging with pkg...');
try {
  execSync(
    `npx pkg ${join(DIST, 'server.cjs')} --targets node20-win-x64 --output ${join(DIST, 'agent-manager.exe')} --compress GZip`,
    { stdio: 'inherit', cwd: __dirname },
  );
  console.log('\nDone!');
  console.log(`  Output: ${join(DIST, 'agent-manager.exe')}`);
  console.log('  Deploy: agent-manager.exe 하나만 설비 PC에 복사하면 됩니다');
  console.log('  (선택) .env 파일로 환경변수를 커스텀할 수 있습니다');
} catch (err) {
  console.error('pkg failed:', err.message);
  process.exit(1);
}
