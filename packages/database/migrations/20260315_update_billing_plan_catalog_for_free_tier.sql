BEGIN;

INSERT INTO billing_plans (id, name, monthly_price_cents, currency, is_custom, sort_order, limits)
VALUES
  (
    'free',
    'Free (Sandbox)',
    0,
    'USD',
    false,
    5,
    jsonb_build_object(
      'activeSkuCount', 10,
      'storageGb', 2,
      'deliveryBandwidthGb', 4,
      'internalUserCount', 1,
      'partnerInviteCount', 2,
      'deeplTotalCharCount', 0
    )
  ),
  (
    'starter',
    'Starter',
    4900,
    'USD',
    false,
    10,
    jsonb_build_object(
      'activeSkuCount', 50,
      'storageGb', 15,
      'deliveryBandwidthGb', 25,
      'internalUserCount', 2,
      'partnerInviteCount', 10,
      'deeplTotalCharCount', 750000
    )
  ),
  (
    'growth',
    'Growth',
    12900,
    'USD',
    false,
    20,
    jsonb_build_object(
      'activeSkuCount', 500,
      'storageGb', 100,
      'deliveryBandwidthGb', 200,
      'internalUserCount', 8,
      'partnerInviteCount', 100,
      'deeplTotalCharCount', 3000000
    )
  ),
  (
    'scale',
    'Scale',
    29900,
    'USD',
    false,
    30,
    jsonb_build_object(
      'activeSkuCount', 2500,
      'storageGb', 500,
      'deliveryBandwidthGb', 1000,
      'internalUserCount', 2147483647,
      'partnerInviteCount', 2147483647,
      'deeplTotalCharCount', 12000000
    )
  ),
  (
    'enterprise',
    'Enterprise',
    0,
    'USD',
    true,
    40,
    jsonb_build_object(
      'activeSkuCount', 2147483647,
      'storageGb', 2147483647,
      'deliveryBandwidthGb', 2147483647,
      'internalUserCount', 2147483647,
      'partnerInviteCount', 2147483647,
      'deeplTotalCharCount', 2147483647
    )
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  currency = EXCLUDED.currency,
  is_custom = EXCLUDED.is_custom,
  sort_order = EXCLUDED.sort_order,
  limits = EXCLUDED.limits,
  is_active = true,
  updated_at = NOW();

COMMIT;
