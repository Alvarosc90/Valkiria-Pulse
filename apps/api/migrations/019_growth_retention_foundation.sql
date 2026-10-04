CREATE TABLE growth_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NULL,
  source_system VARCHAR(80) NOT NULL DEFAULT 'pulse',
  external_ref VARCHAR(190) NULL,
  display_name VARCHAR(190) NULL,
  email VARCHAR(255) NULL,
  phone_e164 VARCHAR(32) NULL,
  whatsapp_consent ENUM('unknown','opted_in','opted_out') NOT NULL DEFAULT 'unknown',
  consent_source VARCHAR(120) NULL,
  consent_updated_at DATETIME NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_growth_contacts_external (tenant_id, source_system, external_ref),
  KEY idx_growth_contacts_tenant_phone (tenant_id, phone_e164),
  KEY idx_growth_contacts_brand (tenant_id, brand_id),
  CONSTRAINT fk_growth_contacts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_growth_contacts_brand FOREIGN KEY (brand_id) REFERENCES brands(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE growth_audiences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(190) NOT NULL,
  description VARCHAR(1000) NULL,
  source_type ENUM('manual','rule','trainia','erp','integration') NOT NULL DEFAULT 'manual',
  definition_json JSON NULL,
  estimated_size INT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_growth_audiences_tenant_brand (tenant_id, brand_id, active),
  CONSTRAINT fk_growth_audiences_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_growth_audiences_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_growth_audiences_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE growth_audience_members (
  audience_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  inclusion_reason VARCHAR(500) NULL,
  source_ref VARCHAR(190) NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audience_id, contact_id),
  KEY idx_growth_audience_members_contact (contact_id, audience_id),
  CONSTRAINT fk_growth_audience_members_audience
    FOREIGN KEY (audience_id) REFERENCES growth_audiences(id) ON DELETE CASCADE,
  CONSTRAINT fk_growth_audience_members_contact
    FOREIGN KEY (contact_id) REFERENCES growth_contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE growth_campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NOT NULL,
  audience_id BIGINT UNSIGNED NULL,
  name VARCHAR(190) NOT NULL,
  objective VARCHAR(500) NOT NULL,
  campaign_type ENUM(
    'acquisition','reactivation','retention','promotion',
    'cross_sell','upsell','winback','other'
  ) NOT NULL,
  status ENUM('draft','ready','active','paused','completed','cancelled') NOT NULL DEFAULT 'draft',
  primary_channel ENUM(
    'whatsapp','instagram','tiktok','linkedin','multi','paid_media'
  ) NOT NULL DEFAULT 'multi',
  execution_mode ENUM('owned_channels','manual_paid_media','provider_api') NOT NULL DEFAULT 'owned_channels',
  paid_provider ENUM('meta','google') NULL,
  paid_budget_amount_minor BIGINT UNSIGNED NULL,
  paid_budget_currency CHAR(3) NULL,
  paid_budget_is_external TINYINT(1) NOT NULL DEFAULT 1,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  strategy_json JSON NULL,
  metrics_json JSON NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_growth_campaigns_tenant_status (tenant_id, status, updated_at),
  KEY idx_growth_campaigns_brand (tenant_id, brand_id, status),
  CONSTRAINT fk_growth_campaigns_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_growth_campaigns_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_growth_campaigns_audience FOREIGN KEY (audience_id) REFERENCES growth_audiences(id),
  CONSTRAINT fk_growth_campaigns_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE growth_triggers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NULL,
  trigger_key VARCHAR(120) NOT NULL,
  source_system VARCHAR(80) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  conditions_json JSON NULL,
  cooldown_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_growth_trigger_key (tenant_id, trigger_key),
  KEY idx_growth_triggers_event (tenant_id, source_system, event_type, enabled),
  CONSTRAINT fk_growth_triggers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_growth_triggers_campaign
    FOREIGN KEY (campaign_id) REFERENCES growth_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE growth_sequences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(190) NOT NULL,
  status ENUM('draft','ready','active','paused','completed') NOT NULL DEFAULT 'draft',
  stop_on_conversion TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_growth_sequences_campaign (tenant_id, campaign_id, status),
  CONSTRAINT fk_growth_sequences_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_growth_sequences_campaign
    FOREIGN KEY (campaign_id) REFERENCES growth_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_growth_sequences_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE growth_sequence_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  sequence_id BIGINT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  channel ENUM(
    'whatsapp','instagram','tiktok','linkedin','internal','manual_paid_media'
  ) NOT NULL,
  action_type ENUM(
    'message','content','offer','follow_up','paid_media_draft','wait','task'
  ) NOT NULL,
  delay_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  requires_consent TINYINT(1) NOT NULL DEFAULT 0,
  template_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_growth_sequence_step_position (sequence_id, position),
  KEY idx_growth_sequence_steps_tenant (tenant_id, sequence_id),
  CONSTRAINT fk_growth_sequence_steps_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_growth_sequence_steps_sequence
    FOREIGN KEY (sequence_id) REFERENCES growth_sequences(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE growth_channel_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NOT NULL,
  sequence_id BIGINT UNSIGNED NULL,
  step_id BIGINT UNSIGNED NULL,
  contact_id BIGINT UNSIGNED NULL,
  channel ENUM(
    'whatsapp','instagram','tiktok','linkedin','internal','meta_ads','google_ads'
  ) NOT NULL,
  execution_mode ENUM('draft_only','manual','provider_api') NOT NULL DEFAULT 'draft_only',
  status ENUM(
    'drafted','ready','queued','blocked','sent','delivered','failed','cancelled'
  ) NOT NULL DEFAULT 'drafted',
  idempotency_key VARCHAR(190) NOT NULL,
  external_action_id VARCHAR(190) NULL,
  payload_json JSON NULL,
  result_json JSON NULL,
  scheduled_at DATETIME NULL,
  executed_at DATETIME NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_growth_channel_action_idempotency (tenant_id, idempotency_key),
  KEY idx_growth_channel_actions_queue (tenant_id, status, scheduled_at),
  KEY idx_growth_channel_actions_campaign (campaign_id, status),
  CONSTRAINT fk_growth_channel_actions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_growth_channel_actions_campaign
    FOREIGN KEY (campaign_id) REFERENCES growth_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_growth_channel_actions_sequence
    FOREIGN KEY (sequence_id) REFERENCES growth_sequences(id) ON DELETE SET NULL,
  CONSTRAINT fk_growth_channel_actions_step
    FOREIGN KEY (step_id) REFERENCES growth_sequence_steps(id) ON DELETE SET NULL,
  CONSTRAINT fk_growth_channel_actions_contact
    FOREIGN KEY (contact_id) REFERENCES growth_contacts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE growth_conversion_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NULL,
  contact_id BIGINT UNSIGNED NULL,
  event_type ENUM(
    'lead','reply','checkout_started','purchase','renewal',
    'reactivated','retained','opt_out','custom'
  ) NOT NULL,
  source_system VARCHAR(80) NOT NULL,
  external_event_id VARCHAR(190) NULL,
  value_amount_minor BIGINT UNSIGNED NULL,
  value_currency CHAR(3) NULL,
  occurred_at DATETIME(3) NOT NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_growth_conversion_external (tenant_id, source_system, external_event_id),
  KEY idx_growth_conversion_campaign_time (tenant_id, campaign_id, occurred_at),
  KEY idx_growth_conversion_contact_time (tenant_id, contact_id, occurred_at),
  CONSTRAINT fk_growth_conversion_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_growth_conversion_campaign
    FOREIGN KEY (campaign_id) REFERENCES growth_campaigns(id) ON DELETE SET NULL,
  CONSTRAINT fk_growth_conversion_contact
    FOREIGN KEY (contact_id) REFERENCES growth_contacts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
