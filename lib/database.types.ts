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
    Views: { [_ in never]: never }
    Functions: {
      admin_set_pin: { Args: { p_pin: string; p_user: string }; Returns: undefined }
      pin_login: { Args: { p_ip: string; p_pin: string }; Returns: Json }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
