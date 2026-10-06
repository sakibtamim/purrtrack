ALTER TABLE "guild_settings" ADD COLUMN "last_announced_month" varchar(20);--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "auto_report_config" jsonb DEFAULT '{"enabled":false,"format":"excel","includePayroll":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "last_reported_month" varchar(20);