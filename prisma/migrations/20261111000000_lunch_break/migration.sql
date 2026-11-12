-- Lunch break, deducted from worked minutes.
ALTER TABLE `company_settings` ADD COLUMN `break_start` VARCHAR(5) NOT NULL DEFAULT '12:00',
    ADD COLUMN `break_end` VARCHAR(5) NOT NULL DEFAULT '13:30';
