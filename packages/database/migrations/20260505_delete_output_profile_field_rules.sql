-- Delete all pre-launch test data from output_profile_field_rules.
-- The app has not launched; these are scaffolded dev records.
-- Field rules are superseded by attribute mappings + slot definitions.
DELETE FROM output_profile_field_rules;
