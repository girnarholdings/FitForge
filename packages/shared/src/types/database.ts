/**
 * FitForge — hand-written Postgres `Database` type.
 *
 * This mirrors supabase/migrations/0001–0005 (BLUEPRINT §4 + §5.2/§5.3) exactly so the web
 * client and this shared package are typed before the Supabase stack exists.
 *
 * REGENERATE POST-INTEGRATION:
 *   supabase gen types typescript --local > packages/shared/src/types/database.ts
 * The generated file will supersede this one; keep the enum value lists in `./enums.ts`
 * in sync if the schema drifts.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* ------------------------------------------------------------------ enums (§4.1) */

export type GoalType = 'strength' | 'hypertrophy' | 'fat_loss' | 'endurance' | 'general_health';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type TrainingLocation = 'home' | 'commercial_gym' | 'minimal';
export type UnitSystem = 'metric' | 'imperial';
export type SexType = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type EquipmentCategory =
  | 'free_weights'
  | 'machines'
  | 'cables'
  | 'bodyweight_accessories'
  | 'cardio'
  | 'benches_racks'
  // 'other' exists because plyometric kit (a plyo box) is furniture you jump on: it is not a
  // weight, not a stack-and-pulley machine, and not cardio. Widened in migration 0006 alongside
  // the conditioning/mobility/static_stretch movement patterns from the 59→91 catalog expansion.
  | 'other';
export type MuscleRegion = 'upper' | 'lower' | 'core';
export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'elbow_flexion'
  | 'elbow_extension'
  | 'shoulder_isolation'
  | 'core_flexion'
  | 'core_stability'
  | 'carry'
  | 'hip_extension_iso'
  | 'knee_flexion_iso'
  | 'knee_extension_iso'
  | 'calf_raise'
  | 'cardio'
  | 'conditioning'
  | 'mobility'
  | 'static_stretch';
export type MechanicsType = 'compound' | 'isolation';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type MuscleRole = 'primary' | 'secondary';
export type PreferenceType = 'favorite' | 'excluded';
export type ExclusionReason = 'injury' | 'dislike' | 'no_equipment' | 'other';
export type RoutineSource = 'generated' | 'custom';
export type FoodCategory =
  | 'protein'
  | 'grain'
  | 'vegetable'
  | 'fruit'
  | 'dairy'
  | 'fat_oil'
  | 'legume'
  | 'nut_seed'
  | 'beverage'
  | 'snack'
  | 'condiment';
export type DietType =
  | 'omnivore'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'keto'
  | 'mediterranean'
  | 'none';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type TargetsSource = 'suggested' | 'custom';
export type PhotoPose = 'front' | 'side' | 'back';

/* ------------------------------------------------------------------ helpers */

type Timestamps = { created_at: string; updated_at: string };

/* ------------------------------------------------------------------ Database */

export interface Database {
  public: {
    Tables: {
      /* ---------- catalog plane (§4.2) ---------- */
      equipment: {
        Row: {
          id: string;
          slug: string;
          name: string;
          category: EquipmentCategory;
          description: string | null;
          common_in_home: boolean;
          common_in_gym: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          category: EquipmentCategory;
          description?: string | null;
          common_in_home?: boolean;
          common_in_gym?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['equipment']['Insert']>;
        Relationships: [];
      };
      muscle_groups: {
        Row: {
          id: string;
          slug: string;
          name: string;
          region: MuscleRegion;
          display_order: number;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          region: MuscleRegion;
          display_order?: number;
        };
        Update: Partial<Database['public']['Tables']['muscle_groups']['Insert']>;
        Relationships: [];
      };
      muscles: {
        Row: {
          id: string;
          slug: string;
          name: string;
          latin_name: string | null;
          muscle_group_id: string;
          is_front: boolean;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          latin_name?: string | null;
          muscle_group_id: string;
          is_front?: boolean;
        };
        Update: Partial<Database['public']['Tables']['muscles']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'muscles_muscle_group_id_fkey';
            columns: ['muscle_group_id'];
            referencedRelation: 'muscle_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_categories: {
        Row: { id: string; slug: string; name: string; display_order: number };
        Insert: { id?: string; slug: string; name: string; display_order?: number };
        Update: Partial<Database['public']['Tables']['exercise_categories']['Insert']>;
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          slug: string;
          name: string;
          aliases: string[];
          category_id: string;
          movement_pattern: MovementPattern;
          mechanics: MechanicsType;
          difficulty: DifficultyLevel;
          is_unilateral: boolean;
          is_bodyweight_ok: boolean;
          instructions: string | null;
          video_url: string | null;
          image_path: string | null;
          tags: string[];
          popularity: number;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          aliases?: string[];
          category_id: string;
          movement_pattern: MovementPattern;
          mechanics: MechanicsType;
          difficulty?: DifficultyLevel;
          is_unilateral?: boolean;
          is_bodyweight_ok?: boolean;
          instructions?: string | null;
          video_url?: string | null;
          image_path?: string | null;
          tags?: string[];
          popularity?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['exercises']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'exercises_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'exercise_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_muscles: {
        Row: { exercise_id: string; muscle_id: string; role: MuscleRole };
        Insert: { exercise_id: string; muscle_id: string; role: MuscleRole };
        Update: Partial<Database['public']['Tables']['exercise_muscles']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'exercise_muscles_exercise_id_fkey';
            columns: ['exercise_id'];
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exercise_muscles_muscle_id_fkey';
            columns: ['muscle_id'];
            referencedRelation: 'muscles';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_equipment: {
        Row: { exercise_id: string; equipment_id: string; alt_group: number };
        Insert: { exercise_id: string; equipment_id: string; alt_group?: number };
        Update: Partial<Database['public']['Tables']['exercise_equipment']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'exercise_equipment_exercise_id_fkey';
            columns: ['exercise_id'];
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exercise_equipment_equipment_id_fkey';
            columns: ['equipment_id'];
            referencedRelation: 'equipment';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_substitutions: {
        Row: {
          exercise_id: string;
          substitute_id: string;
          similarity: number;
          reason: string | null;
        };
        Insert: {
          exercise_id: string;
          substitute_id: string;
          similarity?: number;
          reason?: string | null;
        };
        Update: Partial<Database['public']['Tables']['exercise_substitutions']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'exercise_substitutions_exercise_id_fkey';
            columns: ['exercise_id'];
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exercise_substitutions_substitute_id_fkey';
            columns: ['substitute_id'];
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      foods: {
        Row: {
          id: string;
          slug: string;
          name: string;
          brand: string | null;
          category: FoodCategory;
          kcal: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g: number;
          sugar_g: number;
          sodium_mg: number;
          serving_name: string;
          serving_grams: number;
          diet_tags: string[];
          allergen_tags: string[];
          verified: boolean;
          source: string;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          brand?: string | null;
          category: FoodCategory;
          kcal: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g?: number;
          sugar_g?: number;
          sodium_mg?: number;
          serving_name: string;
          serving_grams: number;
          diet_tags?: string[];
          allergen_tags?: string[];
          verified?: boolean;
          source?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['foods']['Insert']>;
        Relationships: [];
      };

      /* ---------- user plane (§4.3) ---------- */
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          sex: SexType | null;
          birthdate: string | null;
          height_cm: number | null;
          unit_system: UnitSystem;
          experience_level: ExperienceLevel | null;
          primary_goal: GoalType | null;
          secondary_goal: GoalType | null;
          training_location: TrainingLocation | null;
          days_per_week: number | null;
          session_minutes: number | null;
          preferred_days: number[];
          onboarding_step: string;
          onboarding_completed_at: string | null;
        } & Timestamps;
        Insert: {
          id: string;
          display_name?: string | null;
          sex?: SexType | null;
          birthdate?: string | null;
          height_cm?: number | null;
          unit_system?: UnitSystem;
          experience_level?: ExperienceLevel | null;
          primary_goal?: GoalType | null;
          secondary_goal?: GoalType | null;
          training_location?: TrainingLocation | null;
          days_per_week?: number | null;
          session_minutes?: number | null;
          preferred_days?: number[];
          onboarding_step?: string;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      user_equipment: {
        Row: { user_id: string; equipment_id: string; created_at: string };
        Insert: { user_id: string; equipment_id: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['user_equipment']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'user_equipment_equipment_id_fkey';
            columns: ['equipment_id'];
            referencedRelation: 'equipment';
            referencedColumns: ['id'];
          },
        ];
      };
      user_exercise_preferences: {
        Row: {
          user_id: string;
          exercise_id: string;
          preference: PreferenceType;
          exclusion_reason: ExclusionReason | null;
          preferred_substitute_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          exercise_id: string;
          preference: PreferenceType;
          exclusion_reason?: ExclusionReason | null;
          preferred_substitute_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_exercise_preferences']['Insert']>;
        Relationships: [];
      };
      user_movement_exclusions: {
        Row: {
          user_id: string;
          movement_pattern: MovementPattern;
          reason: ExclusionReason;
          source_body_area: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          movement_pattern: MovementPattern;
          reason?: ExclusionReason;
          source_body_area?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_movement_exclusions']['Insert']>;
        Relationships: [];
      };
      nutrition_profiles: {
        Row: {
          user_id: string;
          diet_type: DietType;
          allergies: string[];
          meals_per_day: number;
          kcal_target: number | null;
          protein_g_target: number | null;
          carbs_g_target: number | null;
          fat_g_target: number | null;
          targets_source: TargetsSource;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          diet_type?: DietType;
          allergies?: string[];
          meals_per_day?: number;
          kcal_target?: number | null;
          protein_g_target?: number | null;
          carbs_g_target?: number | null;
          fat_g_target?: number | null;
          targets_source?: TargetsSource;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['nutrition_profiles']['Insert']>;
        Relationships: [];
      };
      user_food_preferences: {
        Row: {
          user_id: string;
          food_id: string;
          preference: PreferenceType;
          created_at: string;
        };
        Insert: {
          user_id: string;
          food_id: string;
          preference: PreferenceType;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_food_preferences']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'user_food_preferences_food_id_fkey';
            columns: ['food_id'];
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      routines: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          goal: GoalType | null;
          source: RoutineSource;
          is_active: boolean;
          start_date: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          goal?: GoalType | null;
          source?: RoutineSource;
          is_active?: boolean;
          start_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['routines']['Insert']>;
        Relationships: [];
      };
      routine_days: {
        Row: {
          id: string;
          routine_id: string;
          day_index: number;
          name: string;
          focus: string | null;
          weekday: number | null;
        };
        Insert: {
          id?: string;
          routine_id: string;
          day_index: number;
          name: string;
          focus?: string | null;
          weekday?: number | null;
        };
        Update: Partial<Database['public']['Tables']['routine_days']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'routine_days_routine_id_fkey';
            columns: ['routine_id'];
            referencedRelation: 'routines';
            referencedColumns: ['id'];
          },
        ];
      };
      routine_exercises: {
        Row: {
          id: string;
          routine_day_id: string;
          position: number;
          exercise_id: string;
          sets: number;
          rep_min: number;
          rep_max: number;
          target_rpe: number | null;
          rest_seconds: number;
          superset_group: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          routine_day_id: string;
          position: number;
          exercise_id: string;
          sets?: number;
          rep_min?: number;
          rep_max?: number;
          target_rpe?: number | null;
          rest_seconds?: number;
          superset_group?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['routine_exercises']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'routine_exercises_routine_day_id_fkey';
            columns: ['routine_day_id'];
            referencedRelation: 'routine_days';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'routine_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          routine_day_id: string | null;
          started_at: string;
          completed_at: string | null;
          perceived_effort: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          routine_day_id?: string | null;
          started_at?: string;
          completed_at?: string | null;
          perceived_effort?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['workout_sessions']['Insert']>;
        Relationships: [];
      };
      set_logs: {
        Row: {
          id: string;
          session_id: string;
          exercise_id: string;
          exercise_name_snapshot: string;
          set_number: number;
          reps: number;
          weight_kg: number;
          rpe: number | null;
          is_warmup: boolean;
          completed_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          exercise_id: string;
          exercise_name_snapshot: string;
          set_number: number;
          reps: number;
          weight_kg?: number;
          rpe?: number | null;
          is_warmup?: boolean;
          completed_at?: string;
        };
        Update: Partial<Database['public']['Tables']['set_logs']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'set_logs_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'workout_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      meals: {
        Row: { id: string; user_id: string; name: string; created_at: string };
        Insert: { id?: string; user_id: string; name: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['meals']['Insert']>;
        Relationships: [];
      };
      meal_items: {
        Row: { id: string; meal_id: string; food_id: string; quantity_g: number };
        Insert: { id?: string; meal_id: string; food_id: string; quantity_g: number };
        Update: Partial<Database['public']['Tables']['meal_items']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'meal_items_meal_id_fkey';
            columns: ['meal_id'];
            referencedRelation: 'meals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meal_items_food_id_fkey';
            columns: ['food_id'];
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      nutrition_logs: {
        Row: {
          id: string;
          user_id: string;
          logged_on: string;
          meal_slot: MealSlot;
          food_id: string | null;
          custom_name: string | null;
          quantity_g: number | null;
          kcal: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          logged_on?: string;
          meal_slot: MealSlot;
          food_id?: string | null;
          custom_name?: string | null;
          quantity_g?: number | null;
          kcal: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['nutrition_logs']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'nutrition_logs_food_id_fkey';
            columns: ['food_id'];
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      body_metrics: {
        Row: {
          id: string;
          user_id: string;
          measured_on: string;
          weight_kg: number | null;
          body_fat_pct: number | null;
          waist_cm: number | null;
          chest_cm: number | null;
          hips_cm: number | null;
          arm_cm: number | null;
          thigh_cm: number | null;
          neck_cm: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          measured_on?: string;
          weight_kg?: number | null;
          body_fat_pct?: number | null;
          waist_cm?: number | null;
          chest_cm?: number | null;
          hips_cm?: number | null;
          arm_cm?: number | null;
          thigh_cm?: number | null;
          neck_cm?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['body_metrics']['Insert']>;
        Relationships: [];
      };
      progress_photos: {
        Row: {
          id: string;
          user_id: string;
          taken_on: string;
          pose: PhotoPose;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          taken_on?: string;
          pose?: PhotoPose;
          storage_path: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['progress_photos']['Insert']>;
        Relationships: [];
      };
    };

    /* ---------- views (§5.2) ---------- */
    Views: {
      v_exercise_full: {
        Row: {
          id: string;
          slug: string;
          name: string;
          category_slug: string;
          category_name: string;
          movement_pattern: MovementPattern;
          mechanics: MechanicsType;
          difficulty: DifficultyLevel;
          is_unilateral: boolean;
          is_bodyweight_ok: boolean;
          instructions: string | null;
          video_url: string | null;
          image_path: string | null;
          popularity: number;
          primary_muscle_slugs: string[];
          secondary_muscle_slugs: string[];
          equipment_slugs: string[];
        };
        Relationships: [];
      };
      v_daily_nutrition: {
        Row: {
          user_id: string;
          logged_on: string;
          kcal: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
        };
        Relationships: [];
      };
      v_exercise_prs: {
        Row: {
          user_id: string;
          exercise_id: string;
          best_e1rm: number;
          best_weight_kg: number;
        };
        Relationships: [];
      };
    };

    /* ---------- RPCs (§5.3) ---------- */
    Functions: {
      search_exercises: {
        Args: {
          q: string;
          p_limit?: number;
          filter_equipment?: boolean;
          category_slug?: string | null;
        };
        Returns: {
          exercise_id: string;
          slug: string;
          name: string;
          matched_alias: string | null;
          score: number;
        }[];
      };
      search_foods: {
        Args: { q: string; p_limit?: number; apply_diet_filter?: boolean };
        Returns: {
          food_id: string;
          slug: string;
          name: string;
          brand: string | null;
          kcal: number;
          protein_g: number;
          serving_name: string;
          serving_grams: number;
          score: number;
        }[];
      };
      suggest_substitutes: {
        Args: { p_exercise_id: string; p_limit?: number };
        Returns: {
          exercise_id: string;
          slug: string;
          name: string;
          score: number;
          reason: string | null;
        }[];
      };
      suggest_nutrition_targets: {
        Args: Record<string, never>;
        Returns: {
          kcal: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          method: string;
        }[];
      };
      suggest_onboarding_defaults: {
        Args: { p_goal: GoalType; p_experience: ExperienceLevel };
        Returns: {
          days_per_week: number;
          session_minutes: number;
          rep_min: number;
          rep_max: number;
          split_name: string;
        }[];
      };
      generate_starter_routine: {
        Args: { p_name?: string | null };
        Returns: string;
      };
      onboarding_status: {
        Args: Record<string, never>;
        Returns: {
          complete: boolean;
          missing: string[];
          resume_step: string;
        }[];
      };
      set_user_equipment: {
        Args: { equipment_slugs: string[] };
        Returns: undefined;
      };
      log_food: {
        Args: {
          p_food_id: string;
          p_quantity_g: number;
          p_meal_slot: MealSlot;
          p_logged_on?: string | null;
        };
        Returns: string;
      };
      previous_sets: {
        Args: { p_exercise_id: string };
        Returns: {
          set_number: number;
          reps: number;
          weight_kg: number;
          rpe: number | null;
        }[];
      };
    };
    Enums: {
      goal_type: GoalType;
      experience_level: ExperienceLevel;
      training_location: TrainingLocation;
      unit_system: UnitSystem;
      sex_type: SexType;
      equipment_category: EquipmentCategory;
      muscle_region: MuscleRegion;
      movement_pattern: MovementPattern;
      mechanics_type: MechanicsType;
      difficulty_level: DifficultyLevel;
      muscle_role: MuscleRole;
      preference_type: PreferenceType;
      exclusion_reason: ExclusionReason;
      routine_source: RoutineSource;
      food_category: FoodCategory;
      diet_type: DietType;
      meal_slot: MealSlot;
      targets_source: TargetsSource;
      photo_pose: PhotoPose;
    };
    CompositeTypes: Record<string, never>;
  };
}

/* ------------------------------------------------------------------ row helpers */

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
export type FunctionArgs<T extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][T]['Args'];
export type FunctionReturns<T extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][T]['Returns'];
