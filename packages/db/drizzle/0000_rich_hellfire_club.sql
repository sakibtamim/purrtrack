CREATE TABLE "discord_users" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"global_name" varchar(100),
	"avatar_url" varchar(500),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_channels" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_afk" boolean DEFAULT false NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"tracking_enabled" boolean DEFAULT true NOT NULL,
	"track_muted" boolean DEFAULT true NOT NULL,
	"track_deafened" boolean DEFAULT false NOT NULL,
	"exclude_afk" boolean DEFAULT true NOT NULL,
	"min_duration_seconds" integer DEFAULT 10 NOT NULL,
	"timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
	"ignored_channel_ids" jsonb DEFAULT '[]'::jsonb,
	"admin_role_ids" jsonb DEFAULT '[]'::jsonb,
	"announce_channel_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"initial_channel_id" varchar(32) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"metadata" jsonb DEFAULT '{"mutedSeconds":0,"deafenedSeconds":0,"streamingSeconds":0,"channelSwitches":0}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"channel_name" varchar(100),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"was_muted" boolean DEFAULT false NOT NULL,
	"was_deafened" boolean DEFAULT false NOT NULL,
	"was_streaming" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_segments" ADD CONSTRAINT "session_segments_session_id_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_sessions_guild_user_idx" ON "voice_sessions" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "voice_sessions_started_at_idx" ON "voice_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "voice_sessions_status_idx" ON "voice_sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_active_user_guild_session" ON "voice_sessions" USING btree ("guild_id","user_id") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "session_segments_session_id_idx" ON "session_segments" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_segments_channel_id_idx" ON "session_segments" USING btree ("channel_id");