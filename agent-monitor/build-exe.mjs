/**
 * @file build-exe.mjs
 * @description agent-monitor를 단일 exe로 패키징하는 빌드 스크립트
 *
 * 초보자 가이드:
 * 1. public/index.html과 public/app.js를 JS 상수로 인라인 임베딩
 * 2. esbuild로 모든 소스+의존성을 하나의 CJS 파일로 번들링
 * 3. async IIFE로 감싸서 top-level await 지원
 * 4. x64: pkg(node20) → Win10+ 64비트
 * 5. win7: pkg(node16) → Win7+ 64비트
 * 6. x86: node-x86.exe + server.cjs zip → 32비트
 * 7. 결과: agent-manager-x64.exe, agent-manager-win7.exe, agent-manager-x86.zip
 */

import { build } from 'esbuild';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist-exe');

// 1. dist-exe 디렉토리 생성
if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

// 2. public 파일을 읽어서 JS 상수로 임베딩 준비
console.log('[1/5] Reading public assets for embedding...');
const indexHtml = readFileSync(join(__dirname, 'public/index.html'), 'utf-8');
const appJs = readFileSync(join(__dirname, 'public/app.js'), 'utf-8');
console.log(`  → index.html: ${(indexHtml.length / 1024).toFixed(1)}KB`);
console.log(`  → app.js: ${(appJs.length / 1024).toFixed(1)}KB`);

// 3. esbuild로 단일 CJS 번들 생성 (public 파일 인라인 임베딩)
console.log('[2/5] Bundling with esbuild (CJS + embedded assets)...');
await build({
  entryPoints: [join(__dirname, 'src/server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node16',
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

// 5. x64 — pkg(node20) → Win10+ 64비트
console.log('[3/5] Packaging x64 (node20, Win10+)...');
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

// 6. win7 — pkg(node16) → Win7+ 64비트
console.log('[4/5] Packaging win7 (node16, Win7+)...');
try {
  execSync(
    `npx pkg ${join(DIST, 'server.cjs')} --targets node16-win-x64 --output ${join(DIST, 'agent-manager-win7.exe')} --compress GZip`,
    { stdio: 'inherit', cwd: __dirname },
  );
  console.log('  → agent-manager-win7.exe created');
} catch (err) {
  console.error('pkg failed (win7):', err.message);
  process.exit(1);
}

// 7. x86 — Node.js x86 바이너리 + server.cjs + 런처 bat을 zip으로 패키징
console.log('[5/5] Packaging x86 (node-x86 + server.cjs zip)...');

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

const NODE_VERSION = '16.20.2';
const nodeX86Url = `https://nodejs.org/dist/v${NODE_VERSION}/win-x86/node.exe`;
const nodeX86Path = join(DIST, 'node-x86.exe');

try {
  // 7-1. Node.js x86 바이너리 다운로드 (Node 16 = Win7 호환)
  if (!existsSync(nodeX86Path)) {
    console.log(`  → Downloading Node.js v${NODE_VERSION} x86 from nodejs.org...`);
    await download(nodeX86Url, nodeX86Path);
    console.log('  → node-x86.exe downloaded');
  } else {
    console.log('  → node-x86.exe already cached');
  }

  // 7-2. 런처 bat 생성
  const launcherBat = [
    '@echo off',
    'cd /d "%~dp0"',
    'node-x86.exe server.cjs %*',
  ].join('\r\n');
  writeFileSync(join(DIST, 'agent-manager.bat'), launcherBat);

  // 7-3. zip 생성 (node-x86.exe + server.cjs + agent-manager.bat + .env)
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
console.log(`  agent-manager-x64.exe  → Win10+ 64비트 (단일 exe)`);
console.log(`  agent-manager-win7.exe → Win7+  64비트 (단일 exe)`);
console.log(`  agent-manager-x86.zip  → 32비트 (zip: node-x86 + server.cjs + bat)`);
