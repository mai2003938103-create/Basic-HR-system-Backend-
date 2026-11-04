CREATE TYPE "public"."pay_run_status" AS ENUM('draft', 'pending', 'approved', 'paid');--> statement-breakpoint
CREATE TABLE "allowance_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_lo" text NOT NULL,
	"name_en" text NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowance_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "employee_allowances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"allowance_type_id" uuid NOT NULL,
	"amount" numeric(14, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pay_run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"basic" numeric(14, 0) NOT NULL,
	"period_work_days" integer NOT NULL,
	"paid_work_days" integer NOT NULL,
	"allowances" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"overtime_minutes_weekday" integer DEFAULT 0 NOT NULL,
	"overtime_minutes_restday" integer DEFAULT 0 NOT NULL,
	"bonus" numeric(14, 0) DEFAULT 0 NOT NULL,
	"other_deduction" numeric(14, 0) DEFAULT 0 NOT NULL,
	"unpaid_days" numeric(4, 1) DEFAULT 0 NOT NULL,
	"note" text,
	"manual_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"basic_earned" numeric(14, 0) DEFAULT 0 NOT NULL,
	"allowance_total" numeric(14, 0) DEFAULT 0 NOT NULL,
	"overtime_pay" numeric(14, 0) DEFAULT 0 NOT NULL,
	"unpaid_deduction" numeric(14, 0) DEFAULT 0 NOT NULL,
	"gross" numeric(14, 0) DEFAULT 0 NOT NULL,
	"ss_base" numeric(14, 0) DEFAULT 0 NOT NULL,
	"ss_employee" numeric(14, 0) DEFAULT 0 NOT NULL,
	"ss_employer" numeric(14, 0) DEFAULT 0 NOT NULL,
	"taxable" numeric(14, 0) DEFAULT 0 NOT NULL,
	"income_tax" numeric(14, 0) DEFAULT 0 NOT NULL,
	"total_deductions" numeric(14, 0) DEFAULT 0 NOT NULL,
	"net" numeric(14, 0) DEFAULT 0 NOT NULL,
	"employer_cost" numeric(14, 0) DEFAULT 0 NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pay_run_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"status" "pay_run_status" DEFAULT 'draft' NOT NULL,
	"pay_date" date NOT NULL,
	"config_snapshot" jsonb,
	"created_by_id" uuid,
	"submitted_by_id" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"paid_by_id" uuid,
	"paid_at" timestamp with time zone,
	"last_return_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_runs_period_unique" UNIQUE("period")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "overtime_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" RENAME COLUMN "address" TO "address_lo";--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "address_en" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bank_account" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "employee_allowances" ADD CONSTRAINT "employee_allowances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_allowances" ADD CONSTRAINT "employee_allowances_allowance_type_id_allowance_types_id_fk" FOREIGN KEY ("allowance_type_id") REFERENCES "public"."allowance_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_items" ADD CONSTRAINT "pay_items_pay_run_id_pay_runs_id_fk" FOREIGN KEY ("pay_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_items" ADD CONSTRAINT "pay_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_run_events" ADD CONSTRAINT "pay_run_events_pay_run_id_pay_runs_id_fk" FOREIGN KEY ("pay_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_run_events" ADD CONSTRAINT "pay_run_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_allowances_employee_id_allowance_type_id_index" ON "employee_allowances" USING btree ("employee_id","allowance_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_items_pay_run_id_employee_id_index" ON "pay_items" USING btree ("pay_run_id","employee_id");--> statement-breakpoint
CREATE INDEX "pay_items_employee_id_index" ON "pay_items" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "pay_run_events_pay_run_id_created_at_index" ON "pay_run_events" USING btree ("pay_run_id","created_at");