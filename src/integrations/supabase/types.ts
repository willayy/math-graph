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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      axioms: {
        Row: {
          citation: string | null
          created_at: string
          creator: string | null
          date: string | null
          id: string
          name: string
          statement: string
        }
        Insert: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          name: string
          statement: string
        }
        Update: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          name?: string
          statement?: string
        }
        Relationships: []
      }
      change_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conjectures: {
        Row: {
          citation: string | null
          created_at: string
          creator: string | null
          date: string | null
          id: string
          name: string
          statement: string
        }
        Insert: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          name: string
          statement: string
        }
        Update: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          name?: string
          statement?: string
        }
        Relationships: []
      }
      definitions: {
        Row: {
          citation: string | null
          created_at: string
          creator: string | null
          date: string | null
          id: string
          name: string
          statement: string
        }
        Insert: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          name: string
          statement: string
        }
        Update: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          name?: string
          statement?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      proofs: {
        Row: {
          citation: string | null
          created_at: string
          creator: string | null
          date: string | null
          id: string
          name: string
          statement: string
          theorem_id: string
        }
        Insert: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          name: string
          statement: string
          theorem_id: string
        }
        Update: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          name?: string
          statement?: string
          theorem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_proofs_theorems"
            columns: ["theorem_id"]
            isOneToOne: false
            referencedRelation: "theorems"
            referencedColumns: ["id"]
          },
        ]
      }
      set_elements: {
        Row: {
          element_id: string
          element_type: string
          id: string
          set_id: string
        }
        Insert: {
          element_id: string
          element_type: string
          id?: string
          set_id: string
        }
        Update: {
          element_id?: string
          element_type?: string
          id?: string
          set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_set_elements_sets"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      sets: {
        Row: {
          citation: string | null
          created_at: string
          creator: string | null
          date: string | null
          description: string
          id: string
          name: string
        }
        Insert: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          description?: string
          id?: string
          name: string
        }
        Update: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          description?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      submission_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          submission_id: string
          suggested_statement: string | null
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          submission_id: string
          suggested_statement?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          submission_id?: string
          suggested_statement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_comments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_links: {
        Row: {
          id: string
          relation: string
          submission_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          id?: string
          relation: string
          submission_id: string
          target_id: string
          target_type: string
        }
        Update: {
          id?: string
          relation?: string
          submission_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_links_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_votes: {
        Row: {
          approve: boolean
          created_at: string
          submission_id: string
          voter_id: string
        }
        Insert: {
          approve: boolean
          created_at?: string
          submission_id: string
          voter_id: string
        }
        Update: {
          approve?: boolean
          created_at?: string
          submission_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_votes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          author_id: string
          citation: string | null
          created_at: string
          creator: string | null
          date: string | null
          id: string
          kind: string
          name: string
          published_id: string | null
          statement: string
          status: string
          updated_at: string
        }
        Insert: {
          author_id: string
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          kind: string
          name: string
          published_id?: string | null
          statement: string
          status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          kind?: string
          name?: string
          published_id?: string | null
          statement?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      theorem_uses: {
        Row: {
          id: string
          theorem_id: string
          used_id: string
          used_type: string
        }
        Insert: {
          id?: string
          theorem_id: string
          used_id: string
          used_type: string
        }
        Update: {
          id?: string
          theorem_id?: string
          used_id?: string
          used_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_theorem_uses_theorems"
            columns: ["theorem_id"]
            isOneToOne: false
            referencedRelation: "theorems"
            referencedColumns: ["id"]
          },
        ]
      }
      theorems: {
        Row: {
          citation: string | null
          created_at: string
          creator: string | null
          date: string | null
          id: string
          name: string
          statement: string
        }
        Insert: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          name: string
          statement: string
        }
        Update: {
          citation?: string | null
          created_at?: string
          creator?: string | null
          date?: string | null
          id?: string
          name?: string
          statement?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          collections: Json
          floating: boolean
          layout: Json
          strong_edges: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          collections?: Json
          floating?: boolean
          layout?: Json
          strong_edges?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          collections?: Json
          floating?: boolean
          layout?: Json
          strong_edges?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_academic: { Args: { _uid: string }; Returns: boolean }
      publish_if_approved: { Args: { _sid: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
