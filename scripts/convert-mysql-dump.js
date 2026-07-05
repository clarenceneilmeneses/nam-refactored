// Converts the legacy MySQL (phpMyAdmin) dump to Postgres SQL for Supabase.
// Data tables only — users/roles/permissions/role_permissions are kept as-is.
const fs = require('fs')

const DUMP = 'D:/Users/Huawei/Downloads/u476854436_nam (3).sql'
const OUT = 'D:/Users/Huawei/Downloads/nam_data_postgres.sql'

const TABLES = ['products', 'clients', 'company_assignments', 'quotations', 'sales', 'system_logs']
const BOOL_COLS = new Set(['is_draft', 'is_reserved'])
// DATE columns: zero-date -> NULL. TS columns: zero -> NULL, else tag +08 (legacy server stored Manila wall-clock).
const DATE_COLS = new Set(['date', 'date_delivered', 'due_date'])
const TS_COLS = new Set(['created_at', 'date_paid'])

const text = fs.readFileSync(DUMP, 'utf8')

const UNESC = { n: '\n', r: '\r', t: '\t', '0': '\0', b: '\b', Z: '\x1a', '\\': '\\', "'": "'", '"': '"', '%': '\\%', _: '\\_' }

function parseTuples(s) {
  const rows = []
  let i = 0
  const n = s.length
  while (i < n) {
    while (i < n && s[i] !== '(') i++
    if (i >= n) break
    i++
    const vals = []
    while (i < n) {
      const c = s[i]
      if (c === "'") {
        let str = ''
        i++
        while (i < n) {
          const ch = s[i]
          if (ch === '\\') {
            const nx = s[i + 1]
            str += UNESC[nx] !== undefined ? UNESC[nx] : nx
            i += 2
            continue
          }
          if (ch === "'") {
            if (s[i + 1] === "'") {
              str += "'"
              i += 2
              continue
            }
            i++
            break
          }
          str += ch
          i++
        }
        vals.push({ t: 's', v: str })
      } else if (c === ',') i++
      else if (c === ')') {
        i++
        rows.push(vals)
        break
      } else if (/\s/.test(c)) i++
      else {
        let j = i
        while (j < n && s[j] !== ',' && s[j] !== ')') j++
        const raw = s.slice(i, j).trim()
        vals.push(raw.toUpperCase() === 'NULL' ? { t: 'null' } : { t: 'n', v: raw })
        i = j
      }
    }
  }
  return rows
}

// Collect rows per table across all extended INSERT statements.
const data = Object.fromEntries(TABLES.map((t) => [t, { cols: null, rows: [] }]))
const re = /INSERT INTO `(\w+)` \(([^)]*)\) VALUES\s*/g
let m
while ((m = re.exec(text)) !== null) {
  const table = m[1]
  // Find the end of this statement: first ';' outside a quoted string.
  let i = re.lastIndex
  let inStr = false
  while (i < text.length) {
    const c = text[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === "'") inStr = false
    } else if (c === "'") inStr = true
    else if (c === ';') break
    i++
  }
  if (data[table]) {
    data[table].cols = m[2].split(',').map((c) => c.trim().replace(/`/g, ''))
    data[table].rows.push(...parseTuples(text.slice(re.lastIndex, i)))
  }
  re.lastIndex = i + 1
}

const q = (s) => `'${s.replace(/'/g, "''")}'`
const isZeroDate = (s) => /^0000-00-00/.test(s)

function emitValue(col, val) {
  if (val.t === 'null') return 'NULL'
  if (BOOL_COLS.has(col)) return val.v === '0' || val.v === 0 ? 'FALSE' : 'TRUE'
  if (val.t === 'n') return val.v
  if (DATE_COLS.has(col)) return isZeroDate(val.v) ? 'NULL' : q(val.v)
  if (TS_COLS.has(col)) return isZeroDate(val.v) ? 'NULL' : q(`${val.v}+08`)
  return q(val.v)
}

const out = []
out.push('-- Legacy MySQL -> Postgres data load (generated from u476854436_nam (3).sql)')
out.push('-- Data tables only; users/roles/permissions are untouched.')
out.push('BEGIN;')
out.push(`TRUNCATE TABLE ${TABLES.join(', ')};`)
for (const table of TABLES) {
  const { cols, rows } = data[table]
  if (!cols || rows.length === 0) {
    out.push(`-- ${table}: no rows in dump`)
    continue
  }
  out.push(`-- ${table}: ${rows.length} rows`)
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const values = chunk.map((r) => `(${r.map((v, ci) => emitValue(cols[ci], v)).join(',')})`).join(',\n')
    out.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${values};`)
  }
  if (cols.includes('id')) {
    out.push(`SELECT setval(pg_get_serial_sequence('public.${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1));`)
  }
}
out.push('COMMIT;')
fs.writeFileSync(OUT, out.join('\n'), 'utf8')

// Also split into <=800KB parts for the Supabase SQL editor (run in order).
// Statements between BEGIN/COMMIT (out[2] and last) are order-dependent but
// individually atomic enough: each part gets its own transaction.
const statements = out.slice(3, -1) // skip header comments/BEGIN, drop COMMIT
const LIMIT = 800 * 1024
const parts = []
let cur = []
let curSize = 0
for (const st of statements) {
  if (curSize + st.length > LIMIT && cur.length > 0) {
    parts.push(cur)
    cur = []
    curSize = 0
  }
  cur.push(st)
  curSize += st.length
}
if (cur.length) parts.push(cur)
const partFiles = parts.map((p, i) => {
  const file = `D:/Users/Huawei/Downloads/nam_data_postgres_part${i + 1}_of_${parts.length}.sql`
  fs.writeFileSync(file, `-- Part ${i + 1}/${parts.length} — run parts strictly in order.\nBEGIN;\n${p.join('\n')}\nCOMMIT;`, 'utf8')
  return file
})

// Report + sanity check: July 2026 revenue should match the old system.
const report = { outFile: OUT, outSizeKB: Math.round(fs.statSync(OUT).size / 1024), partFiles }
for (const t of TABLES) report[t] = data[t].rows.length
const s = data.sales
if (s.cols) {
  const di = s.cols.indexOf('date')
  const ni = s.cols.indexOf('total_nam_amount')
  let julyNam = 0
  let julyRows = 0
  for (const r of s.rows) {
    if (r[di].t === 's' && r[di].v.startsWith('2026-07')) {
      julyRows++
      if (r[ni].t !== 'null') julyNam += parseFloat(r[ni].v)
    }
  }
  report.july2026 = { rows: julyRows, total_nam_amount: Math.round(julyNam * 100) / 100 }
}
console.log(JSON.stringify(report, null, 2))
