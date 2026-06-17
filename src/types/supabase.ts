export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: never[];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<{
        id: string;
        email: string | null;
        display_name: string | null;
        language: string;
        timezone: string;
        onboarding_completed: boolean;
        created_at: string;
        updated_at: string;
      }>;
      admin_users: TableDefinition<{
        user_id: string;
        created_at: string;
      }>;
      teams: TableDefinition<{
        id: string;
        external_id: string | null;
        code: string;
        name: string;
        short_name: string | null;
        country: string | null;
        color_hex: string | null;
        badge_variant: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      drivers: TableDefinition<{
        id: string;
        external_id: string | null;
        code: string | null;
        permanent_number: number | null;
        first_name: string;
        last_name: string;
        full_name: string;
        country: string | null;
        current_team_id: string | null;
        avatar_style_key: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      circuits: TableDefinition<{
        id: string;
        external_id: string | null;
        name: string;
        country: string | null;
        locality: string | null;
        latitude: number | null;
        longitude: number | null;
        timezone: string | null;
        created_at: string;
        updated_at: string;
      }>;
      seasons: TableDefinition<{
        year: number;
        created_at: string;
      }>;
      news_sources: TableDefinition<{
        id: string;
        name: string;
        source_type: string;
        url: string;
        language: string | null;
        is_active: boolean;
        fetch_interval_minutes: number;
        last_fetched_at: string | null;
        last_success_at: string | null;
        last_error: string | null;
        created_at: string;
        updated_at: string;
      }>;
      news_articles: TableDefinition<{
        id: string;
        source_id: string | null;
        canonical_url: string;
        original_url: string | null;
        original_title: string;
        original_description: string | null;
        original_language: string | null;
        published_at: string | null;
        fetched_at: string;
        ai_summary_ru: string | null;
        ai_summary_long_ru: string | null;
        ai_key_points_ru: string[];
        ai_title_ru: string | null;
        importance_score: number;
        status: string;
        duplicate_of: string | null;
        related_race_id: string | null;
        raw_payload: Json | null;
        ai_model: string | null;
        ai_processed_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      tags: TableDefinition<{
        id: string;
        type: string;
        slug: string;
        name: string;
        created_at: string;
      }>;
      news_article_tags: TableDefinition<{
        article_id: string;
        tag_id: string;
        confidence: number;
        method: string;
      }>;
      social_sources: TableDefinition<{
        id: string;
        platform: string;
        name: string;
        source_type: string;
        url: string;
        adapter: string;
        feed_kind: string | null;
        is_active: boolean;
        fetch_interval_minutes: number;
        last_fetched_at: string | null;
        last_success_at: string | null;
        last_error: string | null;
        created_at: string;
        updated_at: string;
      }>;
      social_posts: TableDefinition<{
        id: string;
        platform: string;
        source_id: string | null;
        external_id: string;
        author: string | null;
        title: string | null;
        body: string | null;
        original_url: string;
        image_url: string | null;
        published_at: string | null;
        reaction_count: number | null;
        popularity_score: number;
        raw_payload: Json | null;
        last_synced_at: string;
        created_at: string;
        updated_at: string;
      }>;
      grand_prix_reports: TableDefinition<{
        id: string;
        season: number;
        round: number;
        race_slug: string;
        race_name: string;
        circuit_name: string | null;
        country: string | null;
        race_date: string | null;
        status: string;
        is_hidden: boolean;
        source_updated_at: string | null;
        generated_at: string | null;
        summary_status: string;
        ai_summary: string | null;
        weather: Json;
        race_statistics: Json;
        results: Json;
        key_events: Json;
        pit_stops: Json;
        strategies: Json;
        teammate_comparisons: Json;
        highlights: Json;
        championship_impact: Json;
        source_errors: Json;
        last_error: string | null;
        refresh_stage: number;
        next_refresh_at: string | null;
        structured_hash: string | null;
        created_at: string;
        updated_at: string;
      }>;
      article_reactions: TableDefinition<{
        article_id: string;
        user_id: string;
        reaction: string;
        created_at: string;
      }>;
      user_favorite_teams: TableDefinition<{
        user_id: string;
        team_id: string;
        created_at: string;
      }>;
      user_favorite_drivers: TableDefinition<{
        user_id: string;
        driver_id: string;
        created_at: string;
      }>;
      races: TableDefinition<{
        id: string;
        season_year: number;
        round: number;
        race_name: string;
        circuit_id: string | null;
        official_url: string | null;
        race_start_at: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
      sessions: TableDefinition<{
        id: string;
        race_id: string;
        session_type: string;
        name: string;
        start_at: string | null;
        end_at: string | null;
        status: string;
        openf1_session_key: number | null;
        created_at: string;
        updated_at: string;
      }>;
      driver_standings: TableDefinition<{
        id: string;
        season_year: number;
        round: number | null;
        driver_id: string;
        team_id: string | null;
        position: number | null;
        points: number;
        wins: number;
        raw_payload: Json | null;
        updated_at: string;
      }>;
      constructor_standings: TableDefinition<{
        id: string;
        season_year: number;
        round: number | null;
        team_id: string;
        position: number | null;
        points: number;
        wins: number;
        raw_payload: Json | null;
        updated_at: string;
      }>;
      session_results: TableDefinition<{
        id: string;
        session_id: string;
        driver_id: string | null;
        team_id: string | null;
        position: number | null;
        classified_position: string | null;
        grid: number | null;
        laps: number | null;
        points: number | null;
        status: string | null;
        time_text: string | null;
        raw_payload: Json | null;
        created_at: string;
        updated_at: string;
      }>;
      circuit_weather: TableDefinition<{
        id: string;
        race_id: string | null;
        circuit_id: string | null;
        temperature_c: number | null;
        wind_speed_kmh: number | null;
        precipitation_mm: number | null;
        weather_code: number | null;
        observed_at: string | null;
        provider: string;
        raw_payload: Json | null;
        created_at: string;
        updated_at: string;
      }>;
      circuit_layouts: TableDefinition<{
        id: string;
        circuit_id: string;
        provider: string;
        svg_path: string;
        view_box: string;
        source_session_key: number | null;
        raw_payload: Json | null;
        created_at: string;
        updated_at: string;
      }>;
      session_weather: TableDefinition<{
        id: string;
        session_id: string;
        race_id: string | null;
        circuit_id: string | null;
        temperature_c: number | null;
        wind_speed_kmh: number | null;
        precipitation_mm: number | null;
        weather_code: number | null;
        forecast_at: string | null;
        provider: string;
        raw_payload: Json | null;
        created_at: string;
        updated_at: string;
      }>;
      prediction_leagues: TableDefinition<{
        id: string;
        owner_user_id: string;
        name: string;
        invite_code: string;
        is_public: boolean;
        created_at: string;
        updated_at: string;
      }>;
      prediction_league_members: TableDefinition<{
        league_id: string;
        user_id: string;
        role: string;
        joined_at: string;
      }>;
      predictions: TableDefinition<{
        id: string;
        user_id: string;
        race_id: string;
        league_id: string | null;
        pole_driver_id: string | null;
        winner_driver_id: string | null;
        fastest_lap_driver_id: string | null;
        dnf_driver_id: string | null;
        top3_driver_ids: string[] | null;
        top10_driver_ids: string[] | null;
        submitted_at: string;
        locked_at: string | null;
        score: number | null;
        scored_at: string | null;
      }>;
      polls: TableDefinition<{
        id: string;
        race_id: string | null;
        question: string;
        status: string;
        closes_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      poll_options: TableDefinition<{
        id: string;
        poll_id: string;
        label: string;
        sort_order: number;
      }>;
      poll_votes: TableDefinition<{
        poll_id: string;
        option_id: string;
        user_id: string;
        created_at: string;
      }>;
      digests: TableDefinition<{
        id: string;
        digest_type: string;
        date_key: string | null;
        race_id: string | null;
        title: string;
        body_md: string;
        ai_model: string | null;
        generated_at: string;
        status: string;
      }>;
      job_runs: TableDefinition<{
        id: string;
        job_name: string;
        status: string;
        started_at: string;
        finished_at: string | null;
        items_processed: number;
        error_message: string | null;
        metadata: Json | null;
      }>;
      ai_usage_logs: TableDefinition<{
        id: string;
        purpose: string;
        provider: string;
        model: string;
        input_tokens: number | null;
        output_tokens: number | null;
        estimated_cost_usd: number | null;
        related_article_id: string | null;
        related_digest_id: string | null;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: never;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
