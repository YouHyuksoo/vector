/**
 * @file build-exe.mjs
 * @description agent-monitor를 단일 exe로 패키징하는 빌드 스크립트
 *
 * 초보자 가이드:
 * 1. public/index.html과 public/app.js를 JS 상수로 인라인 임베딩
 * 2. esbuild로 모든 소스+의존성을 하나의 CJS 파일로 번들링
 * 3. async IIFE로 감싸서 top-level await 지원
 * 4. x64: pkg로 Node.js 런타임 포함 단일 exe 생성
 * 5. x86: Node.js SEA(Single Executable Application) 방식으로 32비트 exe 생성
 * 6. 결과: agent-manager-x64.exe, agent-manager-x86.exe
 */

import { build } from 'esbuild';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, createWriteStream, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist-exe');

// 1. dist-exe 디렉토리 생성
if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

// 2. public 파일을 읽어서 JS 상수로 임베딩 준비
console.log('[1/4] Reading public assets for embedding...');
const indexHtml = readFileSync(join(__dirname, 'public/index.html'), 'utf-8');
const appJs = readFileSync(join(__dirname, 'public/app.js'), 'utf-8');
console.log(`  → index.html: ${(indexHtml.length / 1024).toFixed(1)}KB`);
console.log(`  → app.js: ${(appJs.length / 1024).toFixed(1)}KB`);

// 3. esbuild로 단일 CJS 번들 생성 (public 파일 인라인 임베딩)
console.log('[2/4] Bundling with esbuild (CJS + embedded assets)...');
await build({
  entryPoints: [join(__dirname, 'src/server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: join(DIST, 'server.cjs'),
  external: [],
  minify: false,
  sourcemap: false,
  define: {
    'EMBEDDED_INDEX_HTML': JSON.stringify(indexHtml),
    'EMBEDDED_APP_JS': JSON.stringify(appJs),
    'import.meta.url': '__import_meta_url',
  },
  banner: {
    js: 'var __import_meta_url = require("url").pathToFileURL(__filename).href;\n(async () => {',
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

// 5. x64 — pkg로 exe 생성
console.log('[3/4] Packaging x64 with pkg...');
try {
  execSync(
    `npx pkg ${join(DIST, 'server.cjs')} --targets node20-win-x64 --output ${join(DIST, 'agent-manager-x64.exe')} --compress GZip`,
    { stdio: 'inherit', cwd: __dirname },
  );
  console.log('  → agent-manager-x64.exe created');
} catch (err) {
  console.error('pkg failed (x64):', err.message);
  process.exit(1);
}

// 6. x86 — Node.js x86 바이너리 + server.cjs + 런처 bat을 zip으로 패키징
console.log('[4/4] Packaging x86 (node-x86 + server.cjs zip)...');

/** HTTPS 파일 다운로드 (리다이렉트 지원) */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const request = (u) => {
      get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Download failed: ${res.statusCode} for ${u}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', reject);
    };
    request(url);
  });
}

const NODE_VERSION = '20.19.0';
const nodeX86Url = `https://nodejs.org/dist/v${NODE_VERSION}/win-x86/node.exe`;
const nodeX86Path = join(DIST, 'node-x86.exe');

try {
  // 6-1. Node.js x86 바이너리 다운로드
  if (!existsSync(nodeX86Path)) {
    console.log(`  → Downloading Node.js v${NODE_VERSION} x86 from nodejs.org...`);
    await download(nodeX86Url, nodeX86Path);
    console.log('  → node-x86.exe downloaded');
  } else {
    console.log('  → node-x86.exe already cached');
  }

  // 6-2. 런처 bat 생성
  const launcherBat = [
    '@echo off',
    'cd /d "%~dp0"',
    'node-x86.exe server.cjs %*',
  ].join('\r\n');
  writeFileSync(join(DIST, 'agent-manager.bat'), launcherBat);

  // 6-3. zip 생성 (node-x86.exe + server.cjs + agent-manager.bat + .env)
  execSync(
    `zip -j ${join(DIST, 'agent-manager-x86.zip')} ${join(DIST, 'node-x86.exe')} ${join(DIST, 'server.cjs')} ${join(DIST, 'agent-manager.bat')} ${join(DIST, '.env')}`,
    { stdio: 'inherit', cwd: __dirname },
  );
  console.log('  → agent-manager-x86.zip created');
} catch (err) {
  console.error('x86 zip packaging failed:', err.message);
  process.exit(1);
}

console.log('\nDone!');
console.log(`  Output: ${join(DIST, 'agent-manager-x64.exe')} (단일 exe)`);
console.log(`  Output: ${join(DIST, 'agent-manager-x86.zip')} (zip: node-x86.exe + server.cjs + agent-manager.bat)`);
console.log('  Deploy: x64는 exe 하나만, x86은 zip을 압축해제 후 agent-manager.bat 실행');
console.log('  (선택) .env 파일로 환경변수를 커스텀할 수 있습니다');
