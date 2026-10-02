CREATE TABLE "user_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"weekly_target_seconds" integer DEFAULT 72000 NOT NULL,
	"week_start_day" varchar(16) DEFAULT 'monday' NOT NULL,
	"current_streak_days" integer DEFAULT 0 NOT NULL,
	"last_active_date" varchar(10),
	"has_active_goal" boolean DEFAULT false NOT NULL,
	"cycle_start_date" timestamp with time zone,
	"equipped_badge_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_goals_count" integer DEFAULT 0 NOT NULL,
	"completed_focus_sprints" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"badge_id" varchar(64) NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"hourly_rate_cents" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'BDT' NOT NULL,
	"set_by_user_id" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"adjusted_by_user_id" varchar(32) NOT NULL,
	"type" varchar(10) NOT NULL,
	"duration_seconds" integer NOT NULL,
	"reason" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "track_streaming" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "track_camera" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "max_inactive_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "session_segments" ADD COLUMN "was_video" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "session_segments" ADD COLUMN "is_focus" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "session_segments" ADD COLUMN "focus_task" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_guild_goal" ON "user_goals" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_guild_badge" ON "user_badges" USING btree ("guild_id","user_id","badge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_guild_contractor_rate" ON "contractor_rates" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_time_adj_guild_user" ON "time_adjustments" USING btree ("guild_id","user_id");