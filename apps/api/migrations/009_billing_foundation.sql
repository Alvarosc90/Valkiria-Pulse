CREATE TABLE saas_plans (
  plan_key VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  limits_json JSON NULL,
  features_json JSON NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (plan_key),
  KEY idx_saas_plans_status_order (status, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE saas_plan_prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_key VARCHAR(80) NOT NULL,
  currency CHAR(3) NOT NULL,
  billing_interval ENUM('monthly','yearly') NOT NULL,
  unit_amount_minor BIGINT UNSIGNED NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_saas_plan_price (plan_key, currency, billing_interval),
  KEY idx_saas_plan_prices_catalog (status, currency, billing_interval, display_order),
  CONSTRAINT fk_saas_plan_prices_plan FOREIGN KEY (plan_key) REFERENCES saas_plans(plan_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE saas_plan_entitlements (
  plan_key VARCHAR(80) NOT NULL,
  entitlement_key VARCHAR(120) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  limit_value BIGINT NULL,
  metadata_json JSON NULL,
  PRIMARY KEY (plan_key, entitlement_key),
  CONSTRAINT fk_saas_plan_entitlements_plan FOREIGN KEY (plan_key) REFERENCES saas_plans(plan_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_subscriptions (
  tenant_id BIGINT UNSIGNED NOT NULL,
  plan_key VARCHAR(80) NOT NULL,
  status ENUM('trial','active','past_due','paused','cancelled') NOT NULL DEFAULT 'trial',
  provider VARCHAR(40) NULL,
  external_customer_id VARCHAR(190) NULL,
  external_subscription_id VARCHAR(190) NULL,
  trial_ends_at DATETIME NULL,
  current_period_start DATETIME NULL,
  current_period_end DATETIME NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id),
  KEY idx_tenant_subscriptions_plan_status (plan_key, status),
  KEY idx_tenant_subscriptions_external (provider, external_subscription_id),
  CONSTRAINT fk_tenant_subscriptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_tenant_subscriptions_plan FOREIGN KEY (plan_key) REFERENCES saas_plans(plan_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_usage_monthly (
  tenant_id BIGINT UNSIGNED NOT NULL,
  usage_month DATE NOT NULL,
  metric_key VARCHAR(120) NOT NULL,
  usage_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, usage_month, metric_key),
  CONSTRAINT fk_tenant_usage_monthly_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO saas_plans
(plan_key, name, description, status, limits_json, features_json, display_order)
VALUES
(
  'starter',
  'Inicial',
  'Para una marca que empieza a centralizar su operación social.',
  'active',
  JSON_OBJECT('brands', 1, 'socialAccounts', 3, 'scheduledPostsPerMonth', 60, 'teamMembers', 2, 'aiGenerationsPerMonth', 150),
  JSON_ARRAY('brand_brain','calendar','excel_import','social_connections','manual_approval'),
  10
),
(
  'professional',
  'Profesional',
  'Para equipos que necesitan más volumen, colaboración y automatización.',
  'active',
  JSON_OBJECT('brands', 3, 'socialAccounts', 9, 'scheduledPostsPerMonth', 250, 'teamMembers', 8, 'aiGenerationsPerMonth', 800),
  JSON_ARRAY('brand_brain','calendar','excel_import','social_connections','manual_approval','audit_log','editorial_memory','media_library'),
  20
),
(
  'business',
  'Business',
  'Para múltiples marcas y operaciones sociales de mayor escala.',
  'active',
  JSON_OBJECT('brands', 10, 'socialAccounts', 30, 'scheduledPostsPerMonth', 1200, 'teamMembers', 30, 'aiGenerationsPerMonth', 5000),
  JSON_ARRAY('brand_brain','calendar','excel_import','social_connections','manual_approval','audit_log','editorial_memory','media_library','team_approvals','priority_queue'),
  30
),
(
  'enterprise',
  'Enterprise',
  'Capacidad ampliada y condiciones comerciales personalizadas.',
  'active',
  JSON_OBJECT('brands', -1, 'socialAccounts', -1, 'scheduledPostsPerMonth', -1, 'teamMembers', -1, 'aiGenerationsPerMonth', -1),
  JSON_ARRAY('brand_brain','calendar','excel_import','social_connections','manual_approval','audit_log','editorial_memory','media_library','team_approvals','priority_queue','custom_limits'),
  40
);

INSERT INTO saas_plan_prices
(plan_key, currency, billing_interval, unit_amount_minor, status, display_order)
VALUES
('starter','ARS','monthly',2990000,'active',10),
('professional','ARS','monthly',6990000,'active',20),
('business','ARS','monthly',14990000,'active',30),
('starter','USD','monthly',29,'active',10),
('professional','USD','monthly',69,'active',20),
('business','USD','monthly',149,'active',30),
('starter','USD','yearly',290,'active',10),
('professional','USD','yearly',690,'active',20),
('business','USD','yearly',1490,'active',30);

INSERT INTO saas_plan_entitlements
(plan_key, entitlement_key, enabled, limit_value)
SELECT plan_key, 'analytics', 0, NULL FROM saas_plans;

INSERT INTO saas_plan_entitlements
(plan_key, entitlement_key, enabled, limit_value)
SELECT plan_key, 'auto_publish', 1, NULL FROM saas_plans;

INSERT INTO saas_plan_entitlements
(plan_key, entitlement_key, enabled, limit_value)
SELECT plan_key, 'team_approvals', plan_key IN ('business','enterprise'), NULL FROM saas_plans;
