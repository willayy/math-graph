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
      lemmas: {
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
            foreignKeyName: "fk_lemmas_theorems"
            columns: ["theorem_id"]
            isOneToOne: false
            referencedRelation: "theorems"
            referencedColumns: ["id"]
          },
        ]
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
          floating: boolean
          layout: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          floating?: boolean
          layout?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          floating?: boolean
          layout?: Json
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
      [_ in never]: never
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
