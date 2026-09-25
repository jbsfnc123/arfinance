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
      courier_schedules: {
        Row: {
          business_partner: string | null
          invoice_date: string | null
          invoice_no: string
          marketing: string | null
          open_amt: number
          payment_group: string | null
          send_date: string
          uploaded_at: string
        }
        Insert: {
          business_partner?: string | null
          invoice_date?: string | null
          invoice_no: string
          marketing?: string | null
          open_amt?: number
          payment_group?: string | null
          send_date: string
          uploaded_at?: string
        }
        Update: {
          business_partner?: string | null
          invoice_date?: string | null
          invoice_no?: string
          marketing?: string | null
          open_amt?: number
          payment_group?: string | null
          send_date?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      courier_updates: {
        Row: {
          business_partner: string | null
          created_at: string
          created_by: string | null
          foto_path: string | null
          id: number
          invoice_date: string | null
          invoice_no: string
          keterangan: string | null
          kode: string | null
          kurir: string
          open_amt: number
          status: string
          tanggal_tukar: string
        }
        Insert: {
          business_partner?: string | null
          created_at?: string
          created_by?: string | null
          foto_path?: string | null
          id?: never
          invoice_date?: string | null
          invoice_no: string
          keterangan?: string | null
          kode?: string | null
          kurir: string
          open_amt?: number
          status: string
          tanggal_tukar: string
        }
        Update: {
          business_partner?: string | null
          created_at?: string
          created_by?: string | null
          foto_path?: string | null
          id?: never
          invoice_date?: string | null
          invoice_no?: string
          keterangan?: string | null
          kode?: string | null
          kurir?: string
          open_amt?: number
          status?: string
          tanggal_tukar?: string
        }
        Relationships: []
      }
      ltkp_documents: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          file_name: string | null
          id: number
          no_ltkp: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          file_name?: string | null
          id?: never
          no_ltkp: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          file_name?: string | null
          id?: never
          no_ltkp?: string
          storage_path?: string
        }
        Relationships: []
      }
      tax_invoice_holds: {
        Row: {
          bp_value: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: number
          invoice_date: string | null
          invoice_no: string
          no_sj: string | null
          updated_at: string | null
        }
        Insert: {
          bp_value: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: never
          invoice_date?: string | null
          invoice_no: string
          no_sj?: string | null
          updated_at?: string | null
        }
        Update: {
          bp_value?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: never
          invoice_date?: string | null
          invoice_no?: string
          no_sj?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tax_invoice_requests: {
        Row: {
          bp_value: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: number
          invoice_date: string | null
          invoice_no: string
          keterangan: string
          ltkp_id: number | null
          no_sj: string | null
          processed_at: string | null
          processed_by_name: string | null
          reason: string
          request: string
          tax_no: string
        }
        Insert: {
          bp_value: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: never
          invoice_date?: string | null
          invoice_no: string
          keterangan: string
          ltkp_id?: number | null
          no_sj?: string | null
          processed_at?: string | null
          processed_by_name?: string | null
          reason: string
          request: string
          tax_no: string
        }
        Update: {
          bp_value?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: never
          invoice_date?: string | null
          invoice_no?: string
          keterangan?: string
          ltkp_id?: number | null
          no_sj?: string | null
          processed_at?: string | null
          processed_by_name?: string | null
          reason?: string
          request?: string
          tax_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoice_requests_ltkp_id_fkey"
            columns: ["ltkp_id"]
            isOneToOne: false
            referencedRelation: "ltkp_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          code: string
          last4: string
          sort: number
          active: boolean
        }
        Insert: never
        Update: never
        Relationships: []
      }
      bank_mutations: {
        Row: {
          id: number
          account: string
          tx_date: string
          amount: number
          keterangan: string | null
          catatan: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      m10_worksheet: {
        Row: {
          id: number
          business_partner: string | null
          invoice_no: string | null
          invoice_date: string | null
          due_date: string | null
          open_amt: number
          branch: string | null
          no_po: string | null
          no_sj: string
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      m10_gr: {
        Row: {
          id: number
          no: string | null
          store_no: string | null
          delivery_to: string | null
          gr_no: string | null
          gr_date: string | null
          po_no: string | null
          po_date: string | null
          vendor_ship_no: string | null
          item_code: string | null
          item_name: string | null
          uom: string | null
          qty_order: number | null
          qty_received: number | null
          status: string | null
          sj_no: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      m10_kwitansi: {
        Row: {
          id: number
          username: string | null
          invoice_no: string
          vendor_invoice_no: string | null
          invoice_date: string | null
          kuitansi_no: string | null
          kuitansi_date: string | null
          accepted_date: string | null
          pfi_no: string | null
          gr_no: string | null
          po_no: string | null
          total_net: number
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      m10_payment_schedule: {
        Row: {
          no_kw: string
          spp: string | null
          nilai_kw: number
          tgl_tukar_faktur: string | null
          jadwal_transfer: string | null
          notes: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      erp_invoices: {
        Row: {
          invoice_no: string
          bp_key: string | null
          bp_name: string | null
          bp_location: string | null
          bp_group: string | null
          marketing_group: string | null
          branch: string | null
          payment_term: string | null
          credit_limit: number | null
          invoice_date: string
          due_date: string | null
          amount: number
          po_customer: string | null
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      erp_payments: {
        Row: {
          id: number
          invoice_no: string
          payment_doc: string
          payment_bank: string | null
          payment_date: string
          amount: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      business_partners: {
        Row: {
          search_key: string
          bp_key: string
          name: string | null
          payment_group: string | null
          pic_ar: string | null
          sales_agent: string | null
          payment_term: string | null
          marketing_group: string | null
          customer_type: string | null
          credit_limit: number | null
          credit_status: string | null
          sales_region: string | null
          branch: string | null
          description: string | null
          first_sale: string | null
          last_sale: string | null
          customer: string | null
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      ar_aging_snapshots: {
        Row: {
          id: number
          month: string
          as_of: string
          file_name: string | null
          row_count: number
          total_open: number
          created_at: string
          created_by: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      ar_aging_lines: {
        Row: {
          snapshot_id: number
          line_no: number
          limit_group: string | null
          bp_key: string | null
          follow_up: string | null
          area: string | null
          payment_group: string | null
          marketing: string | null
          collection_name: string | null
          sales_name: string | null
          business_partner: string | null
          tax_name: string | null
          invoice_no: string | null
          invoice_date: string | null
          due_date: string | null
          open_amt: number
          cur_0_30: number
          cur_31_60: number
          due_1_7: number
          due_8_30: number
          due_31_60: number
          due_61_90: number
          due_90: number
          days: number | null
          branch: string | null
          no_po: string | null
          no_sj: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      deck_derived: {
        Row: { kind: string; month: string; series: Json; bp: Json; stats: Json; updated_at: string }
        Insert: { kind: string; month: string; series?: Json; bp?: Json; stats?: Json; updated_at?: string }
        Update: { kind?: string; month?: string; series?: Json; bp?: Json; stats?: Json; updated_at?: string }
        Relationships: []
      }
      deck_dirty: {
        Row: { kind: string; month: string; at: string }
        Insert: { kind: string; month: string; at?: string }
        Update: { kind?: string; month?: string; at?: string }
        Relationships: []
      }
      so_master: {
        Row: {
          id: number
          document_no: string | null
          date_po: string | null
          no_po_customer: string | null
          no_po_clean: string | null
          is_manual: boolean
          business_partner: string | null
          price_list: string | null
          document_status: string | null
          grand_total: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      deck_state: {
        Row: { id: number; state: Json; saved_at: string; saved_by: string | null }
        Insert: { id?: number; state: Json; saved_at?: string; saved_by?: string | null }
        Update: { id?: number; state?: Json; saved_at?: string; saved_by?: string | null }
        Relationships: []
      }
      po_so_cases: {
        Row: {
          id: number
          po_customer: string
          document_no: string | null
          date_po: string | null
          business_partner: string | null
          price_list: string | null
          document_status: string | null
          total_po: number
          total_so: number
          selisih: number
          aksi: string | null
          tindakan: string | null
          keterangan: string | null
          status: string
          archived_at: string
          completed_at: string | null
          created_by: string | null
          created_by_name: string | null
        }
        Insert: {
          po_customer: string
          document_no?: string | null
          date_po?: string | null
          business_partner?: string | null
          price_list?: string | null
          document_status?: string | null
          total_po?: number
          total_so?: number
          selisih?: number
          aksi?: string | null
          tindakan?: string | null
          keterangan?: string | null
          status?: string
        }
        Update: {
          aksi?: string | null
          tindakan?: string | null
          keterangan?: string | null
          status?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      coretax_batches: {
        Row: {
          id: number
          file_name: string | null
          seller_tin: string | null
          types: string | null
          invoice_count: number
          line_count: number
          dpp: number
          dpp_lain: number
          ppn: number
          created_at: string
          created_by: string | null
          created_by_name: string | null
        }
        Insert: {
          file_name?: string | null
          seller_tin?: string | null
          types?: string | null
          invoice_count?: number
          line_count?: number
          dpp?: number
          dpp_lain?: number
          ppn?: number
        }
        Update: never
        Relationships: []
      }
      coretax_lines: {
        Row: {
          id: number
          batch_id: number
          no: number | null
          tax_invoice_date: string | null
          tax_invoice_opt: string | null
          trx_code: string | null
          ref_desc: string | null
          seller_idtku: string | null
          buyer_tin: string | null
          buyer_document: string | null
          buyer_country: string | null
          buyer_document_number: string | null
          buyer_name: string | null
          buyer_address: string | null
          buyer_email: string | null
          buyer_idtku: string | null
          code: string | null
          name: string | null
          unit: string | null
          price: number | null
          qty: number | null
          total_discount: number | null
          tax_base: number | null
          other_tax_base: number | null
          vat_rate: number | null
          vat: number | null
          stlg_rate: number | null
          stlg: number | null
        }
        Insert: Omit<Database["public"]["Tables"]["coretax_lines"]["Row"], "id">
        Update: never
        Relationships: []
      }
      coretax_delete_list: {
        Row: { ref_desc: string; created_at: string; created_by: string | null; created_by_name: string | null }
        Insert: { ref_desc: string }
        Update: never
        Relationships: []
      }
      mp_reports: {
        Row: {
          report_id: string
          platform: string
          username: string
          dari: string
          ke: string
          data: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      mp_order_index: {
        Row: { report_id: string; no: string; penghasilan: number }
        Insert: never
        Update: never
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
      sticky_notes: {
        Row: {
          body: string
          color: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: number
          updated_at: string
          updated_by_name: string | null
        }
        Insert: {
          body?: string
          color?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: never
          updated_at?: string
          updated_by_name?: string | null
        }
        Update: {
          body?: string
          color?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: never
          updated_at?: string
          updated_by_name?: string | null
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
        Relationships: []
      }
      m10_aging: {
        Row: {
          id: number
          payment_group: string | null
          marketing: string | null
          collection_name: string | null
          sales_name: string | null
          business_partner: string | null
          tax_name: string | null
          invoice_no: string | null
          invoice_date: string | null
          due_date: string | null
          open_amt: number
          cur_0_30: number
          cur_31_60: number
          due_1_7: number
          due_8_30: number
          due_31_60: number
          due_61_90: number
          due_90: number
          days: number | null
          branch: string | null
          no_po: string | null
          no_sj: string | null
        }
        Relationships: []
      }
      v_deck_invoices: {
        Row: Database["public"]["Tables"]["erp_invoices"]["Row"] & { last_payment_date: string | null }
        Relationships: []
      }
      v_deck_payments: {
        Row: { invoice_no: string; payment_doc: string; payment_date: string; payment_amount: number; bp_key: string | null; bp_name: string | null; bp_group: string | null; marketing_group: string | null; payment_term: string | null; invoice_date: string | null; due_date: string | null }
        Relationships: []
      }
      v_bank_mutations: {
        Row: Database["public"]["Tables"]["bank_mutations"]["Row"] & { excluded: boolean; excluded_note: string | null }
        Relationships: []
      }
      v_courier_pending: {
        Row: Database["public"]["Tables"]["courier_schedules"]["Row"]
        Relationships: []
      }
      v_target_months: {
        Row: { month: string | null; invoices: number | null; total: number | null }
        Relationships: []
      }
    }
    Functions: {
      set_invoice_remark: { Args: { p_items: Json; p_text: string; p_source: string }; Returns: number }
      pack_remarks: { Args: Record<string, never>; Returns: Json }
      pack_aging: { Args: Record<string, never>; Returns: Json }
      pack_activity: { Args: Record<string, never>; Returns: Json }
      pack_targets: { Args: Record<string, never>; Returns: Json }
      pack_m10: { Args: Record<string, never>; Returns: Json }
      pack_mutasi: { Args: Record<string, never>; Returns: Json }
      pack_erp: { Args: Record<string, never>; Returns: Json }
      pack_tukar: { Args: Record<string, never>; Returns: Json }
      usage_report: { Args: Record<string, never>; Returns: Json }
      pack_settings: { Args: Record<string, never>; Returns: Json }
      m10_gr_save: { Args: { p_id: number | null; p_row: Json }; Returns: number }
      m10_kw_save: { Args: { p_id: number | null; p_row: Json }; Returns: number }
      m10_rows_delete: { Args: { p_table: string; p_ids: number[] }; Returns: number }
      mutasi_set_excluded: { Args: { p_ids: number[]; p_excluded: boolean; p_note: string }; Returns: number }
      upload_begin: { Args: { p_kind: string; p_file_name: string; p_sha256: string; p_meta: Json }; Returns: Json }
      upload_rows: { Args: { p_batch: string; p_offset: number; p_rows: Json }; Returns: number }
      aging_commit: { Args: { p_batch: string }; Returns: Json }
      erp_commit: { Args: { p_batch: string }; Returns: Json }
      bp_commit: { Args: { p_batch: string }; Returns: Json }
      mp_erp_rows: { Args: { p_pos: string[]; p_group: string | null; p_dari: string | null; p_ke: string | null }; Returns: Json }
      mutasi_import: { Args: { p_sheets: Json; p_file_name: string }; Returns: number }
      m10_gr_add: { Args: { p_rows: Json; p_file_name: string; p_first: boolean }; Returns: number }
      m10_kw_add: { Args: { p_rows: Json; p_username: string; p_file_name: string }; Returns: Json }
      m10_schedule_upsert: { Args: { p_rows: Json }; Returns: number }
      m10_schedule_delete: { Args: { p_no_kw: string[] }; Returns: number }
      m10_set_keterangan: { Args: { p_ids: number[]; p_text: string }; Returns: number }
      m10_set_tax_name: { Args: { p_value: string }; Returns: number }
      admin_set_pin: { Args: { p_pin: string; p_user: string }; Returns: undefined }
      ar_target_replace: {
        Args: { p_file_name: string; p_month: string; p_rows: Json }
        Returns: number
      }
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
      courier_dates: { Args: never; Returns: { invoices: number; send_date: string }[] }
      courier_names: { Args: never; Returns: { name: string }[] }
      courier_submit: {
        Args: {
          p_foto_path: string
          p_invoices: Json
          p_ket_done: string
          p_ket_pending: string
          p_kurir: string
          p_tanggal: string
        }
        Returns: Json
      }
      jadwal_dates: { Args: never; Returns: { send_date: string }[] }
      jadwal_kolektor: {
        Args: { p_date: string }
        Returns: { business_partner: string; invoice_date: string; invoice_no: string; kolektor: string; tukar: boolean }[]
      }
      lookup_invoice: {
        Args: { p_invoice_no: string }
        Returns: { bp_value: string; invoice_date: string; invoice_no: string; no_sj: string }[]
      }
      recent_tukar: {
        Args: never
        Returns: { invoices: number; kolektor: string; lokasi: number; tanggal: string }[]
      }
      schedule_replace: { Args: { p_file_name: string; p_rows: Json }; Returns: number }
      so_master_load: { Args: { p_rows: Json; p_reset: boolean; p_file_name: string }; Returns: number }
      get_so_pivot: {
        Args: { p_keys: string[] }
        Returns: {
          po: string
          total: number
          document_no: string
          date_po: string
          business_partner: string
          price_list: string
          document_status: string
          is_manual: boolean
        }[]
      }
      mp_save_report: { Args: { p_report: Json }; Returns: string }
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
