CREATE TABLE video_credit_packs (
  pack_key VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  credits INT UNSIGNED NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (pack_key),
  KEY idx_video_credit_packs_status_order (status, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE video_credit_pack_prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pack_key VARCHAR(80) NOT NULL,
  currency CHAR(3) NOT NULL,
  unit_amount_minor BIGINT UNSIGNED NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_video_credit_pack_price (pack_key, currency),
  KEY idx_video_credit_pack_prices_catalog (status, currency, display_order),
  CONSTRAINT fk_video_credit_pack_price_pack
    FOREIGN KEY (pack_key) REFERENCES video_credit_packs(pack_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_video_credit_wallets (
  tenant_id BIGINT UNSIGNED NOT NULL,
  available_credits BIGINT UNSIGNED NOT NULL DEFAULT 0,
  reserved_credits BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lifetime_purchased_credits BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lifetime_consumed_credits BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id),
  CONSTRAINT fk_video_credit_wallet_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE video_credit_checkout_sessions (
  id CHAR(36) NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  requested_by_user_id BIGINT UNSIGNED NOT NULL,
  pack_key VARCHAR(80) NOT NULL,
  pack_price_id BIGINT UNSIGNED NOT NULL,
  credits INT UNSIGNED NOT NULL,
  provider VARCHAR(40) NULL,
  status ENUM('prepared','pending','completed','expired','cancelled','failed') NOT NULL DEFAULT 'prepared',
  idempotency_key VARCHAR(190) NOT NULL,
  external_session_id VARCHAR(190) NULL,
  checkout_url VARCHAR(1000) NULL,
  provider_status VARCHAR(80) NULL,
  provider_payload_json JSON NULL,
  expires_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_video_credit_checkout_tenant_idempotency (tenant_id, idempotency_key),
  KEY idx_video_credit_checkout_status (status, expires_at),
  KEY idx_video_credit_checkout_external (provider, external_session_id),
  CONSTRAINT fk_video_credit_checkout_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_video_credit_checkout_user
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_video_credit_checkout_pack
    FOREIGN KEY (pack_key) REFERENCES video_credit_packs(pack_key),
  CONSTRAINT fk_video_credit_checkout_price
    FOREIGN KEY (pack_price_id) REFERENCES video_credit_pack_prices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE video_credit_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  entry_type ENUM('purchase','grant','reserve','release','consume','refund','adjustment') NOT NULL,
  available_delta BIGINT NOT NULL DEFAULT 0,
  reserved_delta BIGINT NOT NULL DEFAULT 0,
  checkout_id CHAR(36) NULL,
  reservation_id CHAR(36) NULL,
  generation_ref VARCHAR(190) NULL,
  note VARCHAR(500) NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_video_credit_ledger_tenant_created (tenant_id, created_at),
  KEY idx_video_credit_ledger_checkout (checkout_id),
  KEY idx_video_credit_ledger_reservation (reservation_id),
  CONSTRAINT fk_video_credit_ledger_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_video_credit_ledger_checkout
    FOREIGN KEY (checkout_id) REFERENCES video_credit_checkout_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE video_model_catalog (
  model_key VARCHAR(100) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  provider_model_id VARCHAR(190) NULL,
  name VARCHAR(160) NOT NULL,
  tier ENUM('fast','quality','premium') NOT NULL,
  billing_unit ENUM('second','video') NOT NULL,
  provider_cost_usd_per_unit DECIMAL(12,6) NOT NULL,
  pulse_credits_per_unit INT UNSIGNED NOT NULL,
  generation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  price_verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (model_key),
  KEY idx_video_model_catalog_active (status, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE video_credit_reservations (
  id CHAR(36) NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  model_key VARCHAR(100) NOT NULL,
  requested_units DECIMAL(12,3) NOT NULL,
  reserved_credits INT UNSIGNED NOT NULL,
  status ENUM('reserved','captured','released','expired') NOT NULL DEFAULT 'reserved',
  generation_ref VARCHAR(190) NULL,
  metadata_json JSON NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_video_reservation_tenant_status (tenant_id, status, expires_at),
  CONSTRAINT fk_video_reservation_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_video_reservation_model
    FOREIGN KEY (model_key) REFERENCES video_model_catalog(model_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO video_credit_packs
(pack_key, name, description, credits, status, display_order, metadata_json)
VALUES
('launch_500', 'Video Start', 'Para probar generación de video premium sin compromisos mensuales.', 500, 'active', 10,
 JSON_OBJECT('providerBudgetUsd', 5, 'commercialMarginTarget', 0.65)),
('creator_1500', 'Video Creator', 'Para marcas que producen video de forma recurrente.', 1500, 'active', 20,
 JSON_OBJECT('providerBudgetUsd', 15, 'commercialMarginTarget', 0.62, 'recommended', true)),
('studio_4000', 'Video Studio', 'Para campañas y equipos con mayor volumen audiovisual.', 4000, 'active', 30,
 JSON_OBJECT('providerBudgetUsd', 40, 'commercialMarginTarget', 0.60))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  credits = VALUES(credits),
  status = VALUES(status),
  display_order = VALUES(display_order),
  metadata_json = VALUES(metadata_json);

INSERT INTO video_credit_pack_prices
(pack_key, currency, unit_amount_minor, status, display_order, metadata_json)
VALUES
('launch_500', 'ARS', 1990000, 'active', 10, JSON_OBJECT('launch', true, 'taxesIncluded', false)),
('launch_500', 'USD', 1490, 'active', 11, JSON_OBJECT('launch', true, 'taxesIncluded', false)),
('creator_1500', 'ARS', 5290000, 'active', 20, JSON_OBJECT('launch', true, 'taxesIncluded', false)),
('creator_1500', 'USD', 3990, 'active', 21, JSON_OBJECT('launch', true, 'taxesIncluded', false)),
('studio_4000', 'ARS', 12990000, 'active', 30, JSON_OBJECT('launch', true, 'taxesIncluded', false)),
('studio_4000', 'USD', 9900, 'active', 31, JSON_OBJECT('launch', true, 'taxesIncluded', false))
ON DUPLICATE KEY UPDATE
  unit_amount_minor = VALUES(unit_amount_minor),
  status = VALUES(status),
  display_order = VALUES(display_order),
  metadata_json = VALUES(metadata_json);

INSERT INTO video_model_catalog
(model_key, provider, provider_model_id, name, tier, billing_unit,
 provider_cost_usd_per_unit, pulse_credits_per_unit, generation_enabled,
 status, display_order, metadata_json, price_verified_at)
VALUES
('wan-2.5', 'fal', NULL, 'Video Fast · Wan 2.5', 'fast', 'second',
 0.050000, 5, 0, 'active', 10,
 JSON_OBJECT('commercialLabel', 'Video Fast', 'priceSource', 'fal.ai/pricing'), UTC_TIMESTAMP()),
('kling-2.5-turbo-pro', 'fal', NULL, 'Video Quality · Kling 2.5 Turbo Pro', 'quality', 'second',
 0.070000, 7, 0, 'active', 20,
 JSON_OBJECT('commercialLabel', 'Video Quality', 'priceSource', 'fal.ai/pricing'), UTC_TIMESTAMP()),
('veo-3', 'fal', NULL, 'Video Premium · Veo 3', 'premium', 'second',
 0.400000, 40, 0, 'active', 30,
 JSON_OBJECT('commercialLabel', 'Video Premium', 'priceSource', 'fal.ai/pricing'), UTC_TIMESTAMP()),
('ovi', 'fal', NULL, 'Video Fast · Ovi', 'fast', 'video',
 0.200000, 20, 0, 'active', 40,
 JSON_OBJECT('commercialLabel', 'Video Fast', 'priceSource', 'fal.ai/pricing'), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE
  provider = VALUES(provider),
  name = VALUES(name),
  tier = VALUES(tier),
  billing_unit = VALUES(billing_unit),
  provider_cost_usd_per_unit = VALUES(provider_cost_usd_per_unit),
  pulse_credits_per_unit = VALUES(pulse_credits_per_unit),
  status = VALUES(status),
  display_order = VALUES(display_order),
  metadata_json = VALUES(metadata_json),
  price_verified_at = VALUES(price_verified_at);

INSERT INTO saas_plan_entitlements
(plan_key, entitlement_key, enabled, limit_value, metadata_json)
SELECT plan_key, 'video_credit_purchases', 1, NULL,
       JSON_OBJECT('billing', 'prepaid', 'includedCredits', 0)
FROM saas_plans
ON DUPLICATE KEY UPDATE
  enabled = VALUES(enabled),
  limit_value = VALUES(limit_value),
  metadata_json = VALUES(metadata_json);
