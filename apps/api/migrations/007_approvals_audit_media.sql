ALTER TABLE media_assets
  ADD COLUMN public_token_hash CHAR(64) NULL AFTER metadata_json,
  ADD COLUMN public_until DATETIME NULL AFTER public_token_hash,
  ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER public_until,
  ADD KEY idx_media_assets_public_until (public_until),
  ADD CONSTRAINT fk_media_assets_created_by FOREIGN KEY (created_by) REFERENCES users(id);

CREATE TABLE content_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  calendar_entry_id BIGINT UNSIGNED NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  note TEXT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_content_approvals_entry (calendar_entry_id),
  KEY idx_content_approvals_tenant_status (tenant_id, status),
  CONSTRAINT fk_content_approvals_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_content_approvals_entry FOREIGN KEY (calendar_entry_id) REFERENCES calendar_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_content_approvals_requested_by FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_content_approvals_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(120) NULL,
  metadata_json JSON NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_events_tenant_created (tenant_id, created_at),
  KEY idx_audit_events_entity (tenant_id, entity_type, entity_id),
  CONSTRAINT fk_audit_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_audit_events_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
