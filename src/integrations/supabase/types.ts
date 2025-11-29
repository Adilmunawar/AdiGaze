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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          preferences: Json | null
          settings: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          preferences?: Json | null
          settings?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          preferences?: Json | null
          settings?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      candidate_bookmarks: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_bookmarks_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_matches: {
        Row: {
          candidate_email: string | null
          candidate_id: string
          candidate_location: string | null
          candidate_name: string
          candidate_phone: string | null
          company: string | null
          created_at: string
          experience_years: number | null
          id: string
          job_role: string | null
          key_strengths: string[]
          match_score: number
          potential_concerns: string[]
          reasoning: string
          search_id: string
        }
        Insert: {
          candidate_email?: string | null
          candidate_id: string
          candidate_location?: string | null
          candidate_name: string
          candidate_phone?: string | null
          company?: string | null
          created_at?: string
          experience_years?: number | null
          id?: string
          job_role?: string | null
          key_strengths?: string[]
          match_score: number
          potential_concerns?: string[]
          reasoning: string
          search_id: string
        }
        Update: {
          candidate_email?: string | null
          candidate_id?: string
          candidate_location?: string | null
          candidate_name?: string
          candidate_phone?: string | null
          company?: string | null
          created_at?: string
          experience_years?: number | null
          id?: string
          job_role?: string | null
          key_strengths?: string[]
          match_score?: number
          potential_concerns?: string[]
          reasoning?: string
          search_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_matches_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "job_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      data_backups: {
        Row: {
          created_at: string
          data: Json
          id: string
          label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      google_drive_backups: {
        Row: {
          created_at: string
          drive_file_id: string | null
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_searches: {
        Row: {
          created_at: string
          id: string
          job_description: string
          total_candidates: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_description: string
          total_candidates?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_description?: string
          total_candidates?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          education: string | null
          email: string | null
          embedding: string | null
          experience: string | null
          full_name: string | null
          id: string
          job_title: string | null
          location: string | null
          phone_number: string | null
          resume_file_url: string | null
          resume_text: string | null
          sector: string | null
          skills: string[] | null
          user_id: string | null
          years_of_experience: number | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          education?: string | null
          email?: string | null
          embedding?: string | null
          experience?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          location?: string | null
          phone_number?: string | null
          resume_file_url?: string | null
          resume_text?: string | null
          sector?: string | null
          skills?: string[] | null
          user_id?: string | null
          years_of_experience?: number | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          education?: string | null
          email?: string | null
          embedding?: string | null
          experience?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          location?: string | null
          phone_number?: string | null
          resume_file_url?: string | null
          resume_text?: string | null
          sector?: string | null
          skills?: string[] | null
          user_id?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_profiles: {
        Args: {
          filter_user_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          avatar_url: string | null
          created_at: string | null
          education: string | null
          email: string | null
          embedding: string | null
          experience: string | null
          full_name: string | null
          id: string
          job_title: string | null
          location: string | null
          phone_number: string | null
          resume_file_url: string | null
          resume_text: string | null
          sector: string | null
          skills: string[] | null
          user_id: string | null
          years_of_experience: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
    Enums: {},
  },
} as const
