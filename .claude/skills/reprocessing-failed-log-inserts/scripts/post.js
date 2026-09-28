// 로그서버에서 실행: 추출한 레코드 중 DB에 없는 파일만 시간순으로 POST /api/logs 재투입한다.
// 사용: node post.js <args.json>   args: { table, tsCols, outDir, batch }
// 입력: <outDir>/<table>_todo.json, <outDir>/<table>_existing.json (["EQUIPMENT_ID/FILE_NAME", ...])
const fs = require('fs'), path = require('path');
const a = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rowsOf = o => (o.data && Array.isArray(o.data.ROWS)) ? o.data.ROWS : [o.data || {}];
const ts = o => a.tsCols.map(c => rowsOf(o)[0][c] || '').join(' ').trim();

(async () => {
  const all = JSON.parse(fs.readFileSync(path.join(a.outDir, `${a.table}_todo.json`), 'utf8'));
  const ex = new Set(JSON.parse(fs.readFileSync(path.join(a.outDir, `${a.table}_existing.json`), 'utf8')));
  // 시간순 정렬: 같은 바코드의 재검사가 IS_LAST 트리거에 과거→최신 순으로 들어가게 한다
  const todo = all.filter(o => !ex.has(o.equipment_id + '/' + o.filename)).sort((x, y) => ts(x) < ts(y) ? -1 : ts(x) > ts(y) ? 1 : 0);
  console.log(`todo ${todo.length} (skip existing ${all.length - todo.length}) range [${todo.length ? ts(todo[0]) : ''}] ~ [${todo.length ? ts(todo[todo.length - 1]) : ''}]`);
  let ok = 0, fail = 0; const t0 = Date.now(), B = a.batch || 20;
  for (let i = 0; i < todo.length; i += B) {
    const batch = todo.slice(i, i + B);
    try {
      const res = await fetch('http://localhost:3110/api/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch) });
      if (res.ok) ok += batch.length; else { fail += batch.length; console.log('HTTP', res.status, (await res.text()).slice(0, 200)); }
    } catch (e) { fail += batch.length; console.log('ERR', String(e).slice(0, 200)); }
    if (i % (B * 100) === 0) console.log(`progress ${i}/${todo.length} ok ${ok} fail ${fail} ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  console.log(`DONE ok ${ok} fail ${fail} ${Math.round((Date.now() - t0) / 1000)}s`);
})();
