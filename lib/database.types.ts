// Dihasilkan dari Supabase (generate_typescript_types). Jangan diedit manual;
// generate ulang setiap kali ada migrasi baru.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: { key: string; updated_at: string; updated_by: string | null; value: Json }
        Insert: { key: string; updated_at?: string; updated_by?: string | null; value: Json }
        Update: { key?: string; updated_at?: string; updated_by?: string | null; value?: Json }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_invoices: {
        Row: {
          bp_value: string | null
          business_partner: string | null
          collection_name: string | null
          due_date: string | null
          invoice_date: string | null
          invoice_no: string
          marketing: string | null
          no_po: string | null
          no_sj: string | null
          open_amt: number
          payment_group: string | null
          uploaded_at: string
        }
        Insert: {
          bp_value?: string | null
          business_partner?: string | null
          collection_name?: string | null
          due_date?: string | null
          invoice_date?: string | null
          invoice_no: string
          marketing?: string | null
          no_po?: string | null
          no_sj?: string | null
          open_amt?: number
          payment_group?: string | null
          uploaded_at?: string
        }
        Update: {
          bp_value?: string | null
          business_partner?: string | null
          collection_name?: string | null
          due_date?: string | null
          invoice_date?: string | null
          invoice_no?: string
          marketing?: string | null
          no_po?: string | null
          no_sj?: string | null
          open_amt?: number
          payment_group?: string | null
          uploaded_at?: string
        }
        Relationships: []
      }
      ar_targets: {
        Row: {
          branch: string | null
          business_partner: string | null
          collection_name: string | null
          due_date: string | null
          invoice_no: string
          marketing: string | null
          month: string
          target: number
        }
        Insert: {
          branch?: string | null
          business_partner?: string | null
          collection_name?: string | null
          due_date?: string | null
          invoice_no: string
          marketing?: string | null
          month: string
          target: number
        }
        Update: {
          branch?: string | null
          business_partner?: string | null
          collection_name?: string | null
          due_date?: string | null
          invoice_no?: string
          marketing?: string | null
          month?: string
          target?: number
        }
        Relationships: []
      }
      contacts: {
        Row: {
          business_partner: string
          nama: string | null
          no_wa: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_partner: string
          nama?: string | null
          no_wa: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_partner?: string
          nama?: string | null
          no_wa?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      data_versions: {
        Row: { key: string; updated_at: string }
        Insert: { key: string; updated_at?: string }
        Update: { key?: string; updated_at?: string }
        Relationships: []
      }
      import_log: {
        Row: {
          at: string
          file_name: string | null
          id: number
          kind: string
          module: string
          months: string[] | null
          rows: number | null
          user_id: string | null
        }
        Insert: {
          at?: string
          file_name?: string | null
          id?: never
          kind: string
          module: string
          months?: string[] | null
          rows?: number | null
          user_id?: string | null
        }
        Update: {
          at?: string
          file_name?: string | null
          id?: never
          kind?: string
          module?: string
          months?: string[] | null
          rows?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_exchanges: {
        Row: {
          collection_name: string | null
          created_at: string
          created_by: string | null
          foto_path: string | null
          id: number
          invoice_no: string
          keterangan: string | null
          kurir: string | null
          metode: string
          resi: string | null
          tanggal: string
        }
        Insert: {
          collection_name?: string | null
          created_at?: string
          created_by?: string | null
          foto_path?: string | null
          id?: never
          invoice_no: string
          keterangan?: string | null
          kurir?: string | null
          metode: string
          resi?: string | null
          tanggal: string
        }
        Update: {
          collection_name?: string | null
          created_at?: string
          created_by?: string | null
          foto_path?: string | null
          id?: never
          invoice_no?: string
          keterangan?: string | null
          kurir?: string | null
          metode?: string
          resi?: string | null
          tanggal?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          business_partner: string | null
          closed_at: string | null
          closed_by: string | null
          collection_name: string | null
          created_at: string
          created_by: string | null
          done: boolean
          id: number
          invoice_date: string | null
          invoice_no: string
          isi: string
          kategori: string
          no_po: string | null
          no_sj: string | null
        }
        Insert: {
          business_partner?: string | null
          closed_at?: string | null
          closed_by?: string | null
          collection_name?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          id?: never
          invoice_date?: string | null
          invoice_no: string
          isi?: string
          kategori: string
          no_po?: string | null
          no_sj?: string | null
        }
        Update: {
          business_partner?: string | null
          closed_at?: string | null
          closed_by?: string | null
          collection_name?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          id?: never
          invoice_date?: string | null
          invoice_no?: string
          isi?: string
          kategori?: string
          no_po?: string | null
          no_sj?: string | null
        }
        Relationships: []
      }
      payment_promises: {
        Row: {
          business_partner: string | null
          collection_name: string | null
          created_at: string
          created_by: string | null
          id: number
          invoice_no: string
          isi: string | null
          promise_date: string
        }
        Insert: {
          business_partner?: string | null
          collection_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          invoice_no: string
          isi?: string | null
          promise_date: string
        }
        Update: {
          business_partner?: string | null
          collection_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          invoice_no?: string
          isi?: string | null
          promise_date?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          collection_name: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          pin_hash: string | null
          role_id: string
        }
        Insert: {
          active?: boolean
          collection_name?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          pin_hash?: string | null
          role_id: string
        }
        Update: {
          active?: boolean
          collection_name?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          pin_hash?: string | null
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_menus: {
        Row: { role_id: string; submenu_id: string }
        Insert: { role_id: string; submenu_id: string }
        Update: { role_id?: string; submenu_id?: string }
        Relationships: [
          {
            foreignKeyName: "role_menus_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: { created_at: string; id: string; kind: string; name: string }
        Insert: { created_at?: string; id?: string; kind: string; name: string }
        Update: { created_at?: string; id?: string; kind?: string; name?: string }
        Relationships: []
      }
    }
    Views: {
      v_target_months: {
        Row: { month: string | null; invoices: number | null; total: number | null }
        Relationships: []
      }
      v_collection_summary: {
        Row: { collection_name: string | null; invoices: number | null; total: number | null }
        Relationships: []
      }
      v_collection_rows: {
        Row: {
          bp_value: string | null
          business_partner: string | null
          catatan: string | null
          collection_name: string | null
          due_date: string | null
          foto_path: string | null
          invoice_date: string | null
          invoice_no: string | null
          janji_bayar: string | null
          keterangan: string | null
          marketing: string | null
          metode_tukar: string | null
          no_po: string | null
          no_sj: string | null
          open_amt: number | null
          payment_group: string | null
          resi: string | null
          tanggal_tukar: string | null
        }
        Relationships: []
      }
      v_note_latest: {
        Row: {
          business_partner: string | null
          closed_at: string | null
          closed_by: string | null
          collection_name: string | null
          created_at: string | null
          done: boolean | null
          id: number | null
          invoice_date: string | null
          invoice_no: string | null
          isi: string | null
          kategori: string | null
          no_po: string | null
          no_sj: string | null
          nominal: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_set_pin: { Args: { p_pin: string; p_user: string }; Returns: undefined }
      ar_target_replace: {
        Args: { p_file_name: string; p_month: string; p_rows: Json }
        Returns: number
      }
      ar_upload_chunk: { Args: { p_batch: string; p_rows: Json }; Returns: number }
      ar_upload_finish: { Args: { p_batch: string }; Returns: Json }
      ar_upload_start: { Args: { p_file_name: string }; Returns: string }
      get_spv_summary: { Args: { p_month: string }; Returns: Json }
      note_group_delete: { Args: { p_bp: string; p_cat: string; p_isi: string }; Returns: number }
      note_group_done: {
        Args: { p_bp: string; p_cat: string; p_done: boolean; p_isi: string }
        Returns: number
      }
      note_group_update: {
        Args: { p_bp: string; p_cat: string; p_isi: string; p_new_cat: string; p_new_isi: string }
        Returns: number
      }
      pin_login: { Args: { p_ip: string; p_pin: string }; Returns: Json }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
