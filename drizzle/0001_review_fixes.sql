ALTER TABLE "leave_requests" ADD COLUMN "days_by_year" jsonb;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "replaced_at" timestamp with time zone;