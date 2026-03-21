const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'vector-config', 'agent');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.toml') && !f.endsWith('.bak.toml'));

for (const f of files) {
  const fp = path.join(dir, f);
  let c = fs.readFileSync(fp, 'utf-8');

  // Step 1: "C:\\path" → 'C:\path' (basic string → literal string)
  c = c.replace(/"(C:\\\\[^"]+)"/g, function(match, inner) {
    return "'" + inner.replace(/\\\\/g, '\\') + "'";
  });

  // Step 2: already single-quoted but still has \\ → clean up
  c = c.replace(/'(C:\\[^']+)'/g, function(match, inner) {
    return "'" + inner.replace(/\\\\/g, '\\') + "'";
  });

  fs.writeFileSync(fp, c, 'utf-8');
  console.log('Fixed:', f);
}
console.log('Done!');
