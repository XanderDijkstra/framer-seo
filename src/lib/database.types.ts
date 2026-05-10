// Hand-written types matching the Supabase schema in supabase/migrations.
// Regenerate with `supabase gen types typescript` once you wire the CLI.

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          company_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          avatar_url?: string | null;
          company_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          avatar_url?: string | null;
          company_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      company_profile: {
        Row: {
          id: string;
          company_name: string;
          services: string[];
          cpv_codes: string[];
          core_cpv_prefixes: string[];
          search_keywords: string;
          boost_keywords: string[];
          penalty_keywords: string[];
          preferred_regions: string[];
          cannot_deliver: string[];
          strengths: string[];
          budget_min: number;
          budget_max: number;
          team_size: number;
          pipeline_schedule: "daily" | "weekly";
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["company_profile"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["company_profile"]["Row"]>;
        Relationships: [];
      };
      notices: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          buyer: string | null;
          buyer_location: string | null;
          estimated_value: number | null;
          currency: string | null;
          deadline: string | null;
          cpv_codes: Json | null;
          notice_type: string | null;
          url: string | null;
          raw_json: Json | null;
          scored: boolean;
          notified: boolean;
          favorited: boolean;
          fetched_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          title: string;
          description?: string | null;
          buyer?: string | null;
          buyer_location?: string | null;
          estimated_value?: number | null;
          currency?: string | null;
          deadline?: string | null;
          cpv_codes?: Json | null;
          notice_type?: string | null;
          url?: string | null;
          raw_json?: Json | null;
          scored?: boolean;
          notified?: boolean;
          favorited?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["notices"]["Row"]>;
        Relationships: [];
      };
      scores: {
        Row: {
          id: string;
          notice_id: string;
          company_id: string | null;
          relevance: number | null;
          size_fit: number | null;
          win_probability: number | null;
          geography_fit: number | null;
          deadline_comfort: number | null;
          composite: number | null;
          category: string | null;
          summary_no: string | null;
          reasons_to_bid: string[] | null;
          red_flags: string[] | null;
          recommended_action: "BID" | "REVIEW" | "SKIP" | null;
          scored_at: string;
        };
        Insert: {
          notice_id: string;
          company_id?: string | null;
          relevance?: number | null;
          size_fit?: number | null;
          win_probability?: number | null;
          geography_fit?: number | null;
          deadline_comfort?: number | null;
          composite?: number | null;
          category?: string | null;
          summary_no?: string | null;
          reasons_to_bid?: string[] | null;
          red_flags?: string[] | null;
          recommended_action?: "BID" | "REVIEW" | "SKIP" | null;
        };
        Update: Partial<Database["public"]["Tables"]["scores"]["Row"]>;
        Relationships: [];
      };
      company_favorites: {
        Row: {
          id: string;
          company_id: string;
          notice_id: string;
          created_at: string;
        };
        Insert: {
          company_id: string;
          notice_id: string;
        };
        Update: Partial<{
          company_id: string;
          notice_id: string;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_company_for_current_user: {
        Args: {
          p_company_name: string;
          p_services: string[];
          p_cpv_codes: string[];
          p_core_cpv_prefixes: string[];
          p_search_keywords: string;
          p_boost_keywords: string[];
          p_penalty_keywords: string[];
          p_preferred_regions: string[];
          p_cannot_deliver: string[];
          p_strengths: string[];
          p_budget_min: number;
          p_budget_max: number;
          p_team_size: number;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
