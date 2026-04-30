begin;

create or replace function normalize_product_field_token(raw text)
returns text
language sql
immutable
as $$
  select left(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(raw, ''))), '[^a-z0-9\s_-]', '', 'g'),
      '[\s-]+',
      '_',
      'g'
    ),
    64
  )
$$;

create or replace function resolve_product_field_option_value(field_options jsonb, raw text)
returns text
language plpgsql
immutable
as $$
declare
  option_entry jsonb;
  option_value text;
  option_label text;
  candidate text := trim(coalesce(raw, ''));
  normalized_candidate text := normalize_product_field_token(raw);
begin
  if candidate = '' then
    return null;
  end if;

  for option_entry in
    select value
    from jsonb_array_elements(coalesce(field_options -> 'options', '[]'::jsonb))
  loop
    option_value := trim(coalesce(option_entry ->> 'value', option_entry ->> 'label', ''));
    option_label := trim(coalesce(option_entry ->> 'label', option_value, ''));

    if option_value = '' then
      continue;
    end if;

    if candidate = option_value
      or lower(candidate) = lower(option_value)
      or candidate = option_label
      or lower(candidate) = lower(option_label)
      or normalized_candidate = normalize_product_field_token(option_value)
      or normalized_candidate = normalize_product_field_token(option_label)
    then
      return normalize_product_field_token(option_value);
    end if;
  end loop;

  return null;
end;
$$;

create or replace function normalize_product_field_multiselect(field_options jsonb, raw jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  item jsonb;
  item_text text;
  canonical_value text;
  result_values text[] := array[]::text[];
begin
  if raw is null then
    return null;
  end if;

  if jsonb_typeof(raw) = 'string' then
    canonical_value := resolve_product_field_option_value(field_options, trim(both '"' from raw::text));
    if canonical_value is null then
      return null;
    end if;
    return to_jsonb(array[canonical_value]);
  end if;

  if jsonb_typeof(raw) <> 'array' then
    return raw;
  end if;

  for item in
    select value from jsonb_array_elements(raw)
  loop
    if jsonb_typeof(item) <> 'string' then
      continue;
    end if;

    item_text := trim(both '"' from item::text);
    canonical_value := resolve_product_field_option_value(field_options, item_text);
    if canonical_value is null or canonical_value = any(result_values) then
      continue;
    end if;

    result_values := array_append(result_values, canonical_value);
  end loop;

  if cardinality(result_values) = 0 then
    return null;
  end if;

  return to_jsonb(result_values);
end;
$$;

update product_field_values pfv
set value_text = normalized.canonical_value
from (
  select
    pfv.id,
    resolve_product_field_option_value(pf.options::jsonb, pfv.value_text) as canonical_value
  from product_field_values pfv
  join product_fields pf on pf.id = pfv.product_field_id
  where pf.field_type = 'select'
    and pfv.value_text is not null
) normalized
where pfv.id = normalized.id
  and normalized.canonical_value is not null
  and pfv.value_text is distinct from normalized.canonical_value;

update product_field_values pfv
set
  value_text = null,
  value_json = normalized.canonical_values
from (
  select
    pfv.id,
    normalize_product_field_multiselect(pf.options::jsonb, pfv.value_json) as canonical_values
  from product_field_values pfv
  join product_fields pf on pf.id = pfv.product_field_id
  where pf.field_type in ('multiselect', 'multi_select')
    and pfv.value_json is not null
) normalized
where pfv.id = normalized.id
  and normalized.canonical_values is not null
  and pfv.value_json is distinct from normalized.canonical_values;

update product_field_values pfv
set
  value_text = null,
  value_json = to_jsonb(array[normalized.canonical_value])
from (
  select
    pfv.id,
    resolve_product_field_option_value(pf.options::jsonb, pfv.value_text) as canonical_value
  from product_field_values pfv
  join product_fields pf on pf.id = pfv.product_field_id
  where pf.field_type in ('multiselect', 'multi_select')
    and pfv.value_text is not null
) normalized
where pfv.id = normalized.id
  and normalized.canonical_value is not null;

update product_field_values pfv
set
  value_text = null,
  value_boolean = case
    when lower(trim(pfv.value_text)) in ('true', '1', 'yes', 'y', 'on') then true
    when lower(trim(pfv.value_text)) in ('false', '0', 'no', 'n', 'off') then false
    else pfv.value_boolean
  end
from product_fields pf
where pf.id = pfv.product_field_id
  and pf.field_type = 'boolean'
  and pfv.value_boolean is null
  and pfv.value_text is not null
  and lower(trim(pfv.value_text)) in ('true', '1', 'yes', 'y', 'on', 'false', '0', 'no', 'n', 'off');

drop function if exists normalize_product_field_multiselect(jsonb, jsonb);
drop function if exists resolve_product_field_option_value(jsonb, text);
drop function if exists normalize_product_field_token(text);

commit;
