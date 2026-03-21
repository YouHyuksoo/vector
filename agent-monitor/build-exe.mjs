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
const tailwindCss = readFileSync(join(__dirname, 'public/tailwind.css'), 'utf-8');
const fontsCss = readFileSync(join(__dirname, 'public/fonts/fonts.css'), 'utf-8');
const fontOutfitLatinExt = readFileSync(join(__dirname, 'public/fonts/outfit-latin-ext.woff2')).toString('base64');
const fontOutfitLatin = readFileSync(join(__dirname, 'public/fonts/outfit-latin.woff2')).toString('base64');
const fontFiracode = readFileSync(join(__dirname, 'public/fonts/firacode-latin.woff2')).toString('base64');
const fontMaterial = readFileSync(join(__dirname, 'public/fonts/material-symbols.woff2')).toString('base64');
console.log(`  → index.html: ${(indexHtml.length / 1024).toFixed(1)}KB`);
console.log(`  → app.js: ${(appJs.length / 1024).toFixed(1)}KB`);
console.log(`  → tailwind.css: ${(tailwindCss.length / 1024).toFixed(1)}KB`);
console.log(`  → fonts: 4 woff2 files embedded`);

// 3. esbuild로 단일 CJS 번들 생성 (public 파일 인라인 임베딩)
console.log('[2/5] Bundling with esbuild (CJS + embedded assets)...');
await build({
  entryPoints: [join(__dirname, 'src/server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node14',
  format: 'cjs',
  outfile: join(DIST, 'server.cjs'),
  external: [],
  minify: false,
  sourcemap: false,
  define: {
    'EMBEDDED_INDEX_HTML': JSON.stringify(indexHtml),
    'EMBEDDED_APP_JS': JSON.stringify(appJs),
    'EMBEDDED_TAILWIND_CSS': JSON.stringify(tailwindCss),
    'EMBEDDED_FONTS_CSS': JSON.stringify(fontsCss),
    'EMBEDDED_FONT_OUTFIT_LATIN_EXT': JSON.stringify(fontOutfitLatinExt),
    'EMBEDDED_FONT_OUTFIT_LATIN': JSON.stringify(fontOutfitLatin),
    'EMBEDDED_FONT_FIRACODE': JSON.stringify(fontFiracode),
    'EMBEDDED_FONT_MATERIAL': JSON.stringify(fontMaterial),
    'import.meta.url': '__import_meta_url',
  },
  banner: {
    js: [
      '/* Node 14 polyfills for Win7 compatibility */',
      'var __import_meta_url = require("url").pathToFileURL(__filename).href;',
      '',
      '/* fetch polyfill */',
      'if(typeof globalThis.fetch==="undefined"){var _nf=require("node-fetch");globalThis.fetch=_nf.default||_nf;globalThis.Headers=_nf.Headers;globalThis.Request=_nf.Request;globalThis.Response=_nf.Response;}',
      '',
      '/* AbortController polyfill */',
      'if(typeof globalThis.AbortController==="undefined"){',
      '  var _AC=function(){this.signal={aborted:false,reason:undefined,addEventListener:function(){},removeEventListener:function(){},throwIfAborted:function(){if(this.aborted)throw this.reason;},onabort:null};var _s=this.signal;this.abort=function(r){_s.aborted=true;_s.reason=r||new Error("Aborted");if(_s.onabort)_s.onabort();};};',
      '  globalThis.AbortController=_AC;globalThis.AbortSignal=function(){};',
      '  globalThis.AbortSignal.timeout=function(ms){var c=new _AC();setTimeout(function(){c.abort(new Error("TimeoutError"));},ms);return c.signal;};',
      '}else if(typeof AbortSignal.timeout==="undefined"){',
      '  AbortSignal.timeout=function(ms){var c=new AbortController();setTimeout(function(){c.abort();},ms);return c.signal;};',
      '}',
      '',
      '/* structuredClone polyfill */',
      'if(typeof globalThis.structuredClone==="undefined"){globalThis.structuredClone=function(v){return JSON.parse(JSON.stringify(v));};}',
      '',
      '/* diagnostics_channel.tracingChannel polyfill (Fastify 5 needs Node 20+) */',
      'try{var _dc=require("diagnostics_channel");if(typeof _dc.tracingChannel==="undefined"){_dc.tracingChannel=function(n){var _ch=function(){return{hasSubscribers:false,publish:function(){},subscribe:function(){},unsubscribe:function(){}};};return{start:_ch(),end:_ch(),asyncStart:_ch(),asyncEnd:_ch(),error:_ch(),subscribe:function(){},unsubscribe:function(){},traceSync:function(fn,ctx){return fn.apply(ctx);},tracePromise:function(fn,ctx){return fn.apply(ctx);},traceCallback:function(fn,ctx){return fn.apply(ctx);}};};}}catch(e){}',
      '',
      '(async () => {',
    ].join('\n'),
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

// 6. win7 — Node 14 x64 + server.cjs zip → Win7+ 64비트
console.log('[4/5] Packaging win7 (node14-x64 zip)...');
const nodeWin7Path = join(DIST, 'node-win7.exe');
try {
  if (!existsSync(nodeWin7Path)) {
    console.log(`  → Downloading Node.js v${NODE_VERSION} x64 from nodejs.org...`);
    await download(`https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`, nodeWin7Path);
    console.log('  → node-win7.exe downloaded');
  } else {
    console.log('  → node-win7.exe already cached');
  }
  const win7Bat = ['@echo off', 'cd /d "%~dp0"', 'node-win7.exe server.cjs %*'].join('\r\n');
  writeFileSync(join(DIST, 'agent-manager-win7.bat'), win7Bat);
  execSync(
    `zip -j ${join(DIST, 'agent-manager-win7.zip')} ${nodeWin7Path} ${join(DIST, 'server.cjs')} ${join(DIST, 'agent-manager-win7.bat')} ${join(DIST, '.env')}`,
    { stdio: 'inherit', cwd: __dirname },
  );
  console.log('  → agent-manager-win7.zip created');
} catch (err) {
  console.error('win7 zip packaging failed:', err.message);
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

const NODE_VERSION = '14.21.3';
const nodeX86Url = `https://nodejs.org/dist/v${NODE_VERSION}/win-x86/node.exe`;
const nodeX86Path = join(DIST, 'node-x86.exe');

try {
  // 7-1. Node.js x86 바이너리 다운로드 (Node 14 = Win7 호환)
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

// 8. vector-bin/ 에 자동 복사 (서버 다운로드 API가 여기서 서빙)
const VECTOR_BIN = join(__dirname, '..', 'vector-bin');
if (existsSync(VECTOR_BIN)) {
  cpSync(join(DIST, 'agent-manager-x64.exe'), join(VECTOR_BIN, 'agent-manager-x64.exe'));
  cpSync(join(DIST, 'agent-manager-win7.zip'), join(VECTOR_BIN, 'agent-manager-win7.zip'));
  cpSync(join(DIST, 'agent-manager-x86.zip'), join(VECTOR_BIN, 'agent-manager-x86.zip'));
  console.log('[8/8] Copied to vector-bin/ (server download)');
}

console.log('\nDone!');
console.log(`  agent-manager-x64.exe  → Win10+ 64비트 (단일 exe)`);
console.log(`  agent-manager-win7.zip → Win7+  64비트 (zip: node14 + server.cjs + bat)`);
console.log(`  agent-manager-x86.zip  → 32비트 (zip: node14-x86 + server.cjs + bat)`);
