export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_actions: {
        Row: {
          action_type: string
          company_id: string
          created_at: string
          id: string
          payload: Json | null
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          company_id: string
          created_at?: string
          id?: string
          payload?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          company_id?: string
          created_at?: string
          id?: string
          payload?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          mode: Database["public"]["Enums"]["api_key_mode"]
          name: string
          prefix: string
          revoked_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          mode?: Database["public"]["Enums"]["api_key_mode"]
          name: string
          prefix: string
          revoked_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          mode?: Database["public"]["Enums"]["api_key_mode"]
          name?: string
          prefix?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      api_logs: {
        Row: {
          api_key_id: string | null
          company_id: string | null
          created_at: string
          duration_ms: number | null
          id: string
          ip: string | null
          method: string
          path: string
          request_body: Json | null
          response_body: Json | null
          status: number
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          ip?: string | null
          method: string
          path: string
          request_body?: Json | null
          response_body?: Json | null
          status: number
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          ip?: string | null
          method?: string
          path?: string
          request_body?: Json | null
          response_body?: Json | null
          status?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string | null
          balance: number
          bank_connection_id: string
          company_id: string
          created_at: string
          currency: string
          external_account_id: string | null
          iban: string | null
          id: string
          last_synced_at: string | null
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          balance?: number
          bank_connection_id: string
          company_id: string
          created_at?: string
          currency?: string
          external_account_id?: string | null
          iban?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          balance?: number
          bank_connection_id?: string
          company_id?: string
          created_at?: string
          currency?: string
          external_account_id?: string | null
          iban?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_bank_connection_id_fkey"
            columns: ["bank_connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          access_token: string | null
          company_id: string
          consent_id: string | null
          created_at: string
          id: string
          last_synced_at: string | null
          metadata: Json
          provider: string
          refresh_token: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          company_id: string
          consent_id?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          provider?: string
          refresh_token?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          company_id?: string
          consent_id?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          provider?: string
          refresh_token?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          booking_date: string
          company_id: string
          counterparty: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          matched_invoice_id: string | null
          transaction_reference: string | null
          variable_symbol: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          booking_date: string
          company_id: string
          counterparty?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          matched_invoice_id?: string | null
          transaction_reference?: string | null
          variable_symbol?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          booking_date?: string
          company_id?: string
          counterparty?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          matched_invoice_id?: string | null
          transaction_reference?: string | null
          variable_symbol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_invoice_id_fkey"
            columns: ["matched_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          company_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_payments: {
        Row: {
          amount_cents: number
          company_id: string
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          plan_slug: string | null
          provider: string
          provider_payment_id: string
          raw_response: Json | null
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          plan_slug?: string | null
          provider?: string
          provider_payment_id: string
          raw_response?: Json | null
          status: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          plan_slug?: string | null
          provider?: string
          provider_payment_id?: string
          raw_response?: Json | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      commander_connections: {
        Row: {
          auto_sync_daily: boolean
          company_id: string
          created_at: string
          enabled: boolean
          encrypted_password: string
          error_message: string | null
          id: string
          last_sync_at: string | null
          sync_status: string | null
          updated_at: string
          username: string
        }
        Insert: {
          auto_sync_daily?: boolean
          company_id: string
          created_at?: string
          enabled?: boolean
          encrypted_password: string
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          sync_status?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          auto_sync_daily?: boolean
          company_id?: string
          created_at?: string
          enabled?: boolean
          encrypted_password?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          sync_status?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "commander_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      commander_sync_logs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message: string | null
          raw_response: Json | null
          status: string
          sync_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message?: string | null
          raw_response?: Json | null
          status: string
          sync_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message?: string | null
          raw_response?: Json | null
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "commander_sync_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      commander_vehicle_links: {
        Row: {
          commander_license_plate: string | null
          commander_vehicle_id: string
          commander_vehicle_name: string | null
          company_id: string
          created_at: string
          faktero_vehicle_id: string | null
          id: string
          last_synced_at: string | null
          updated_at: string
        }
        Insert: {
          commander_license_plate?: string | null
          commander_vehicle_id: string
          commander_vehicle_name?: string | null
          company_id: string
          created_at?: string
          faktero_vehicle_id?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string
        }
        Update: {
          commander_license_plate?: string | null
          commander_vehicle_id?: string
          commander_vehicle_name?: string | null
          company_id?: string
          created_at?: string
          faktero_vehicle_id?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commander_vehicle_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commander_vehicle_links_faktero_vehicle_id_fkey"
            columns: ["faktero_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          default_currency: string
          dic: string | null
          email: string | null
          email_default_message: string | null
          email_default_subject: string | null
          email_reply_to: string | null
          email_sender_name: string | null
          iban: string | null
          ic_dph: string | null
          ico: string | null
          id: string
          invoice_footer: string | null
          invoice_number_format: string
          logo_url: string | null
          name: string
          online_payments_enabled: boolean
          phone: string | null
          preferred_accounting_system: Database["public"]["Enums"]["accounting_system"]
          street: string | null
          suspended_at: string | null
          suspended_reason: string | null
          swift: string | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string
          dic?: string | null
          email?: string | null
          email_default_message?: string | null
          email_default_subject?: string | null
          email_reply_to?: string | null
          email_sender_name?: string | null
          iban?: string | null
          ic_dph?: string | null
          ico?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_number_format?: string
          logo_url?: string | null
          name: string
          online_payments_enabled?: boolean
          phone?: string | null
          preferred_accounting_system?: Database["public"]["Enums"]["accounting_system"]
          street?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          swift?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string
          dic?: string | null
          email?: string | null
          email_default_message?: string | null
          email_default_subject?: string | null
          email_reply_to?: string | null
          email_sender_name?: string | null
          iban?: string | null
          ic_dph?: string | null
          ico?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_number_format?: string
          logo_url?: string | null
          name?: string
          online_payments_enabled?: boolean
          phone?: string | null
          preferred_accounting_system?: Database["public"]["Enums"]["accounting_system"]
          street?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          swift?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      company_lookup_logs: {
        Row: {
          cached: boolean
          company_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          ico: string
          id: string
          mapped_company_name: string | null
          mapped_dic: string | null
          mapped_ic_dph: string | null
          provider: string
          raw_response: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          cached?: boolean
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          ico: string
          id?: string
          mapped_company_name?: string | null
          mapped_dic?: string | null
          mapped_ic_dph?: string | null
          provider: string
          raw_response?: Json | null
          status: string
          user_id?: string | null
        }
        Update: {
          cached?: boolean
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          ico?: string
          id?: string
          mapped_company_name?: string | null
          mapped_dic?: string | null
          mapped_ic_dph?: string | null
          provider?: string
          raw_response?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_lookup_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_payment_providers: {
        Row: {
          client_id: string | null
          company_id: string
          connected_at: string | null
          created_at: string
          enabled: boolean
          encrypted_client_secret: string | null
          goid: string | null
          id: string
          last_test_at: string | null
          last_test_error: string | null
          last_test_ok: boolean | null
          provider: string
          sandbox_mode: boolean
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          client_id?: string | null
          company_id: string
          connected_at?: string | null
          created_at?: string
          enabled?: boolean
          encrypted_client_secret?: string | null
          goid?: string | null
          id?: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_ok?: boolean | null
          provider?: string
          sandbox_mode?: boolean
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string
          connected_at?: string | null
          created_at?: string
          enabled?: boolean
          encrypted_client_secret?: string | null
          goid?: string | null
          id?: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_ok?: boolean | null
          provider?: string
          sandbox_mode?: boolean
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_payment_providers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          city: string | null
          company_id: string
          contact_person: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          dic: string | null
          email: string | null
          external_id: string | null
          ic_dph: string | null
          ico: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          street: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          city?: string | null
          company_id: string
          contact_person?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          dic?: string | null
          email?: string | null
          external_id?: string | null
          ic_dph?: string | null
          ico?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          city?: string | null
          company_id?: string
          contact_person?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          dic?: string | null
          email?: string | null
          external_id?: string | null
          ic_dph?: string | null
          ico?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efaktura_deliveries: {
        Row: {
          attempt_count: number
          channel: Database["public"]["Enums"]["efaktura_channel"]
          company_id: string
          created_at: string
          delivered_at: string | null
          document_id: string
          error_code: string | null
          error_message: string | null
          id: string
          provider: string | null
          provider_message_id: string | null
          raw_response: Json | null
          recipient_endpoint: string | null
          recipient_participant_id: string | null
          recipient_scheme: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["efaktura_delivery_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          channel: Database["public"]["Enums"]["efaktura_channel"]
          company_id: string
          created_at?: string
          delivered_at?: string | null
          document_id: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          raw_response?: Json | null
          recipient_endpoint?: string | null
          recipient_participant_id?: string | null
          recipient_scheme?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["efaktura_delivery_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          channel?: Database["public"]["Enums"]["efaktura_channel"]
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          document_id?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          raw_response?: Json | null
          recipient_endpoint?: string | null
          recipient_participant_id?: string | null
          recipient_scheme?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["efaktura_delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efaktura_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efaktura_deliveries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "efaktura_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      efaktura_documents: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          customization_id: string | null
          document_number: string | null
          format: Database["public"]["Enums"]["efaktura_doc_format"]
          generated_at: string | null
          id: string
          invoice_id: string | null
          issue_date: string | null
          payload_hash: string | null
          profile_id: string | null
          schema_version: string
          status: Database["public"]["Enums"]["efaktura_doc_status"]
          total: number | null
          updated_at: string
          validation_errors: Json
          xml_payload: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          customization_id?: string | null
          document_number?: string | null
          format?: Database["public"]["Enums"]["efaktura_doc_format"]
          generated_at?: string | null
          id?: string
          invoice_id?: string | null
          issue_date?: string | null
          payload_hash?: string | null
          profile_id?: string | null
          schema_version?: string
          status?: Database["public"]["Enums"]["efaktura_doc_status"]
          total?: number | null
          updated_at?: string
          validation_errors?: Json
          xml_payload?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          customization_id?: string | null
          document_number?: string | null
          format?: Database["public"]["Enums"]["efaktura_doc_format"]
          generated_at?: string | null
          id?: string
          invoice_id?: string | null
          issue_date?: string | null
          payload_hash?: string | null
          profile_id?: string | null
          schema_version?: string
          status?: Database["public"]["Enums"]["efaktura_doc_status"]
          total?: number | null
          updated_at?: string
          validation_errors?: Json
          xml_payload?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efaktura_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efaktura_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      efaktura_interest_signups: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efaktura_interest_signups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efaktura_profiles: {
        Row: {
          activated_at: string | null
          company_id: string
          created_at: string
          default_document_format: Database["public"]["Enums"]["efaktura_doc_format"]
          digitalny_postar_id: string | null
          enabled: boolean
          id: string
          notes: string | null
          peppol_endpoint_url: string | null
          peppol_participant_id: string | null
          peppol_provider: string | null
          peppol_scheme: string | null
          preferred_channel: Database["public"]["Enums"]["efaktura_channel"]
          readiness_checked_at: string | null
          readiness_details: Json
          readiness_score: number
          test_mode: boolean
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          company_id: string
          created_at?: string
          default_document_format?: Database["public"]["Enums"]["efaktura_doc_format"]
          digitalny_postar_id?: string | null
          enabled?: boolean
          id?: string
          notes?: string | null
          peppol_endpoint_url?: string | null
          peppol_participant_id?: string | null
          peppol_provider?: string | null
          peppol_scheme?: string | null
          preferred_channel?: Database["public"]["Enums"]["efaktura_channel"]
          readiness_checked_at?: string | null
          readiness_details?: Json
          readiness_score?: number
          test_mode?: boolean
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          company_id?: string
          created_at?: string
          default_document_format?: Database["public"]["Enums"]["efaktura_doc_format"]
          digitalny_postar_id?: string | null
          enabled?: boolean
          id?: string
          notes?: string | null
          peppol_endpoint_url?: string | null
          peppol_participant_id?: string | null
          peppol_provider?: string | null
          peppol_scheme?: string | null
          preferred_channel?: Database["public"]["Enums"]["efaktura_channel"]
          readiness_checked_at?: string | null
          readiness_details?: Json
          readiness_score?: number
          test_mode?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efaktura_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efaktura_received_documents: {
        Row: {
          channel: Database["public"]["Enums"]["efaktura_channel"]
          company_id: string
          created_at: string
          currency: string | null
          document_number: string | null
          due_date: string | null
          format: Database["public"]["Enums"]["efaktura_doc_format"] | null
          id: string
          issue_date: string | null
          matched_supplier_invoice_id: string | null
          parse_errors: Json
          parsed_data: Json
          processed_at: string | null
          received_at: string
          sender_name: string | null
          sender_participant_id: string | null
          sender_scheme: string | null
          sender_vat_id: string | null
          status: Database["public"]["Enums"]["efaktura_received_status"]
          total: number | null
          updated_at: string
          vat_total: number | null
          xml_payload: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["efaktura_channel"]
          company_id: string
          created_at?: string
          currency?: string | null
          document_number?: string | null
          due_date?: string | null
          format?: Database["public"]["Enums"]["efaktura_doc_format"] | null
          id?: string
          issue_date?: string | null
          matched_supplier_invoice_id?: string | null
          parse_errors?: Json
          parsed_data?: Json
          processed_at?: string | null
          received_at?: string
          sender_name?: string | null
          sender_participant_id?: string | null
          sender_scheme?: string | null
          sender_vat_id?: string | null
          status?: Database["public"]["Enums"]["efaktura_received_status"]
          total?: number | null
          updated_at?: string
          vat_total?: number | null
          xml_payload?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["efaktura_channel"]
          company_id?: string
          created_at?: string
          currency?: string | null
          document_number?: string | null
          due_date?: string | null
          format?: Database["public"]["Enums"]["efaktura_doc_format"] | null
          id?: string
          issue_date?: string | null
          matched_supplier_invoice_id?: string | null
          parse_errors?: Json
          parsed_data?: Json
          processed_at?: string | null
          received_at?: string
          sender_name?: string | null
          sender_participant_id?: string | null
          sender_scheme?: string | null
          sender_vat_id?: string | null
          status?: Database["public"]["Enums"]["efaktura_received_status"]
          total?: number | null
          updated_at?: string
          vat_total?: number | null
          xml_payload?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efaktura_received_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          date_from: string | null
          date_to: string | null
          error: string | null
          file_content: string | null
          file_name: string | null
          format: string
          id: string
          invoice_count: number
          status: string
          target_system: Database["public"]["Enums"]["accounting_system"]
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          error?: string | null
          file_content?: string | null
          file_name?: string | null
          format: string
          id?: string
          invoice_count?: number
          status?: string
          target_system?: Database["public"]["Enums"]["accounting_system"]
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          error?: string | null
          file_content?: string | null
          file_name?: string | null
          format?: string
          id?: string
          invoice_count?: number
          status?: string
          target_system?: Database["public"]["Enums"]["accounting_system"]
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      export_logs: {
        Row: {
          company_id: string
          created_at: string
          error: string | null
          export_job_id: string
          id: string
          invoice_id: string | null
          invoice_number: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error?: string | null
          export_job_id: string
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error?: string | null
          export_job_id?: string
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_logs_export_job_id_fkey"
            columns: ["export_job_id"]
            isOneToOne: false
            referencedRelation: "export_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_records: {
        Row: {
          company_id: string
          created_at: string
          fuel_date: string
          id: string
          liters: number
          price_per_liter: number
          receipt_number: string | null
          station_name: string | null
          total_amount: number
          vehicle_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          fuel_date: string
          id?: string
          liters: number
          price_per_liter: number
          receipt_number?: string | null
          station_name?: string | null
          total_amount: number
          vehicle_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          fuel_date?: string
          id?: string
          liters?: number
          price_per_liter?: number
          receipt_number?: string | null
          station_name?: string | null
          total_amount?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          failed_rows: number
          file_name: string | null
          file_path: string | null
          id: string
          imported_customers: number
          imported_invoices: number
          mapping: Json | null
          options: Json
          preview: Json | null
          source: string
          status: string
          total_rows: number
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_rows?: number
          file_name?: string | null
          file_path?: string | null
          id?: string
          imported_customers?: number
          imported_invoices?: number
          mapping?: Json | null
          options?: Json
          preview?: Json | null
          source?: string
          status?: string
          total_rows?: number
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_rows?: number
          file_name?: string | null
          file_path?: string | null
          id?: string
          imported_customers?: number
          imported_invoices?: number
          mapping?: Json | null
          options?: Json
          preview?: Json | null
          source?: string
          status?: string
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_logs: {
        Row: {
          company_id: string
          created_at: string
          entity_type: string
          id: string
          import_job_id: string
          message: string | null
          raw_data: Json | null
          row_number: number | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_type: string
          id?: string
          import_job_id: string
          message?: string | null
          raw_data?: Json | null
          row_number?: number | null
          status: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_type?: string
          id?: string
          import_job_id?: string
          message?: string | null
          raw_data?: Json | null
          row_number?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_logs_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          counted_quantity: number | null
          created_at: string
          difference: number | null
          expected_quantity: number
          id: string
          inventory_count_id: string
          note: string | null
          stock_item_id: string
        }
        Insert: {
          counted_quantity?: number | null
          created_at?: string
          difference?: number | null
          expected_quantity?: number
          id?: string
          inventory_count_id: string
          note?: string | null
          stock_item_id: string
        }
        Update: {
          counted_quantity?: number | null
          created_at?: string
          difference?: number | null
          expected_quantity?: number
          id?: string
          inventory_count_id?: string
          note?: string | null
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          started_at: string
          status: Database["public"]["Enums"]["inventory_count_status"]
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["inventory_count_status"]
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["inventory_count_status"]
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_email_logs: {
        Row: {
          company_id: string
          created_at: string
          error_message: string | null
          id: string
          invoice_id: string
          message: string | null
          provider_message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id: string
          message?: string | null
          provider_message_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id?: string
          message?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_email_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_email_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          name: string
          position: number
          product_id: string | null
          quantity: number
          stock_item_id: string | null
          subtotal: number
          total: number
          unit: string
          unit_price: number
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          name: string
          position?: number
          product_id?: string | null
          quantity?: number
          stock_item_id?: string | null
          subtotal?: number
          total?: number
          unit?: string
          unit_price?: number
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          name?: string
          position?: number
          product_id?: string | null
          quantity?: number
          stock_item_id?: string | null
          subtotal?: number
          total?: number
          unit?: string
          unit_price?: number
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_links: {
        Row: {
          amount_cents: number
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          expires_at: string | null
          gw_url: string | null
          id: string
          invoice_id: string
          paid_at: string | null
          provider: string
          provider_payment_id: string | null
          sandbox_mode: boolean
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          expires_at?: string | null
          gw_url?: string | null
          id?: string
          invoice_id: string
          paid_at?: string | null
          provider?: string
          provider_payment_id?: string | null
          sandbox_mode?: boolean
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          expires_at?: string | null
          gw_url?: string | null
          id?: string
          invoice_id?: string
          paid_at?: string | null
          provider?: string
          provider_payment_id?: string | null
          sandbox_mode?: boolean
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cancelled_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          customer_city: string | null
          customer_country: string | null
          customer_dic: string | null
          customer_email: string | null
          customer_ic_dph: string | null
          customer_ico: string | null
          customer_id: string | null
          customer_name: string | null
          customer_street: string | null
          customer_zip: string | null
          deleted_at: string | null
          delivery_date: string | null
          due_date: string
          external_id: string | null
          id: string
          import_source: string | null
          imported_at: string | null
          invoice_number: string
          issue_date: string
          notes: string | null
          original_external_id: string | null
          paid_at: string | null
          payment_method: string | null
          pdf_url: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total: number
          type: Database["public"]["Enums"]["invoice_type"]
          updated_at: string
          variable_symbol: string | null
          vat_total: number
        }
        Insert: {
          cancelled_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_city?: string | null
          customer_country?: string | null
          customer_dic?: string | null
          customer_email?: string | null
          customer_ic_dph?: string | null
          customer_ico?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_street?: string | null
          customer_zip?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          due_date?: string
          external_id?: string | null
          id?: string
          import_source?: string | null
          imported_at?: string | null
          invoice_number: string
          issue_date?: string
          notes?: string | null
          original_external_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          type?: Database["public"]["Enums"]["invoice_type"]
          updated_at?: string
          variable_symbol?: string | null
          vat_total?: number
        }
        Update: {
          cancelled_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_city?: string | null
          customer_country?: string | null
          customer_dic?: string | null
          customer_email?: string | null
          customer_ic_dph?: string | null
          customer_ico?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_street?: string | null
          customer_zip?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          due_date?: string
          external_id?: string | null
          id?: string
          import_source?: string | null
          imported_at?: string | null
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          original_external_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          type?: Database["public"]["Enums"]["invoice_type"]
          updated_at?: string
          variable_symbol?: string | null
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          document_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          document_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          document_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      legal_document_versions: {
        Row: {
          content_md: string | null
          created_at: string
          document_type: string
          id: string
          is_current: boolean
          published_at: string
          updated_at: string
          version: string
        }
        Insert: {
          content_md?: string | null
          created_at?: string
          document_type: string
          id?: string
          is_current?: boolean
          published_at?: string
          updated_at?: string
          version: string
        }
        Update: {
          content_md?: string | null
          created_at?: string
          document_type?: string
          id?: string
          is_current?: boolean
          published_at?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          invoice_id: string
          method: string | null
          note: string | null
          paid_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          id?: string
          invoice_id: string
          method?: string | null
          note?: string | null
          paid_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          method?: string | null
          note?: string | null
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          code: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          unit: string
          unit_price: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          active?: boolean
          code?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          unit?: string
          unit_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          active?: boolean
          code?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          unit?: string
          unit_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quote_email_logs: {
        Row: {
          company_id: string
          created_at: string
          error_message: string | null
          id: string
          message: string | null
          provider_message_id: string | null
          quote_id: string
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string | null
          provider_message_id?: string | null
          quote_id: string
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string | null
          provider_message_id?: string | null
          quote_id?: string
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_email_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_email_logs_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          product_id: string | null
          quantity: number
          quote_id: string
          subtotal: number
          total: number
          unit: string
          unit_price: number
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          product_id?: string | null
          quantity?: number
          quote_id: string
          subtotal?: number
          total?: number
          unit?: string
          unit_price?: number
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          product_id?: string | null
          quantity?: number
          quote_id?: string
          subtotal?: number
          total?: number
          unit?: string
          unit_price?: number
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          company_id: string
          converted_at: string | null
          converted_invoice_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_city: string | null
          customer_country: string | null
          customer_dic: string | null
          customer_email: string | null
          customer_ic_dph: string | null
          customer_ico: string | null
          customer_id: string | null
          customer_name: string | null
          customer_street: string | null
          customer_zip: string | null
          deleted_at: string | null
          external_id: string | null
          id: string
          issue_date: string
          notes: string | null
          pdf_url: string | null
          quote_number: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          total: number
          updated_at: string
          valid_until: string
          vat_total: number
        }
        Insert: {
          company_id: string
          converted_at?: string | null
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_city?: string | null
          customer_country?: string | null
          customer_dic?: string | null
          customer_email?: string | null
          customer_ic_dph?: string | null
          customer_ico?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_street?: string | null
          customer_zip?: string | null
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          pdf_url?: string | null
          quote_number: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          valid_until?: string
          vat_total?: number
        }
        Update: {
          company_id?: string
          converted_at?: string | null
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_city?: string | null
          customer_country?: string | null
          customer_dic?: string | null
          customer_email?: string | null
          customer_ic_dph?: string | null
          customer_ico?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_street?: string | null
          customer_zip?: string | null
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          pdf_url?: string | null
          quote_number?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          valid_until?: string
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_converted_invoice_id_fkey"
            columns: ["converted_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoice_logs: {
        Row: {
          company_id: string
          created_at: string
          error_message: string | null
          id: string
          invoice_id: string | null
          recurring_invoice_id: string
          run_type: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          recurring_invoice_id: string
          run_type?: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          recurring_invoice_id?: string
          run_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoice_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoice_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoice_logs_recurring_invoice_id_fkey"
            columns: ["recurring_invoice_id"]
            isOneToOne: false
            referencedRelation: "recurring_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoices: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          customer_city: string | null
          customer_country: string | null
          customer_dic: string | null
          customer_email: string | null
          customer_ic_dph: string | null
          customer_ico: string | null
          customer_id: string | null
          customer_name: string | null
          customer_street: string | null
          customer_zip: string | null
          deleted_at: string | null
          due_days: number
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id: string
          items: Json
          last_invoice_id: string | null
          last_run_at: string | null
          name: string
          next_run: string
          notes: string | null
          payment_method: string
          subtotal: number
          total: number
          updated_at: string
          vat_total: number
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_city?: string | null
          customer_country?: string | null
          customer_dic?: string | null
          customer_email?: string | null
          customer_ic_dph?: string | null
          customer_ico?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_street?: string | null
          customer_zip?: string | null
          deleted_at?: string | null
          due_days?: number
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          items?: Json
          last_invoice_id?: string | null
          last_run_at?: string | null
          name: string
          next_run: string
          notes?: string | null
          payment_method?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat_total?: number
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_city?: string | null
          customer_country?: string | null
          customer_dic?: string | null
          customer_email?: string | null
          customer_ic_dph?: string | null
          customer_ico?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_street?: string | null
          customer_zip?: string | null
          deleted_at?: string | null
          due_days?: number
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          items?: Json
          last_invoice_id?: string | null
          last_run_at?: string | null
          name?: string
          next_run?: string
          notes?: string | null
          payment_method?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_last_invoice_id_fkey"
            columns: ["last_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_audit_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          barcode: string | null
          company_id: string
          created_at: string
          id: string
          min_stock: number
          product_id: string | null
          purchase_price: number
          sale_price: number
          sku: string | null
          track_stock: boolean
          unit: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          barcode?: string | null
          company_id: string
          created_at?: string
          id?: string
          min_stock?: number
          product_id?: string | null
          purchase_price?: number
          sale_price?: number
          sku?: string | null
          track_stock?: boolean
          unit?: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          barcode?: string | null
          company_id?: string
          created_at?: string
          id?: string
          min_stock?: number
          product_id?: string | null
          purchase_price?: number
          sale_price?: number
          sku?: string | null
          track_stock?: boolean
          unit?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          company_id: string
          id: string
          quantity: number
          reserved_quantity: number
          stock_item_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          id?: string
          quantity?: number
          reserved_quantity?: number
          stock_item_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          id?: string
          quantity?: number
          reserved_quantity?: number
          stock_item_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          quantity: number
          reference_id: string | null
          reference_item_id: string | null
          reference_type: string | null
          reversed_movement_id: string | null
          stock_item_id: string
          total_value: number
          type: Database["public"]["Enums"]["stock_movement_type"]
          unit_price: number
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          quantity: number
          reference_id?: string | null
          reference_item_id?: string | null
          reference_type?: string | null
          reversed_movement_id?: string | null
          stock_item_id: string
          total_value?: number
          type: Database["public"]["Enums"]["stock_movement_type"]
          unit_price?: number
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          quantity?: number
          reference_id?: string | null
          reference_item_id?: string | null
          reference_type?: string | null
          reversed_movement_id?: string | null
          stock_item_id?: string
          total_value?: number
          type?: Database["public"]["Enums"]["stock_movement_type"]
          unit_price?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reversed_movement_id_fkey"
            columns: ["reversed_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean
          api_enabled: boolean
          bank_matching_enabled: boolean
          created_at: string
          efaktura_enabled: boolean
          id: string
          invoice_limit: number | null
          name: string
          price_monthly_cents: number | null
          priority_support: boolean
          recurring_enabled: boolean
          slug: string
          sort_order: number
          updated_at: string
          user_limit: number | null
          webhooks_enabled: boolean
        }
        Insert: {
          active?: boolean
          api_enabled?: boolean
          bank_matching_enabled?: boolean
          created_at?: string
          efaktura_enabled?: boolean
          id?: string
          invoice_limit?: number | null
          name: string
          price_monthly_cents?: number | null
          priority_support?: boolean
          recurring_enabled?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
          user_limit?: number | null
          webhooks_enabled?: boolean
        }
        Update: {
          active?: boolean
          api_enabled?: boolean
          bank_matching_enabled?: boolean
          created_at?: string
          efaktura_enabled?: boolean
          id?: string
          invoice_limit?: number | null
          name?: string
          price_monthly_cents?: number | null
          priority_support?: boolean
          recurring_enabled?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
          user_limit?: number | null
          webhooks_enabled?: boolean
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_suspended: boolean
          cancel_at_period_end: boolean
          company_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          external_subscription_id: string | null
          gopay_payment_id: string | null
          gopay_subscription_id: string | null
          id: string
          monthly_price_cents: number | null
          next_billing_at: string | null
          payment_provider: string | null
          plan: string
          plan_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_suspended?: boolean
          cancel_at_period_end?: boolean
          company_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          external_subscription_id?: string | null
          gopay_payment_id?: string | null
          gopay_subscription_id?: string | null
          id?: string
          monthly_price_cents?: number | null
          next_billing_at?: string | null
          payment_provider?: string | null
          plan?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_suspended?: boolean
          cancel_at_period_end?: boolean
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          external_subscription_id?: string | null
          gopay_payment_id?: string | null
          gopay_subscription_id?: string | null
          id?: string
          monthly_price_cents?: number | null
          next_billing_at?: string | null
          payment_provider?: string | null
          plan?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tesla_connections: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          encrypted_access_token: string | null
          encrypted_refresh_token: string | null
          error_message: string | null
          id: string
          last_sync_at: string | null
          sync_status: string | null
          tesla_account_email: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          sync_status?: string | null
          tesla_account_email?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          sync_status?: string | null
          tesla_account_email?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tesla_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tesla_sync_logs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message: string | null
          raw_response: Json | null
          status: string
          sync_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message?: string | null
          raw_response?: Json | null
          status: string
          sync_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message?: string | null
          raw_response?: Json | null
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tesla_sync_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tesla_vehicle_links: {
        Row: {
          company_id: string
          created_at: string
          faktero_vehicle_id: string | null
          id: string
          last_synced_at: string | null
          tesla_display_name: string | null
          tesla_license_plate: string | null
          tesla_vehicle_id: string
          tesla_vin: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          faktero_vehicle_id?: string | null
          id?: string
          last_synced_at?: string | null
          tesla_display_name?: string | null
          tesla_license_plate?: string | null
          tesla_vehicle_id: string
          tesla_vin?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          faktero_vehicle_id?: string | null
          id?: string
          last_synced_at?: string | null
          tesla_display_name?: string | null
          tesla_license_plate?: string | null
          tesla_vehicle_id?: string
          tesla_vin?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tesla_vehicle_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tesla_vehicle_links_faktero_vehicle_id_fkey"
            columns: ["faktero_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      tesla_vehicle_snapshots: {
        Row: {
          captured_at: string
          company_id: string
          created_at: string
          drive_state: Json | null
          faktero_vehicle_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          odometer_km: number | null
          raw_data: Json | null
          shift_state: string | null
          tesla_connection_id: string | null
          tesla_vehicle_id: string
        }
        Insert: {
          captured_at?: string
          company_id: string
          created_at?: string
          drive_state?: Json | null
          faktero_vehicle_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          odometer_km?: number | null
          raw_data?: Json | null
          shift_state?: string | null
          tesla_connection_id?: string | null
          tesla_vehicle_id: string
        }
        Update: {
          captured_at?: string
          company_id?: string
          created_at?: string
          drive_state?: Json | null
          faktero_vehicle_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          odometer_km?: number | null
          raw_data?: Json | null
          shift_state?: string | null
          tesla_connection_id?: string | null
          tesla_vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tesla_vehicle_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tesla_vehicle_snapshots_faktero_vehicle_id_fkey"
            columns: ["faktero_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tesla_vehicle_snapshots_tesla_connection_id_fkey"
            columns: ["tesla_connection_id"]
            isOneToOne: false
            referencedRelation: "tesla_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          average_speed_kmh: number | null
          company_id: string
          created_at: string
          created_by: string | null
          distance_km: number
          driver_name: string | null
          duration_seconds: number | null
          end_location: string | null
          end_odometer: number
          end_time: string | null
          external_id: string | null
          external_source: string | null
          fuel_consumption: number | null
          fuel_price: number | null
          id: string
          imported_at: string | null
          note: string | null
          purpose: string | null
          raw_provider_data: Json | null
          start_location: string | null
          start_odometer: number
          start_time: string | null
          trip_date: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          average_speed_kmh?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          distance_km: number
          driver_name?: string | null
          duration_seconds?: number | null
          end_location?: string | null
          end_odometer: number
          end_time?: string | null
          external_id?: string | null
          external_source?: string | null
          fuel_consumption?: number | null
          fuel_price?: number | null
          id?: string
          imported_at?: string | null
          note?: string | null
          purpose?: string | null
          raw_provider_data?: Json | null
          start_location?: string | null
          start_odometer: number
          start_time?: string | null
          trip_date: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          average_speed_kmh?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          distance_km?: number
          driver_name?: string | null
          duration_seconds?: number | null
          end_location?: string | null
          end_odometer?: number
          end_time?: string | null
          external_id?: string | null
          external_source?: string | null
          fuel_consumption?: number | null
          fuel_price?: number | null
          id?: string
          imported_at?: string | null
          note?: string | null
          purpose?: string | null
          raw_provider_data?: Json | null
          start_location?: string | null
          start_odometer?: number
          start_time?: string | null
          trip_date?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          company_id: string
          consumption_l_100km: number | null
          created_at: string
          fuel_type: string | null
          id: string
          initial_odometer: number
          license_plate: string | null
          name: string
          updated_at: string
          vehicle_type: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          consumption_l_100km?: number | null
          created_at?: string
          fuel_type?: string | null
          id?: string
          initial_odometer?: number
          license_plate?: string | null
          name: string
          updated_at?: string
          vehicle_type?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          consumption_l_100km?: number | null
          created_at?: string
          fuel_type?: string | null
          id?: string
          initial_odometer?: number
          license_plate?: string | null
          name?: string
          updated_at?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_delivery_logs: {
        Row: {
          attempt_count: number
          company_id: string
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event_type: string
          id: string
          payload: Json | null
          response_body: string | null
          response_status: number | null
          status: string
          webhook_id: string
        }
        Insert: {
          attempt_count?: number
          company_id: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          status?: string
          webhook_id: string
        }
        Update: {
          attempt_count?: number
          company_id?: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          status?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_delivery_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          company_id: string
          created_at: string
          event: string
          id: string
          payload: Json | null
          response: string | null
          status: number | null
          webhook_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event: string
          id?: string
          payload?: Json | null
          response?: string | null
          status?: number | null
          webhook_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event?: string
          id?: string
          payload?: Json | null
          response?: string | null
          status?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          events: string[]
          id: string
          secret: string | null
          url: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          events?: string[]
          id?: string
          secret?: string | null
          url: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          events?: string[]
          id?: string
          secret?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_stock_movement: {
        Args: {
          _company_id: string
          _delta: number
          _stock_item_id: string
          _warehouse_id: string
        }
        Returns: undefined
      }
      create_company_with_owner: {
        Args: {
          _city?: string
          _country?: string
          _default_currency?: string
          _dic?: string
          _email?: string
          _iban?: string
          _ic_dph?: string
          _ico?: string
          _name: string
          _phone?: string
          _street?: string
          _zip?: string
        }
        Returns: string
      }
      default_warehouse_id: { Args: { _company_id: string }; Returns: string }
      faktero_can_write: {
        Args: { _company_id: string; _kind: string }
        Returns: boolean
      }
      faktero_recurring_cron_status: { Args: never; Returns: Json }
      get_company_role: {
        Args: { _company_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["company_role"]
      }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      accounting_system: "pohoda" | "omega" | "money" | "alfa_plus" | "other"
      api_key_mode: "test" | "live"
      company_role: "owner" | "admin" | "accountant" | "employee"
      efaktura_channel: "peppol" | "digitalny_postar" | "email" | "manual"
      efaktura_delivery_status:
        | "pending"
        | "sent"
        | "accepted"
        | "delivered"
        | "failed"
        | "rejected"
      efaktura_doc_format: "ubl_2_1" | "peppol_bis_3" | "cii_d16b"
      efaktura_doc_status:
        | "draft"
        | "generated"
        | "validated"
        | "invalid"
        | "archived"
      efaktura_received_status:
        | "received"
        | "parsed"
        | "matched"
        | "accepted"
        | "rejected"
        | "archived"
      inventory_count_status: "open" | "completed" | "cancelled"
      invoice_status:
        | "draft"
        | "issued"
        | "sent"
        | "paid"
        | "overdue"
        | "cancelled"
      invoice_type: "regular" | "proforma" | "credit_note"
      quote_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "converted"
      recurring_frequency: "weekly" | "monthly" | "quarterly" | "yearly"
      stock_movement_type:
        | "prijem"
        | "vydaj"
        | "oprava"
        | "inventura"
        | "faktura"
        | "dobropis"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "cancelled"
        | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      accounting_system: ["pohoda", "omega", "money", "alfa_plus", "other"],
      api_key_mode: ["test", "live"],
      company_role: ["owner", "admin", "accountant", "employee"],
      efaktura_channel: ["peppol", "digitalny_postar", "email", "manual"],
      efaktura_delivery_status: [
        "pending",
        "sent",
        "accepted",
        "delivered",
        "failed",
        "rejected",
      ],
      efaktura_doc_format: ["ubl_2_1", "peppol_bis_3", "cii_d16b"],
      efaktura_doc_status: [
        "draft",
        "generated",
        "validated",
        "invalid",
        "archived",
      ],
      efaktura_received_status: [
        "received",
        "parsed",
        "matched",
        "accepted",
        "rejected",
        "archived",
      ],
      inventory_count_status: ["open", "completed", "cancelled"],
      invoice_status: [
        "draft",
        "issued",
        "sent",
        "paid",
        "overdue",
        "cancelled",
      ],
      invoice_type: ["regular", "proforma", "credit_note"],
      quote_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "converted",
      ],
      recurring_frequency: ["weekly", "monthly", "quarterly", "yearly"],
      stock_movement_type: [
        "prijem",
        "vydaj",
        "oprava",
        "inventura",
        "faktura",
        "dobropis",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "cancelled",
        "expired",
      ],
    },
  },
} as const
