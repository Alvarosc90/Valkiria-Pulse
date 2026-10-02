ALTER TABLE tenant_subscriptions
  ADD COLUMN plan_price_id BIGINT UNSIGNED NULL AFTER plan_key,
  ADD COLUMN billing_interval ENUM('monthly','yearly') NULL AFTER plan_price_id,
  ADD COLUMN currency CHAR(3) NULL AFTER billing_interval,
  ADD COLUMN last_provider_sync_at DATETIME NULL AFTER metadata_json,
  ADD CONSTRAINT fk_tenant_subscription_price
    FOREIGN KEY (plan_price_id) REFERENCES saas_plan_prices(id);

ALTER TABLE billing_checkout_sessions
  ADD COLUMN provider_status VARCHAR(80) NULL AFTER status,
  ADD COLUMN provider_payload_json JSON NULL AFTER metadata_json;

ALTER TABLE billing_subscription_actions
  ADD COLUMN provider_payload_json JSON NULL AFTER metadata_json;
