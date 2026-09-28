// 로그서버에서 실행: process-logs JSONL을 스트리밍으로 읽어 재처리 대상(연결 실패 ERROR)을 추출한다.
// 사용: node collect.js <args.json>
//   args: { table, from, to, errorRegex, excludeFilename, keyCols, tsCols, outDir }
// 출력: <outDir>/<table>_todo.json (POST할 레코드, raw_message 제거), <outDir>/<table>_keys.json (DB 대조용 요약)
const fs = require('fs'), rl = require('readline'), path = require('path');
const a = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const DIR = 'C:/Project/vector/data/process-logs/';
const errRe = new RegExp(a.errorRegex);
const exRe = a.excludeFilename ? new RegExp(a.excludeFilename, 'i') : null;
const tableTag = `"SOURCE_TABLE":"${a.table}"`;

function* days(from, to) {
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1))
    yield d.toISOString().slice(0, 10);
}
const rowsOf = o => (o.data && Array.isArray(o.data.ROWS)) ? o.data.ROWS : [o.data || {}];
const bad = v => v == null || v === '' || String(v).toUpperCase() === 'NULL';

(async () => {
  const todo = new Map(), eq = {}, other = {}, byDay = {};
  const cnt = { matched: 0, noRaw: 0, dupFile: 0, excluded: 0 };
  for (const day of days(a.from, a.to)) {
    const f = DIR + `process-${day}.jsonl`;
    if (!fs.existsSync(f)) continue;
    for await (const l of rl.createInterface({ input: fs.createReadStream(f, 'utf8'), crlfDelay: Infinity })) {
      if (!l.includes(tableTag) || !l.includes('"STATUS":"ERROR"')) continue;
      let r; try { r = JSON.parse(l); } catch { continue; }
      const m = r.MESSAGE || '';
      if (!errRe.test(m)) { const k = m.slice(0, 100); other[k] = (other[k] || 0) + 1; continue; }
      cnt.matched++; byDay[day] = (byDay[day] || 0) + 1;
      let o; try { o = JSON.parse(r.RAW_DATA); } catch { cnt.noRaw++; continue; }
      if (!o || !o.data) { cnt.noRaw++; continue; }
      if (exRe && exRe.test(o.filename || '')) { cnt.excluded++; continue; }
      const k = o.equipment_id + '/' + o.filename;
      if (todo.has(k)) { cnt.dupFile++; continue; }
      delete o.raw_message; // raw 파일 재기록 방지 (saveRawLogFile은 raw_message 없으면 skip)
      todo.set(k, o); eq[o.equipment_id] = (eq[o.equipment_id] || 0) + 1;
    }
  }
  const arr = [...todo.values()];
  const keys = arr.map(o => {
    const rows = rowsOf(o);
    const ks = [...new Set(rows.map(x => a.keyCols.map(c => x[c]))
      .filter(v => !v.some(bad)).map(v => JSON.stringify(v)))].map(s => JSON.parse(s));
    const ts = a.tsCols.map(c => rows[0][c] || '').join(' ').trim();
    return { e: o.equipment_id, f: o.filename, n: rows.length, k: ks, ts };
  });
  fs.mkdirSync(a.outDir, { recursive: true });
  fs.writeFileSync(path.join(a.outDir, `${a.table}_todo.json`), JSON.stringify(arr));
  fs.writeFileSync(path.join(a.outDir, `${a.table}_keys.json`), JSON.stringify(keys));
  console.log(JSON.stringify({ ...cnt, files: arr.length, rows: keys.reduce((s, k) => s + k.n, 0), byDay, byEquipment: eq }));
  console.log('NON-MATCHED ERRORS (재처리 제외):', JSON.stringify(other));
})();
