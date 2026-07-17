/**
 * Legacy category list — now the SEED/FALLBACK only. Dropdowns read from the
 * categories table via useCategories (14_categories.sql); this list is used
 * until that query resolves and to seed the table.
 */
export const CATEGORIES = [
  'OFFICE SUPPLIES',
  'CLEANING MATERIALS',
  'CONSUMABLES',
  'OFFICE TOOLS AND EQUIPMENT',
  'PPE',
  'MATERIALS',
  'COMPANY UNIFORM',
  'OFFICE FURNITURE & FIXTURES',
  'MEDICINE',
  'OTHERS',
] as const
