// Browser-side port of scripts/convert-mysql-dump.cjs: parses the raw
// Hostinger/phpMyAdmin .sql dump of the legacy MySQL database and produces
// JSON rows ready for the legacy_restore_* RPCs (18_legacy_restore.sql).
// The conversion rules are identical to the script's:
//   * zero dates ('0000-00-00'…) -> null
//   * 0/1 flags (is_draft, is_reserved) -> booleans
//   * legacy timestamps get '+08' (the old server stored Manila wall-clock)
//   * typo dates that would violate the 10_sane_dates.sql CHECKs are repaired
//     (mistyped year borrows the row's sale date; Excel-garbage due dates are
//     recomputed from date_delivered + payment term) or nulled

/** JSON scalar accepted by legacy_restore_stage; Postgres casts the strings. */
export type LegacyValue = string | number | boolean | null
export type LegacyRow = Record<string, LegacyValue>

export type LegacyTable = { columns: string[]; rows: LegacyRow[] }

export type LegacyDump = {
  /** Only tables present in the dump appear here. */
  tables: Partial<Record<LegacyTableName, LegacyTable>>
  /** Human-readable log of repaired/nulled typo dates. */
  dateFixes: string[]
  /** 'YYYY-MM' -> sales rows + total_nam_amount for that month (sync check). */
  salesByMonth: Map<string, { rows: number; totalNam: number }>
}

export const LEGACY_TABLES = [
  'products',
  'clients',
  'company_assignments',
  'quotations',
  'sales',
  'system_logs',
] as const
export type LegacyTableName = (typeof LEGACY_TABLES)[number]

const BOOL_COLS = new Set(['is_draft', 'is_reserved'])
const DATE_COLS = new Set(['date', 'date_delivered', 'due_date'])
const TS_COLS = new Set(['created_at', 'date_paid'])

const UNESC: Record<string, string> = {
  n: '\n', r: '\r', t: '\t', '0': '\0', b: '\b', Z: '\x1a',
  '\\': '\\', "'": "'", '"': '"', '%': '\\%', _: '\\_',
}

type Token = { t: 's'; v: string } | { t: 'n'; v: string } | { t: 'null' }

/** Parses the (…),(…),… tuple list of one extended INSERT statement. */
function parseTuples(s: string): Token[][] {
  const rows: Token[][] = []
  let i = 0
  const n = s.length
  while (i < n) {
    while (i < n && s[i] !== '(') i++
    if (i >= n) break
    i++
    const vals: Token[] = []
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

const isZeroDate = (s: string) => /^0000-00-00/.test(s)
const saneDate = (s: string) => s.slice(0, 10) >= '2000-01-01' && s.slice(0, 10) < '2100-01-01'

const termDays = (t: string | null) => {
  const m = String(t ?? '').match(/\d+/)
  if (m) return parseInt(m[0], 10)
  return /cod|cash/i.test(String(t ?? '')) ? 0 : 30
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Repairs legacy typo dates in place (same rules as the script) and returns
 * a log line per touched cell.
 */
function repairDates(table: string, cols: string[], rows: Token[][], fixes: string[]) {
  const dateIdx = cols.map((c, i) => (DATE_COLS.has(c) || TS_COLS.has(c) ? i : -1)).filter((i) => i >= 0)
  if (dateIdx.length === 0) return
  const iDate = cols.indexOf('date')
  const iDeliv = cols.indexOf('date_delivered')
  const iTerm = cols.indexOf('payment_term')
  const iCreated = cols.indexOf('created_at')
  const iId = cols.indexOf('id')
  for (const r of rows) {
    const refYear = (skip: number) => {
      for (const i of [iDate, iCreated]) {
        const cell = i >= 0 && i !== skip ? r[i] : undefined
        if (cell && cell.t === 's' && !isZeroDate(cell.v) && saneDate(cell.v)) return cell.v.slice(0, 4)
      }
      return null
    }
    for (const ci of dateIdx) {
      const v = r[ci]
      if (v.t !== 's' || isZeroDate(v.v) || saneDate(v.v)) continue
      const col = cols[ci]
      let fixed: string | null = null
      if (parseInt(v.v.slice(0, 4), 10) < 1000) {
        const y = refYear(ci)
        if (y) fixed = y + v.v.slice(4)
      }
      if (!fixed && col === 'due_date' && iDeliv >= 0) {
        const deliv = r[iDeliv]
        if (deliv.t === 's' && !isZeroDate(deliv.v) && saneDate(deliv.v)) {
          const termTok = iTerm >= 0 ? r[iTerm] : undefined
          fixed = addDays(deliv.v, termDays(termTok && termTok.t === 's' ? termTok.v : null))
        }
      }
      const idTok = iId >= 0 ? r[iId] : undefined
      fixes.push(`${table} id=${idTok && idTok.t !== 'null' ? idTok.v : '?'} ${col}: ${v.v} -> ${fixed ?? 'NULL'}`)
      if (fixed && saneDate(fixed)) v.v = fixed
      else r[ci] = { t: 'null' }
    }
  }
}

function toValue(col: string, val: Token): LegacyValue {
  if (val.t === 'null') return null
  if (BOOL_COLS.has(col)) return val.v !== '0'
  if (val.t === 'n') return val.v // numeric literal; Postgres casts the string
  if (DATE_COLS.has(col)) return isZeroDate(val.v) ? null : val.v
  if (TS_COLS.has(col)) return isZeroDate(val.v) ? null : `${val.v}+08`
  return val.v
}

/**
 * Parses a full phpMyAdmin dump. Throws with a readable message when the file
 * contains none of the known data tables (wrong file, or a structure-only
 * export without data).
 */
export function parseLegacyDump(text: string): LegacyDump {
  const data = {} as Record<LegacyTableName, { cols: string[] | null; rows: Token[][] }>
  for (const t of LEGACY_TABLES) data[t] = { cols: null, rows: [] }

  const re = /INSERT INTO `(\w+)` \(([^)]*)\) VALUES\s*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const table = m[1] as LegacyTableName
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

  const dateFixes: string[] = []
  const tables: Partial<Record<LegacyTableName, LegacyTable>> = {}
  for (const name of LEGACY_TABLES) {
    const { cols, rows } = data[name]
    if (!cols || rows.length === 0) continue
    repairDates(name, cols, rows, dateFixes)
    tables[name] = {
      columns: cols,
      rows: rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, toValue(c, r[i] ?? { t: 'null' })]))),
    }
  }

  if (Object.keys(tables).length === 0) {
    throw new Error(
      'No data for the known tables found in this file. Export the database from phpMyAdmin with data (not structure-only) and try again.',
    )
  }

  // Monthly sales aggregates for the sync check against the live database.
  const salesByMonth = new Map<string, { rows: number; totalNam: number }>()
  for (const row of tables.sales?.rows ?? []) {
    const date = row.date
    if (typeof date !== 'string') continue
    const month = date.slice(0, 7)
    const entry = salesByMonth.get(month) ?? { rows: 0, totalNam: 0 }
    entry.rows++
    const nam = row.total_nam_amount
    if (nam !== null && nam !== undefined) {
      const n = parseFloat(String(nam))
      if (Number.isFinite(n)) entry.totalNam += n
    }
    entry.totalNam = Math.round(entry.totalNam * 100) / 100
    salesByMonth.set(month, entry)
  }

  return { tables, dateFixes, salesByMonth }
}
