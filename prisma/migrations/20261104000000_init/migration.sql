-- Systory HRMS initial schema (MySQL 8.4).
-- Generated from prisma/schema.prisma in Prisma's migration format, plus two hand edits:
--   * employees.search_text uses utf8mb4_bin so Lao tone marks and vowels never compare as equal;
--   * company_settings keeps a single row (CHECK id = 1).

-- CreateTable
CREATE TABLE `departments` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name_lo` VARCHAR(200) NOT NULL,
    `name_en` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `manager_id` CHAR(36) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `departments_code_key`(`code`),
    INDEX `departments_manager_id_idx`(`manager_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `positions` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name_lo` VARCHAR(200) NOT NULL,
    `name_en` VARCHAR(200) NOT NULL,
    `department_id` CHAR(36) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `positions_code_key`(`code`),
    INDEX `positions_department_id_idx`(`department_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `employees` (
    `id` CHAR(36) NOT NULL,
    `employee_code` VARCHAR(30) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `gender` ENUM('male', 'female', 'other') NOT NULL,
    `date_of_birth` DATE NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `address` TEXT NULL,
    `photo_url` TEXT NULL,
    `department_id` CHAR(36) NOT NULL,
    `position_id` CHAR(36) NOT NULL,
    `hire_date` DATE NOT NULL,
    `employment_status` ENUM('active', 'probation', 'inactive', 'terminated') NOT NULL DEFAULT 'active',
    `basic_salary` DECIMAL(14, 2) NOT NULL DEFAULT 0.0,
    `emergency_contact_name` TEXT NULL,
    `emergency_contact_phone` VARCHAR(20) NULL,
    `emergency_contact_relation` TEXT NULL,
    `bank_name` TEXT NULL,
    `bank_account` VARCHAR(40) NULL,
    `end_date` DATE NULL,
    `search_text` VARCHAR(700) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `employees_employee_code_key`(`employee_code`),
    UNIQUE INDEX `employees_email_key`(`email`),
    INDEX `employees_department_id_employment_status_idx`(`department_id`, `employment_status`),
    INDEX `employees_last_name_first_name_idx`(`last_name`, `first_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `last_login_at` DATETIME(3) NULL,
    `employee_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_employee_id_key`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `name_lo` VARCHAR(200) NOT NULL,
    `name_en` VARCHAR(200) NOT NULL,
    `scope` ENUM('all', 'department', 'self') NOT NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `module` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `permissions_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `user_roles_role_id_idx`(`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` CHAR(36) NOT NULL,
    `permission_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `role_permissions_permission_id_idx`(`permission_id`),
    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token_hash` VARCHAR(128) NOT NULL,
    `type` ENUM('refresh', 'password_reset') NOT NULL DEFAULT 'refresh',
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `replaced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `actor_user_id` CHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity` VARCHAR(50) NOT NULL,
    `entity_id` VARCHAR(64) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `audit_logs_entity_entity_id_idx`(`entity`, `entity_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    INDEX `audit_logs_actor_user_id_idx`(`actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `attendance` (
    `id` CHAR(36) NOT NULL,
    `employee_id` CHAR(36) NOT NULL,
    `work_date` DATE NOT NULL,
    `check_in_at` DATETIME(3) NULL,
    `check_out_at` DATETIME(3) NULL,
    `worked_minutes` INTEGER NOT NULL DEFAULT 0,
    `late_minutes` INTEGER NOT NULL DEFAULT 0,
    `early_leave_minutes` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('present', 'late', 'absent', 'half_day', 'leave') NOT NULL,
    `overtime_minutes` INTEGER NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `check_in_ip` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `attendance_employee_id_work_date_key`(`employee_id`, `work_date`),
    INDEX `attendance_work_date_idx`(`work_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `leave_types` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name_lo` VARCHAR(200) NOT NULL,
    `name_en` VARCHAR(200) NOT NULL,
    `default_days_per_year` DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
    `is_paid` BOOLEAN NOT NULL DEFAULT true,
    `document_required_after_days` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `leave_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `leave_balances` (
    `id` CHAR(36) NOT NULL,
    `employee_id` CHAR(36) NOT NULL,
    `leave_type_id` CHAR(36) NOT NULL,
    `year` INTEGER NOT NULL,
    `entitled_days` DECIMAL(5, 1) NOT NULL,
    `used_days` DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `leave_balances_employee_id_leave_type_id_year_key`(`employee_id`, `leave_type_id`, `year`),
    INDEX `leave_balances_leave_type_id_idx`(`leave_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `leave_requests` (
    `id` CHAR(36) NOT NULL,
    `employee_id` CHAR(36) NOT NULL,
    `leave_type_id` CHAR(36) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `days` DECIMAL(5, 1) NOT NULL,
    `half_day` ENUM('none', 'morning', 'afternoon') NOT NULL DEFAULT 'none',
    `reason` TEXT NOT NULL,
    `document_url` TEXT NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    `approver_id` CHAR(36) NULL,
    `decided_at` DATETIME(3) NULL,
    `decision_note` TEXT NULL,
    `days_by_year` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `leave_requests_employee_id_status_idx`(`employee_id`, `status`),
    INDEX `leave_requests_status_start_date_idx`(`status`, `start_date`),
    INDEX `leave_requests_leave_type_id_idx`(`leave_type_id`),
    INDEX `leave_requests_approver_id_idx`(`approver_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `holidays` (
    `id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `name_lo` VARCHAR(200) NOT NULL,
    `name_en` VARCHAR(200) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `holidays_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `title_key` VARCHAR(200) NOT NULL,
    `data` JSON NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `notifications_user_id_read_at_idx`(`user_id`, `read_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `company_settings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `company_name_lo` VARCHAR(200) NOT NULL,
    `company_name_en` VARCHAR(200) NOT NULL,
    `logo_url` TEXT NULL,
    `address_lo` TEXT NULL,
    `address_en` TEXT NULL,
    `tax_id` VARCHAR(50) NULL,
    `phone` VARCHAR(50) NULL,
    `email` VARCHAR(254) NULL,
    `currency_code` VARCHAR(3) NOT NULL DEFAULT 'LAK',
    `currency_symbol` VARCHAR(10) NOT NULL DEFAULT '₭',
    `working_days` JSON NOT NULL,
    `work_start` VARCHAR(5) NOT NULL DEFAULT '08:00',
    `work_end` VARCHAR(5) NOT NULL DEFAULT '17:00',
    `late_grace_minutes` INTEGER NOT NULL DEFAULT 15,
    `half_day_minutes` INTEGER NOT NULL DEFAULT 240,
    `payroll_config` JSON NOT NULL,
    `notification_config` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `allowance_types` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name_lo` VARCHAR(200) NOT NULL,
    `name_en` VARCHAR(200) NOT NULL,
    `taxable` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `allowance_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `employee_allowances` (
    `id` CHAR(36) NOT NULL,
    `employee_id` CHAR(36) NOT NULL,
    `allowance_type_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(14, 0) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `employee_allowances_employee_id_allowance_type_id_key`(`employee_id`, `allowance_type_id`),
    INDEX `employee_allowances_allowance_type_id_idx`(`allowance_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `pay_runs` (
    `id` CHAR(36) NOT NULL,
    `period` VARCHAR(7) NOT NULL,
    `status` ENUM('draft', 'pending', 'approved', 'paid') NOT NULL DEFAULT 'draft',
    `pay_date` DATE NOT NULL,
    `config_snapshot` JSON NULL,
    `created_by_id` CHAR(36) NULL,
    `submitted_by_id` CHAR(36) NULL,
    `submitted_at` DATETIME(3) NULL,
    `approved_by_id` CHAR(36) NULL,
    `approved_at` DATETIME(3) NULL,
    `paid_by_id` CHAR(36) NULL,
    `paid_at` DATETIME(3) NULL,
    `last_return_note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `pay_runs_period_key`(`period`),
    INDEX `pay_runs_created_by_id_idx`(`created_by_id`),
    INDEX `pay_runs_submitted_by_id_idx`(`submitted_by_id`),
    INDEX `pay_runs_approved_by_id_idx`(`approved_by_id`),
    INDEX `pay_runs_paid_by_id_idx`(`paid_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `pay_items` (
    `id` CHAR(36) NOT NULL,
    `pay_run_id` CHAR(36) NOT NULL,
    `employee_id` CHAR(36) NOT NULL,
    `basic` DECIMAL(14, 0) NOT NULL,
    `period_work_days` INTEGER NOT NULL,
    `paid_work_days` INTEGER NOT NULL,
    `allowances` JSON NOT NULL,
    `overtime_minutes_weekday` INTEGER NOT NULL DEFAULT 0,
    `overtime_minutes_restday` INTEGER NOT NULL DEFAULT 0,
    `bonus` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `other_deduction` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `unpaid_days` DECIMAL(4, 1) NOT NULL DEFAULT 0.0,
    `note` TEXT NULL,
    `manual_fields` JSON NOT NULL,
    `basic_earned` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `allowance_total` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `overtime_pay` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `unpaid_deduction` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `gross` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `ss_base` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `ss_employee` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `ss_employer` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `taxable` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `income_tax` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `total_deductions` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `net` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `employer_cost` DECIMAL(14, 0) NOT NULL DEFAULT 0.0,
    `result` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `pay_items_pay_run_id_employee_id_key`(`pay_run_id`, `employee_id`),
    INDEX `pay_items_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `pay_run_events` (
    `id` CHAR(36) NOT NULL,
    `pay_run_id` CHAR(36) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `actor_id` CHAR(36) NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `pay_run_events_pay_run_id_created_at_idx`(`pay_run_id`, `created_at`),
    INDEX `pay_run_events_actor_id_idx`(`actor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_manager_id_fkey` FOREIGN KEY (`manager_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `positions` ADD CONSTRAINT `positions_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_balances` ADD CONSTRAINT `leave_balances_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_balances` ADD CONSTRAINT `leave_balances_leave_type_id_fkey` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_leave_type_id_fkey` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_approver_id_fkey` FOREIGN KEY (`approver_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_allowances` ADD CONSTRAINT `employee_allowances_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_allowances` ADD CONSTRAINT `employee_allowances_allowance_type_id_fkey` FOREIGN KEY (`allowance_type_id`) REFERENCES `allowance_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_runs` ADD CONSTRAINT `pay_runs_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_runs` ADD CONSTRAINT `pay_runs_submitted_by_id_fkey` FOREIGN KEY (`submitted_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_runs` ADD CONSTRAINT `pay_runs_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_runs` ADD CONSTRAINT `pay_runs_paid_by_id_fkey` FOREIGN KEY (`paid_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_items` ADD CONSTRAINT `pay_items_pay_run_id_fkey` FOREIGN KEY (`pay_run_id`) REFERENCES `pay_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_items` ADD CONSTRAINT `pay_items_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_run_events` ADD CONSTRAINT `pay_run_events_pay_run_id_fkey` FOREIGN KEY (`pay_run_id`) REFERENCES `pay_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_run_events` ADD CONSTRAINT `pay_run_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Single-row settings table
ALTER TABLE `company_settings` ADD CONSTRAINT `company_settings_single_row` CHECK (`id` = 1);
