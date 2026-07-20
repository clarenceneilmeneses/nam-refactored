import { describe, expect, it } from 'vitest'
import { parseLegacyDump } from './legacyDump'

// A miniature phpMyAdmin dump exercising the tricky cases: extended INSERTs,
// escaped quotes/backslashes, semicolons inside strings, NULLs, zero dates,
// 0/1 flags, typo years, Excel-garbage due dates, and multiple INSERT
// statements for the same table.
const DUMP = `
-- phpMyAdmin SQL Dump
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";

CREATE TABLE \`products\` (\`id\` int(11) NOT NULL);

INSERT INTO \`products\` (\`id\`, \`name\`, \`supplier_price\`, \`is_draft\`) VALUES
(1, 'BOND PAPER A4', 250.00, 0),
(2, 'D\\'Best Mop; Large', 120.50, 1),
(3, 'Back\\\\slash "quoted"', NULL, 0);

INSERT INTO \`sales\` (\`id\`, \`date\`, \`item\`, \`total_nam_amount\`, \`date_delivered\`, \`payment_term\`, \`due_date\`, \`date_paid\`, \`created_at\`, \`is_reserved\`) VALUES
(10, '2026-07-01', 'ITEM A', 1000.00, '2026-07-02', '30 days', '0206-08-01', '0000-00-00 00:00:00', '2026-07-01 09:00:00', 0),
(11, '2026-07-15', 'ITEM B', 500.25, '2026-07-16', 'COD', '1900-01-29', NULL, '2026-07-15 10:30:00', 1),
(12, '2026-06-30', 'ITEM C', 200.00, '0000-00-00', '15 days', '0000-00-00', '2026-07-05 08:00:00', '2026-06-30 08:00:00', 0);

INSERT INTO \`sales\` (\`id\`, \`date\`, \`item\`, \`total_nam_amount\`, \`date_delivered\`, \`payment_term\`, \`due_date\`, \`date_paid\`, \`created_at\`, \`is_reserved\`) VALUES
(13, '2026-07-20', 'ITEM D', 99.75, NULL, NULL, NULL, NULL, '2026-07-20 11:00:00', 0);

INSERT INTO \`system_logs\` (\`id\`, \`user_id\`, \`action\`, \`description\`) VALUES
(1, 6, 'Created Sale', 'stmt; with semicolon and it''s doubled quote');
`

describe('parseLegacyDump', () => {
  const dump = parseLegacyDump(DUMP)

  it('collects rows across multiple INSERT statements per table', () => {
    expect(dump.tables.sales?.rows).toHaveLength(4)
    expect(dump.tables.products?.rows).toHaveLength(3)
    expect(dump.tables.system_logs?.rows).toHaveLength(1)
    expect(dump.tables.clients).toBeUndefined()
  })

  it('unescapes MySQL string escapes and doubled quotes', () => {
    const names = dump.tables.products!.rows.map((r) => r.name)
    expect(names).toContain("D'Best Mop; Large")
    expect(names).toContain('Back\\slash "quoted"')
    expect(dump.tables.system_logs!.rows[0].description).toBe("stmt; with semicolon and it's doubled quote")
  })

  it('converts 0/1 flags to booleans and NULL to null', () => {
    expect(dump.tables.products!.rows[0].is_draft).toBe(false)
    expect(dump.tables.products!.rows[1].is_draft).toBe(true)
    expect(dump.tables.products!.rows[2].supplier_price).toBeNull()
    expect(dump.tables.sales!.rows[1].is_reserved).toBe(true)
  })

  it('nulls zero dates and tags legacy timestamps with +08', () => {
    const [a, , c] = dump.tables.sales!.rows
    expect(a.date_paid).toBeNull() // 0000-00-00 00:00:00
    expect(c.date_delivered).toBeNull()
    expect(a.created_at).toBe('2026-07-01 09:00:00+08')
    expect(c.date_paid).toBe('2026-07-05 08:00:00+08')
  })

  it('repairs typo years from the row sale date', () => {
    // 0206-08-01 -> 2026-08-01 (year borrowed from date)
    expect(dump.tables.sales!.rows[0].due_date).toBe('2026-08-01')
    expect(dump.dateFixes.some((f) => f.includes('id=10') && f.includes('0206-08-01 -> 2026-08-01'))).toBe(true)
  })

  it('recomputes Excel-garbage due dates from delivery + term', () => {
    // 1900-01-29 with COD delivered 2026-07-16 -> 2026-07-16
    expect(dump.tables.sales!.rows[1].due_date).toBe('2026-07-16')
  })

  it('keeps the dump column order for the staged column list', () => {
    expect(dump.tables.sales!.columns).toEqual([
      'id', 'date', 'item', 'total_nam_amount', 'date_delivered',
      'payment_term', 'due_date', 'date_paid', 'created_at', 'is_reserved',
    ])
  })

  it('aggregates sales by month for the sync check', () => {
    expect(dump.salesByMonth.get('2026-07')).toEqual({ rows: 3, totalNam: 1600 })
    expect(dump.salesByMonth.get('2026-06')).toEqual({ rows: 1, totalNam: 200 })
  })

  it('throws a readable error for a structure-only or wrong file', () => {
    expect(() => parseLegacyDump('CREATE TABLE `sales` (`id` int);')).toThrow(/No data for the known tables/)
  })
})
