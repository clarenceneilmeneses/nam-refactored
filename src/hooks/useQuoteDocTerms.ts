import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { QuoteDocTerms } from '@/types/database'

export const QUOTE_DOC_TERMS_KEY = ['app_settings', 'quote_doc_terms'] as const

/** Legacy printed wording — used until someone edits the document. */
export const QUOTE_DOC_TERM_DEFAULTS: QuoteDocTerms = {
  vat_mode: 'inclusive',
  lead_time: '4-6',
  validity: '1 month',
  replacement_days: '7',
}

/** Fills in anything the stored row is missing, so a partial write can't blank the document. */
function normalize(value: unknown): QuoteDocTerms {
  const v = (value ?? {}) as Partial<Record<keyof QuoteDocTerms, unknown>>
  const text = (raw: unknown, fallback: string) =>
    typeof raw === 'string' && raw.trim() !== '' ? raw : fallback
  const mode = v.vat_mode
  return {
    vat_mode:
      mode === 'inclusive' || mode === 'exclusive' || mode === 'exempt' ? mode : QUOTE_DOC_TERM_DEFAULTS.vat_mode,
    lead_time: text(v.lead_time, QUOTE_DOC_TERM_DEFAULTS.lead_time),
    validity: text(v.validity, QUOTE_DOC_TERM_DEFAULTS.validity),
    replacement_days: text(v.replacement_days, QUOTE_DOC_TERM_DEFAULTS.replacement_days),
  }
}

/**
 * VAT mode / lead time / validity / replacement window for the formal
 * quotation (20_quote_doc_terms.sql). Shared by every device — these are
 * company terms, not a device preference, so they live in app_settings
 * rather than localStorage.
 */
export function useQuoteDocTerms() {
  return useQuery({
    queryKey: QUOTE_DOC_TERMS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'quote_doc_terms')
        .maybeSingle()
      // Never let an un-migrated database keep the quote document from
      // opening — the printed defaults are the same ones 20_… seeds.
      if (error) {
        console.error('Quote doc terms load failed, using defaults:', error.message)
        return QUOTE_DOC_TERM_DEFAULTS
      }
      return normalize(data?.value)
    },
    staleTime: 60_000,
  })
}

/**
 * Saves the document's terms as the company-wide default. A plain function,
 * not a mutation hook: the quote preview persists as it unmounts, where a
 * mutation observer's callbacks would be dropped. The RPC writes its own
 * system_logs entry and no-ops when nothing actually changed.
 */
export async function saveQuoteDocTerms(terms: QuoteDocTerms): Promise<void> {
  const { error } = await supabase.rpc('set_quote_doc_terms', {
    p_vat_mode: terms.vat_mode,
    p_lead_time: terms.lead_time,
    p_validity: terms.validity,
    p_replacement_days: terms.replacement_days,
  })
  if (error) throw new Error(error.message)
}
