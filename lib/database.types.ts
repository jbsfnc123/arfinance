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
      email_allowlist: {
        Row: { created_at: string; email: string; kind: string; note: string | null }
        Insert: { created_at?: string; email: string; kind?: string; note?: string | null }
        Update: { created_at?: string; email?: string; kind?: string; note?: string | null }
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
      menu_acl: {
        Row: { submenu_id: string; user_id: string }
        Insert: { submenu_id: string; user_id: string }
        Update: { submenu_id?: string; user_id?: string }
        Relationships: [
          {
            foreignKeyName: "menu_acl_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          collection_name: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          kind: string
          role: string | null
        }
        Insert: {
          active?: boolean
          collection_name?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          kind?: string
          role?: string | null
        }
        Update: {
          active?: boolean
          collection_name?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          kind?: string
          role?: string | null
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
