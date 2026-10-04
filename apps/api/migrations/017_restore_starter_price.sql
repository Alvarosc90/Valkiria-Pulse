UPDATE saas_plan_prices
SET unit_amount_minor = 2490000,
    metadata_json = JSON_REMOVE(
      COALESCE(metadata_json, JSON_OBJECT()),
      '$.e2eTestPrice',
      '$.e2eTestOriginalAmountMinor',
      '$.e2eTestSetAt'
    )
WHERE plan_key = 'starter'
  AND currency = 'ARS'
  AND billing_interval = 'monthly'
  AND status = 'active'
  AND JSON_EXTRACT(COALESCE(metadata_json, JSON_OBJECT()), '$.e2eTestPrice') = true;
