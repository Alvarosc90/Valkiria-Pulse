CREATE TABLE media_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('image','video','document') NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NULL,
  mime_type VARCHAR(120) NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_assets_tenant_brand (tenant_id, brand_id),
  CONSTRAINT fk_media_assets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_media_assets_brand FOREIGN KEY (brand_id) REFERENCES brands(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE calendar_imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NOT NULL,
  platform ENUM('instagram','tiktok','linkedin') NOT NULL,
  filename VARCHAR(255) NOT NULL,
  rows_total INT UNSIGNED NOT NULL DEFAULT 0,
  rows_valid INT UNSIGNED NOT NULL DEFAULT 0,
  rows_invalid INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('processing','completed','failed') NOT NULL DEFAULT 'processing',
  error_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_calendar_imports_tenant_platform (tenant_id, platform),
  CONSTRAINT fk_calendar_imports_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_calendar_imports_brand FOREIGN KEY (brand_id) REFERENCES brands(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE calendar_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NOT NULL,
  import_id BIGINT UNSIGNED NULL,
  platform ENUM('instagram','tiktok','linkedin') NOT NULL,
  scheduled_at_utc DATETIME NOT NULL,
  timezone VARCHAR(80) NOT NULL,
  topic VARCHAR(255) NOT NULL,
  objective VARCHAR(255) NULL,
  angle VARCHAR(255) NULL,
  copy_seed TEXT NULL,
  cta VARCHAR(255) NULL,
  platform_payload_json JSON NULL,
  status ENUM('draft','ready','scheduled','processing','published','failed') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_calendar_entries_due (status, scheduled_at_utc),
  KEY idx_calendar_entries_tenant_platform (tenant_id, platform),
  CONSTRAINT fk_calendar_entries_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_calendar_entries_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_calendar_entries_import FOREIGN KEY (import_id) REFERENCES calendar_imports(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE publication_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  calendar_entry_id BIGINT UNSIGNED NOT NULL,
  social_account_id BIGINT UNSIGNED NOT NULL,
  status ENUM('queued','processing','published','failed','canceled') NOT NULL DEFAULT 'queued',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  external_publish_id VARCHAR(255) NULL,
  generated_payload_json JSON NULL,
  last_error TEXT NULL,
  next_attempt_at DATETIME NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_publication_jobs_queue (status, next_attempt_at),
  KEY idx_publication_jobs_tenant (tenant_id),
  CONSTRAINT fk_publication_jobs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_publication_jobs_entry FOREIGN KEY (calendar_entry_id) REFERENCES calendar_entries(id),
  CONSTRAINT fk_publication_jobs_account FOREIGN KEY (social_account_id) REFERENCES social_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE publication_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  publication_job_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_publication_events_job (publication_job_id, created_at),
  CONSTRAINT fk_publication_events_job FOREIGN KEY (publication_job_id)
    REFERENCES publication_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
