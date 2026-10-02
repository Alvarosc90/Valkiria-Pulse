ALTER TABLE calendar_entries
  ADD COLUMN target_social_account_id BIGINT UNSIGNED NULL AFTER brand_id,
  ADD KEY idx_calendar_entries_target_account (target_social_account_id),
  ADD CONSTRAINT fk_calendar_entries_target_account
    FOREIGN KEY (target_social_account_id) REFERENCES social_accounts(id);

ALTER TABLE publication_jobs
  ADD UNIQUE KEY uq_publication_job_entry_account (calendar_entry_id, social_account_id);
