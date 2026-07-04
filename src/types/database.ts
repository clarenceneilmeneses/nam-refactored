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
}
export type ProductInsert = Partial<Omit<ProductRow, 'id'>> & { name: string }
export type ProductUpdate = Partial<Omit<ProductRow, 'id'>>

export type ClientRow = {
  id: number
  company_name: string
  address: string | null
  tin: string | null
  contact_person: string | null
  default_payment_term: string | null
  created_at: string
}
export type ClientInsert = Partial<Omit<ClientRow, 'id' | 'created_at'>> & { company_name: string }
export type ClientUpdate = Partial<Omit<ClientRow, 'id' | 'created_at'>>

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
  created_at: string
}
export type UserInsert = Partial<Omit<UserRow, 'id' | 'created_at'>> & { username: string }
export type UserUpdate = Partial<Omit<UserRow, 'id' | 'created_at'>>

export type RoleRow = { id: number; name: string; description: string | null }
export type PermissionRow = { id: number; name: string; description: string | null }
export type RolePermissionRow = { role_id: number; permission_id: number }

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

/** One entry of deliver_items' p_items JSON payload (05_records_rpc.sql). */
export type DeliverItemInput = { id: number; deliver_qty: number }

/** Per-item result returned by deliver_items, used for system_logs entries. */
export type DeliverItemResult = {
  id: number
  item: string | null
  company: string | null
  po_number: string | null
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

export type Database = {
  public: {
    Tables: {
      sales: { Row: SaleRow; Insert: SaleInsert; Update: SaleUpdate; Relationships: [] }
      quotations: { Row: QuotationRow; Insert: QuotationInsert; Update: QuotationUpdate; Relationships: [] }
      products: { Row: ProductRow; Insert: ProductInsert; Update: ProductUpdate; Relationships: [] }
      clients: { Row: ClientRow; Insert: ClientInsert; Update: ClientUpdate; Relationships: [] }
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
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
