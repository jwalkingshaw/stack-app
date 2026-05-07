BEGIN;

UPDATE billing_plans
SET
  name = 'Free (Sandbox)',
  monthly_price_cents = 0,
  currency = 'USD',
  is_custom = false,
  sort_order = 5,
  limits = jsonb_build_object(
    'activeSkuCount', 10,
    'storageGb', 2,
    'deliveryBandwidthGb', 4,
    'internalUserCount', 1,
    'partnerInviteCount', 2,
    'deeplTotalCharCount', 0
  ),
  is_active = true,
  updated_at = NOW()
WHERE id = 'free';

UPDATE billing_plans
SET
  name = 'Starter',
  monthly_price_cents = 5900,
  currency = 'USD',
  is_custom = false,
  sort_order = 10,
  limits = jsonb_build_object(
    'activeSkuCount', 50,
    'storageGb', 15,
    'deliveryBandwidthGb', 25,
    'internalUserCount', 2,
    'partnerInviteCount', 10,
    'deeplTotalCharCount', 50000
  ),
  is_active = true,
  updated_at = NOW()
WHERE id = 'starter';

UPDATE billing_plans
SET
  name = 'Growth',
  monthly_price_cents = 14900,
  currency = 'USD',
  is_custom = false,
  sort_order = 20,
  limits = jsonb_build_object(
    'activeSkuCount', 500,
    'storageGb', 100,
    'deliveryBandwidthGb', 200,
    'internalUserCount', 8,
    'partnerInviteCount', 100,
    'deeplTotalCharCount', 250000
  ),
  is_active = true,
  updated_at = NOW()
WHERE id = 'growth';

UPDATE billing_plans
SET
  name = 'Scale',
  monthly_price_cents = 34900,
  currency = 'USD',
  is_custom = false,
  sort_order = 30,
  limits = jsonb_build_object(
    'activeSkuCount', 2500,
    'storageGb', 500,
    'deliveryBandwidthGb', 1000,
    'internalUserCount', 2147483647,
    'partnerInviteCount', 2147483647,
    'deeplTotalCharCount', 500000
  ),
  is_active = true,
  updated_at = NOW()
WHERE id = 'scale';

UPDATE billing_plans
SET
  name = 'Enterprise',
  monthly_price_cents = 0,
  currency = 'USD',
  is_custom = true,
  sort_order = 40,
  limits = jsonb_build_object(
    'activeSkuCount', 2147483647,
    'storageGb', 2147483647,
    'deliveryBandwidthGb', 2147483647,
    'internalUserCount', 2147483647,
    'partnerInviteCount', 2147483647,
    'deeplTotalCharCount', 2147483647
  ),
  is_active = true,
  updated_at = NOW()
WHERE id = 'enterprise';

COMMIT;
