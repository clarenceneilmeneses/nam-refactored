// Hand-written from 01_schema.sql (+ 03_auth_rls.sql additions).
// If you later run `npx supabase gen types typescript`, replace this file.

export type SaleRow = {
  id: number
  date: string
  sn: string | null
  po_number: string | null
  company: string | null
  category: string | null
  item: string | null
  quantity_requested: number | null
  suppliers_price: number | null
  total_actual_amount: number | null
  nam_unit_price: number | null
  total_nam_amount: number | null
  total_nam_amount_sub_total: number | null
  income: number | null
  income_percent: number | null
  date_delivered: string | null
  payment_term: string | null
  due_date: string | null
  payment_status: string | null
  date_paid: string | null
  si_number: string | null
  /** SI # review workflow (11_si_review.sql): only the review_si holder sets these; Paid is blocked until si_reviewed. NOT NULL DEFAULT false. */
  si_reviewed: boolean
  si_reviewed_by: number | null
  si_reviewed_at: string | null
  /** Delivery Receipt # (22_dr_number.sql). This system only — no legacy dump carries it. */
  dr_number: string | null
  buyer: string | null
  remarks: string | null
  supplier: string | null
  address: string | null
  tin: string | null
  sales_invoice_no: string | null
  contact_person_contact: string | null
  created_at: string
  is_reserved: boolean | null
  withholding_tax: number | null
  total_amount_due: number | null
}
export type SaleInsert = Partial<Omit<SaleRow, 'id' | 'created_at'>> & { date: string }
export type SaleUpdate = Partial<Omit<SaleRow, 'id' | 'created_at'>>

export type QuotationRow = {
  id: number
  date: string
  quote_ref: string | null
  company: string | null
  category: string | null
  item: string | null
  quantity_requested: number | null
  suppliers_price: number | null
  nam_unit_price: number | null
  total_amount: number | null
  po_number: string | null
  payment_term: string | null
  remarks: string | null
  status: string | null
  created_at: string
}
export type QuotationInsert = Partial<Omit<QuotationRow, 'id' | 'created_at'>> & { date: string }
export type QuotationUpdate = Partial<Omit<QuotationRow, 'id' | 'created_at'>>

export type ProductRow = {
  id: number
  name: string
  category_code: string | null
  unit: string | null
  supplier: string | null
  supplier_price: number | null
  nam_price: number | null
  margin: string | null
  current_stock: number | null
  reorder_level: number | null
  is_draft: boolean | null
  /** Permanent inventory code (19_item_codes.sql), e.g. "OS-0001" — NULL until item codes are activated. */
  item_code: string | null
}
export type ProductInsert = Partial<Omit<ProductRow, 'id'>> & { name: string }
export type ProductUpdate = Partial<Omit<ProductRow, 'id'>>

export type ClientRow = {
  id: number
  company_name: string
  address: string | null
  tin: string | null
  contact_person: string | null
  /** Quote-document contact details (15_clients_contact_details.sql) — saved back from the formal quote preview. */
  contact_number: string | null
  email: string | null
  /** Name printed under "Conforme:" (21_clients_conforme.sql) — null falls back to company_name. */
  conforme_name: string | null
  default_payment_term: string | null
  created_at: string
}
export type ClientInsert = Partial<Omit<ClientRow, 'id' | 'created_at'>> & { company_name: string }
export type ClientUpdate = Partial<Omit<ClientRow, 'id' | 'created_at'>>

/** Category dropdown entries (14_categories.sql) — legacy fixed list seeded, extensible from the Products tab. */
export type CategoryRow = {
  id: number
  name: string
  /** Item-code prefix (19_item_codes.sql), derived from the name at activation — e.g. "OS" for OFFICE SUPPLIES. */
  code_prefix: string | null
  created_at: string
}
export type CategoryInsert = { name: string }

/** App-wide switches shared by all devices (19_item_codes.sql) — written only through RPCs. */
export type AppSettingRow = {
  key: string
  value: unknown
  updated_at: string
}

/**
 * Formal-quotation defaults shared by every device, stored as the
 * `quote_doc_terms` app_settings row (20_quote_doc_terms.sql). Editing them
 * on the document changes them for every future quotation.
 */
export type QuoteDocTerms = {
  vat_mode: 'inclusive' | 'exclusive' | 'exempt'
  /** Delivery-terms lead time in days, as printed — e.g. "4-6". */
  lead_time: string
  /** Validity wording, as printed — e.g. "1 month". */
  validity: string
  /** Quality-terms replacement window in days, as printed — e.g. "7". */
  replacement_days: string
}

export type CompanyAssignmentRow = {
  id: number
  company_name: string | null
  employee_name: string | null
}

export type UserRow = {
  id: number
  username: string
  full_name: string | null
  role_id: number | null
  auth_id: string | null
  avatar_url: string | null
  /** Formal quote signatory block (17_signer_profile.sql) — follows the account; NULL = never set. */
  quote_signer_name: string | null
  quote_signer_title: string | null
  /** Random id of the one device allowed to stay signed in (09_single_session.sql). */
  current_session_id: string | null
  created_at: string
}
export type UserInsert = Partial<Omit<UserRow, 'id' | 'created_at'>> & { username: string }
export type UserUpdate = Partial<Omit<UserRow, 'id' | 'created_at'>>

export type RoleRow = { id: number; name: string; description: string | null }
export type PermissionRow = { id: number; name: string; description: string | null }
export type RolePermissionRow = { role_id: number; permission_id: number }

/**
 * Per-person grants for rules a role can't express (12_si_privileges.sql).
 * Super Admin does NOT implicitly hold these — only an explicit grant does.
 */
export type UserPrivilegeRow = {
  user_id: number
  privilege: PrivilegeName
  granted_at: string
  granted_by: number | null
}
export type UserPrivilegeInsert = { user_id: number; privilege: PrivilegeName; granted_by?: number | null }

export type SystemLogRow = {
  id: number
  user_id: number
  action: string
  description: string | null
  ip_address: string | null
  created_at: string
}
export type SystemLogInsert = {
  user_id: number
  action: string
  description?: string | null
  ip_address?: string | null
}

/** One entry of create_quotation_batch's p_items JSON payload. */
export type QuotationBatchItem = {
  item: string
  category: string | null
  quantity: number
  suppliers_price: number
  nam_unit_price: number
}

/**
 * One entry of deliver_items' p_items JSON payload (05_records_rpc.sql).
 * dr_number stamps the Delivery Receipt # on the delivered row only — a partial
 * delivery's pending remainder ships later under its own DR (22_dr_number.sql).
 */
export type DeliverItemInput = { id: number; deliver_qty: number; dr_number?: string | null }

/** Per-item result returned by deliver_items, used for system_logs entries. */
export type DeliverItemResult = {
  id: number
  item: string | null
  company: string | null
  po_number: string | null
  /** The DR # stamped by this call, or null when none was entered. */
  dr_number: string | null
  original_qty: number
  delivered_qty: number
  remainder_id: number | null
  remainder_qty: number
  due_date: string | null
}

export type PermissionName =
  | 'view_dashboard'
  | 'manage_sales'
  | 'manage_products'
  | 'view_logistics'
  | 'manage_users'
  | 'manage_finance'

/**
 * Person-level privileges (user_privileges), distinct from role permissions:
 * these apply to named individuals, never to everyone sharing a role.
 */
export type PrivilegeName = 'enter_si' | 'review_si' | 'mark_paid'

export const PRIVILEGES: ReadonlyArray<{ name: PrivilegeName; label: string; description: string }> = [
  { name: 'enter_si', label: 'Enter SI #', description: 'Fill in or change a record’s SI #' },
  { name: 'review_si', label: 'Review SI #', description: 'Check an SI # and mark it reviewed' },
  { name: 'mark_paid', label: 'Mark Paid', description: 'Change a record’s Paid status, once its SI # is reviewed' },
]

/** Returned by legacy_restore_commit (18_legacy_restore.sql, 22_dr_number.sql). */
export type LegacyRestoreSummary = {
  tables: Record<string, number>
  si_review_preserved: number
  si_paid_grandfathered: number
  /** Paid marks made here that the dump did not have, re-applied after the reload. */
  paid_preserved: number
  /** DR #s re-applied — no dump carries the column. */
  dr_preserved: number
  /** Local rows (Paid / reviewed / with a DR #) the dump no longer has: that work is gone. */
  local_only_rows_lost: number
}

export type Database = {
  public: {
    Tables: {
      sales: { Row: SaleRow; Insert: SaleInsert; Update: SaleUpdate; Relationships: [] }
      quotations: { Row: QuotationRow; Insert: QuotationInsert; Update: QuotationUpdate; Relationships: [] }
      products: { Row: ProductRow; Insert: ProductInsert; Update: ProductUpdate; Relationships: [] }
      clients: { Row: ClientRow; Insert: ClientInsert; Update: ClientUpdate; Relationships: [] }
      categories: { Row: CategoryRow; Insert: CategoryInsert; Update: Partial<CategoryInsert>; Relationships: [] }
      app_settings: { Row: AppSettingRow; Insert: AppSettingRow; Update: Partial<AppSettingRow>; Relationships: [] }
      company_assignments: {
        Row: CompanyAssignmentRow
        Insert: Partial<Omit<CompanyAssignmentRow, 'id'>>
        Update: Partial<Omit<CompanyAssignmentRow, 'id'>>
        Relationships: []
      }
      users: {
        Row: UserRow
        Insert: UserInsert
        Update: UserUpdate
        Relationships: [
          {
            foreignKeyName: 'users_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
        ]
      }
      roles: {
        Row: RoleRow
        Insert: Partial<Omit<RoleRow, 'id'>> & { name: string }
        Update: Partial<Omit<RoleRow, 'id'>>
        Relationships: []
      }
      permissions: {
        Row: PermissionRow
        Insert: Partial<Omit<PermissionRow, 'id'>> & { name: string }
        Update: Partial<Omit<PermissionRow, 'id'>>
        Relationships: []
      }
      role_permissions: {
        Row: RolePermissionRow
        Insert: RolePermissionRow
        Update: Partial<RolePermissionRow>
        Relationships: [
          {
            foreignKeyName: 'role_permissions_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'role_permissions_permission_id_fkey'
            columns: ['permission_id']
            isOneToOne: false
            referencedRelation: 'permissions'
            referencedColumns: ['id']
          },
        ]
      }
      user_privileges: {
        Row: UserPrivilegeRow
        Insert: UserPrivilegeInsert
        Update: Partial<UserPrivilegeInsert>
        Relationships: [
          {
            foreignKeyName: 'user_privileges_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      system_logs: {
        Row: SystemLogRow
        Insert: SystemLogInsert
        Update: Partial<SystemLogInsert>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      has_permission: { Args: { perm: string }; Returns: boolean }
      has_privilege: { Args: { p_privilege: PrivilegeName }; Returns: boolean }
      find_product_id: { Args: { p_item: string }; Returns: number | null }
      create_quotation_batch: {
        Args: {
          p_date: string
          p_quote_ref: string
          p_company: string
          p_po_number: string | null
          p_payment_term: string | null
          p_remarks: string | null
          p_status: string
          p_items: QuotationBatchItem[]
        }
        Returns: QuotationRow[]
      }
      create_sales_batch: { Args: { p_rows: SaleInsert[] }; Returns: SaleRow[] }
      set_product_unit: { Args: { p_item: string; p_unit: string }; Returns: undefined }
      set_quote_doc_terms: {
        Args: {
          p_vat_mode: QuoteDocTerms['vat_mode']
          p_lead_time: string
          p_validity: string
          p_replacement_days: string
        }
        Returns: QuoteDocTerms
      }
      approve_quotation: { Args: { p_id: number }; Returns: QuotationRow }
      finalize_quotation: { Args: { p_id: number; p_date: string }; Returns: SaleRow }
      remove_quotation_item: { Args: { p_id: number }; Returns: undefined }
      payment_term_days: { Args: { p_term: string | null }; Returns: number }
      deliver_items: { Args: { p_items: DeliverItemInput[] }; Returns: DeliverItemResult[] }
      delete_quotation_group: { Args: { p_quote_ref: string; p_company: string | null }; Returns: number }
      admin_create_user: {
        Args: { p_username: string; p_password: string; p_full_name: string; p_role_id: number; p_email?: string | null }
        Returns: UserRow
      }
      admin_update_user: {
        Args: { p_id: number; p_username: string; p_full_name: string; p_role_id: number; p_password?: string | null }
        Returns: UserRow
      }
      admin_delete_user: { Args: { p_id: number }; Returns: undefined }
      legacy_restore_begin: { Args: Record<string, never>; Returns: undefined }
      legacy_restore_stage: {
        Args: { p_table: string; p_columns: string[]; p_rows: Record<string, string | number | boolean | null>[] }
        Returns: number
      }
      legacy_restore_commit: { Args: { p_tables: string[] }; Returns: LegacyRestoreSummary }
      activate_item_codes: { Args: Record<string, never>; Returns: number }
      item_codes_enabled: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
