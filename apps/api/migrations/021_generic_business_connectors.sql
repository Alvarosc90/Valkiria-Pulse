ALTER TABLE tenant_links
  MODIFY COLUMN source VARCHAR(80) NOT NULL;

ALTER TABLE external_identities
  MODIFY COLUMN source VARCHAR(80) NOT NULL;

ALTER TABLE growth_audiences
  MODIFY COLUMN source_type VARCHAR(80) NOT NULL DEFAULT 'manual';

CREATE TABLE business_connectors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(36) NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NULL,
  connector_key VARCHAR(80) NOT NULL,
  provider_key VARCHAR(80) NOT NULL,
  display_name VARCHAR(190) NOT NULL,
  external_tenant_id VARCHAR(190) NULL,
  status ENUM('active','paused','revoked') NOT NULL DEFAULT 'active',
  auth_mode ENUM('jwt_hs256') NOT NULL DEFAULT 'jwt_hs256',
  issuer VARCHAR(190) NOT NULL,
  audience VARCHAR(190) NOT NULL DEFAULT 'valkiria-pulse-growth',
  secret_enc MEDIUMTEXT NOT NULL,
  secret_version INT UNSIGNED NOT NULL DEFAULT 1,
  capabilities_json JSON NULL,
  settings_json JSON NULL,
  last_seen_at DATETIME(3) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_business_connectors_public (public_id),
  UNIQUE KEY uq_business_connectors_tenant_key (tenant_id, connector_key),
  KEY idx_business_connectors_provider (tenant_id, provider_key, status),
  KEY idx_business_connectors_external (provider_key, external_tenant_id),
  CONSTRAINT fk_business_connectors_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_business_connectors_brand
    FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  CONSTRAINT fk_business_connectors_creator
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE growth_signals
  ADD COLUMN connector_id BIGINT UNSIGNED NULL AFTER brand_id,
  ADD KEY idx_growth_signals_connector (connector_id, occurred_at),
  ADD CONSTRAINT fk_growth_signals_connector
    FOREIGN KEY (connector_id) REFERENCES business_connectors(id) ON DELETE SET NULL;
