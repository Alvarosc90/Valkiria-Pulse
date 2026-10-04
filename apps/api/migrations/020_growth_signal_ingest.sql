CREATE TABLE growth_signals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NULL,
  source_system VARCHAR(80) NOT NULL,
  external_event_id VARCHAR(190) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  subject_ref VARCHAR(190) NULL,
  contact_id BIGINT UNSIGNED NULL,
  occurred_at DATETIME(3) NOT NULL,
  payload_json JSON NULL,
  processing_status ENUM('pending','processed','ignored','failed') NOT NULL DEFAULT 'pending',
  processing_note VARCHAR(500) NULL,
  processed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_growth_signal_external (tenant_id, source_system, external_event_id),
  KEY idx_growth_signals_pending (tenant_id, processing_status, occurred_at),
  KEY idx_growth_signals_event (tenant_id, source_system, event_type, occurred_at),
  CONSTRAINT fk_growth_signals_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_growth_signals_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_growth_signals_contact
    FOREIGN KEY (contact_id) REFERENCES growth_contacts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
