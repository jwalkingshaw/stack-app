-- locale_regulatory_rules
-- Platform-managed compliance rules per locale/region for AI content generation.
-- Not org-scoped — Stackcess maintains these for all tenants.
-- Updated via Supabase dashboard; no code deploy needed.
--
-- Claim types: disease, health, structure_function, nutrient_content, absolute,
--              safety, comparative, natural, weight_loss, caffeine, testimonial, implied_medical
-- Rule actions: prohibited, requires_disclaimer, requires_substantiation,
--               prohibited_unless_efsa_listed, requires_artg, requires_cofepris, allowed_with_caveat

CREATE TABLE public.locale_regulatory_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale_code text NOT NULL,
  region_code text NOT NULL,
  claim_type text NOT NULL,
  rule_action text NOT NULL,
  rule_description text NOT NULL,
  example_violations text[] NOT NULL DEFAULT '{}',
  example_compliant text[] NOT NULL DEFAULT '{}',
  regulatory_reference text,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('error', 'warning', 'info')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX locale_regulatory_rules_locale_code_idx ON public.locale_regulatory_rules (locale_code);
CREATE INDEX locale_regulatory_rules_region_code_idx ON public.locale_regulatory_rules (region_code);
CREATE INDEX locale_regulatory_rules_active_idx ON public.locale_regulatory_rules (active) WHERE active = true;

-- =============================================================================
-- UNIVERSAL — applies to every market
-- =============================================================================
INSERT INTO public.locale_regulatory_rules
  (locale_code, region_code, claim_type, rule_action, rule_description, example_violations, example_compliant, regulatory_reference, severity)
VALUES

-- Disease claims: prohibited everywhere without exception
('*', '*', 'disease', 'prohibited',
 'Disease claims are prohibited for food supplements in every market. Any language implying the product treats, cures, prevents, or reverses a medical condition is illegal regardless of locale.',
 ARRAY['treats', 'cures', 'prevents', 'heals', 'alleviates', 'eliminates', 'reverses', 'fights disease', 'anti-disease', 'therapeutic', 'medicinal'],
 ARRAY['supports', 'helps maintain', 'contributes to', 'may help', 'is associated with', 'formulated to support'],
 'Universal — FDA 21 CFR 101.93; EC 1924/2006 Art.10; TGA Advertising Code s.4; Ley General de Salud Art.215',
 'error'),

-- Implied medical/pharmaceutical status: prohibited everywhere
('*', '*', 'implied_medical', 'prohibited',
 'Implying pharmaceutical, medical, or clinical status for a food supplement is prohibited globally. Supplements are not drugs and must not be positioned as such.',
 ARRAY['pharmaceutical grade', 'medical grade', 'drug-like', 'prescription-strength', 'hospital-grade', 'doctor-formulated (without substantiation)', 'FDA approved', 'TGA approved', 'EFSA approved'],
 ARRAY['professional-grade formula', 'developed with nutritionists', 'informed by research'],
 'Universal — supplements are not approved drugs in any jurisdiction',
 'error'),

-- Absolute safety claims: prohibited everywhere
('*', '*', 'safety', 'prohibited',
 'Absolute safety claims are prohibited in all markets. No supplement can be claimed as universally safe for everyone, free of all side effects, or safe for all populations.',
 ARRAY['completely safe', 'no side effects', 'safe for everyone', '100% safe', 'zero risk', 'safe for pregnant women (without clinical evidence)', 'safe for children (without clinical evidence)'],
 ARRAY['well-tolerated in healthy adults', 'consult your healthcare provider if pregnant or nursing', 'not recommended for under 18s'],
 'Universal — FTC Act; ACL; ASA CAP Code',
 'error'),

-- =============================================================================
-- EUROPEAN UNION — EC 1924/2006 is the governing framework
-- =============================================================================

-- Health claims must be EFSA-approved and nutrient-specific
('*', 'EU', 'health', 'prohibited_unless_efsa_listed',
 'In the EU, health claims are only legal if they appear on the authorised list under EC 1924/2006 and are tied to a specific nutrient at a sufficient amount. Generic wellness language ("boosts immunity", "supports brain health") without a named nutrient and approved wording is prohibited.',
 ARRAY['boosts immunity', 'improves brain function', 'supports brain health', 'reduces inflammation', 'enhances cognitive function', 'detoxifies', 'balances hormones', 'improves gut health', 'anti-inflammatory', 'promotes recovery'],
 ARRAY['Vitamin C contributes to normal immune function', 'Magnesium contributes to normal muscle function', 'Protein contributes to the maintenance of muscle mass', 'Vitamin B12 contributes to normal energy-yielding metabolism', 'Iron contributes to normal cognitive function'],
 'EC 1924/2006; EFSA Register of authorised claims; EU 1169/2011',
 'error'),

-- Nutrient content claims require EU thresholds
('*', 'EU', 'nutrient_content', 'allowed_with_caveat',
 'Nutrient content claims ("high protein", "source of fibre", "rich in Vitamin C") are permitted in the EU only when the product meets the specific thresholds in the Annex to EC 1924/2006. "High protein" requires ≥20% of energy from protein; "source of protein" requires ≥12%.',
 ARRAY['high protein (if <20% energy from protein)', 'rich in fibre (if <6g/100g)', 'low sugar (if >5g/100g for solids)', 'sugar free (if >0.5g/100g)'],
 ARRAY['source of protein', 'high protein', 'contains fibre'],
 'EC 1924/2006 Annex; EU 1169/2011',
 'warning'),

-- Absolute and comparative claims require substantiation
('*', 'EU', 'absolute', 'requires_substantiation',
 'Absolute and superlative claims ("the best", "clinically proven", "scientifically tested", "most advanced") require documented substantiation. Comparative claims ("better than", "twice as effective as") require verified comparative evidence.',
 ARRAY['clinically proven', 'scientifically tested', 'the best', '#1 formula', 'most advanced', 'better than competitors', 'twice as effective', 'world''s strongest', 'unrivalled'],
 ARRAY['well-studied formula', 'third-party tested', 'research-supported ingredients', 'developed with sports scientists'],
 'EC 1924/2006 Art.12; national ASA equivalents per member state',
 'warning'),

-- Before/after and results-typical claims
('*', 'EU', 'comparative', 'requires_substantiation',
 'Before-and-after claims and "results-typical" language imply outcomes for the average consumer and require substantiation under EU advertising standards. Claims must reflect what a typical user experiences, not exceptional results.',
 ARRAY['results typical', 'users lost X kg on average', 'before and after', 'transformation guaranteed', 'visible results in X days'],
 ARRAY['individual results may vary', 'results depend on diet and training', 'as part of a balanced diet and exercise programme'],
 'EC 1924/2006; national ASA codes',
 'warning'),

-- Caffeine high-dose warning (EU mandatory above 150mg/L)
('*', 'EU', 'caffeine', 'requires_disclaimer',
 'Products with caffeine ≥150mg/L (applies to ready-to-drink; for powders calculate at intended dilution) must include: "High caffeine content. Not recommended for children or pregnant or breast-feeding women." under EU 1169/2011 Annex III.',
 ARRAY['does not mention caffeine warning when high-dose caffeine present'],
 ARRAY['High caffeine content (Xmg per serving). Not recommended for children or pregnant or breastfeeding women.'],
 'EU 1169/2011 Annex III; EFSA caffeine opinion 2015',
 'error'),

-- "Natural" claims — no legal definition in EU but scrutinised
('*', 'EU', 'natural', 'allowed_with_caveat',
 '"Natural" has no defined legal meaning in EU food law but national advertising bodies routinely challenge it if the product contains synthetic ingredients, artificial colours, or heavily processed components. Use only when genuinely justifiable.',
 ARRAY['100% natural (if contains synthetic ingredients)', 'all-natural (if contains artificial additives)', 'natural formula (if heavily processed)'],
 ARRAY['naturally sourced ingredients', 'no artificial colours or flavours', 'naturally flavoured'],
 'No EU legal definition; national ASA equivalents scrutinise case-by-case',
 'warning'),

-- =============================================================================
-- GERMANY (DE) — EU rules + stricter national enforcement via HWG
-- =============================================================================

-- HWG: therapeutic references stricter than base EU law
('de', 'EU', 'implied_medical', 'prohibited',
 'Germany''s Heilmittelwerbegesetz (HWG) prohibits any advertising that creates an impression of therapeutic effect for a food product. This goes further than base EU law — even indirect references to medical conditions, imagery of sick people recovering, or before/after medical comparisons are prohibited.',
 ARRAY['lindert Schmerzen', 'heilt', 'wirkt gegen', 'medizinisch empfohlen', 'klinisch getestet (ohne Nachweis)', 'von Ärzten empfohlen (ohne Nachweis)', 'hilft bei Erkrankungen'],
 ARRAY['unterstützt die normale Muskelfunktion', 'trägt zur normalen Energiestoffwechselfunktion bei', 'für Sportler entwickelt'],
 'Heilmittelwerbegesetz (HWG); LFGB; EC 1924/2006',
 'error'),

-- Germany: "frei von" (free-from) claims require substantiation
('de', 'EU', 'nutrient_content', 'requires_substantiation',
 'Free-from claims ("zuckerfrei", "laktosefrei", "glutenfrei") in Germany must meet specific EU thresholds and be substantiated. "Zuckerfrei" requires <0.5g sugars/100g.',
 ARRAY['zuckerfrei (wenn >0,5g Zucker/100g)', 'laktosefrei (wenn Laktose vorhanden)', 'glutenfrei (wenn Gluten vorhanden)'],
 ARRAY['zuckerarm', 'enthält keine zugesetzten Zucker', 'natürlich laktosefrei'],
 'EU 1169/2011; EC 1924/2006 Annex; LFGB',
 'error'),

-- =============================================================================
-- UNITED STATES — DSHEA 1994 + FTC Act
-- =============================================================================

-- Structure/function claims: permitted but require DSHEA disclaimer
('en-US', 'US', 'structure_function', 'requires_disclaimer',
 'Structure/function claims are lawful under DSHEA 1994 but require the mandatory disclaimer on the label: "This statement has not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease." Ensure this appears prominently.',
 ARRAY[]::text[],
 ARRAY['supports muscle recovery', 'helps maintain energy levels', 'supports immune health', 'promotes lean muscle growth', 'supports healthy metabolism'],
 'DSHEA 1994; 21 CFR 101.93; FDA Guidance on Structure/Function Claims',
 'warning'),

-- "FDA approved" is prohibited — supplements are not FDA approved
('en-US', 'US', 'implied_medical', 'prohibited',
 'Dietary supplements are not approved by the FDA. Claiming FDA approval, FDA endorsement, or FDA certification is prohibited and constitutes a material misrepresentation.',
 ARRAY['FDA approved', 'FDA certified', 'FDA endorsed', 'approved by the FDA', 'FDA registered formula'],
 ARRAY['manufactured in an FDA-registered facility', 'produced under GMP standards', 'cGMP certified facility'],
 'DSHEA 1994; FTC Act s.5; FDA Warning Letters',
 'error'),

-- Clinically proven / scientifically tested: FTC substantiation
('en-US', 'US', 'absolute', 'requires_substantiation',
 'The FTC requires "competent and reliable scientific evidence" to support efficacy claims. "Clinically proven" requires at minimum two randomised controlled trials on the specific product (not just an ingredient). "Scientifically tested" requires documented trials.',
 ARRAY['clinically proven', 'clinically tested', 'scientifically proven', 'doctor-recommended (without survey data)', 'proven to work', 'guaranteed results', '#1 doctor-recommended', 'most effective on the market'],
 ARRAY['third-party tested', 'research-backed ingredients', 'formulated based on published research', 'developed with sports scientists'],
 'FTC Act s.5; FTC Enforcement Policy on Substantiation; FTC Endorsement Guides 2023',
 'warning'),

-- Weight loss / body composition claims: FTC specific standard
('en-US', 'US', 'weight_loss', 'requires_substantiation',
 'Weight loss and body composition claims face heightened FTC scrutiny. Claims of specific weight or fat loss ("lose 10 lbs in 2 weeks") require randomised controlled trial evidence on the specific product. "Safe and effective for weight loss" without two RCTs is prohibited.',
 ARRAY['lose X lbs in X weeks', 'burn fat fast', 'melt fat', 'lose weight without diet or exercise', 'shed X pounds guaranteed', 'clinically proven fat burner'],
 ARRAY['supports a healthy metabolism as part of a balanced diet', 'formulated to support body composition goals alongside exercise', 'may support fat oxidation during exercise'],
 'FTC Act s.5; FTC Gut Check guidance; FTC Weight Loss Advertising enforcement',
 'error'),

-- Testimonials and endorsements: FTC Endorsement Guides 2023
('en-US', 'US', 'testimonial', 'requires_disclaimer',
 'Under the updated 2023 FTC Endorsement Guides, any material connection between an endorser and the brand (paid, gifted, employed) must be clearly disclosed. Testimonials implying typical results must reflect the actual typical experience or include a clear disclaimer.',
 ARRAY['results not typical (no longer sufficient alone under 2023 rules)', 'paid partnership without clear disclosure', 'I lost X lbs with this product (without typical results disclosure)'],
 ARRAY['#ad', '#sponsored', 'I received this product free to review', 'Results vary. Average users in our study lost X lbs.'],
 'FTC Endorsement Guides 2023 (16 CFR Part 255)',
 'warning'),

-- Caffeine: no federal mandatory warning but FDA monitors high-dose
('en-US', 'US', 'caffeine', 'allowed_with_caveat',
 'The FDA has issued guidance that pure or highly concentrated caffeine products marketed to consumers are dangerous. For high-caffeine products (>400mg per serving), include a visible warning and do not market to minors. Caffeine content should be declared.',
 ARRAY['safe stimulant', 'no caffeine crash', 'healthy energy boost for everyone'],
 ARRAY['contains Xmg caffeine per serving', 'not recommended for individuals sensitive to caffeine', 'not suitable for under 18s, pregnant or nursing women'],
 'FDA Guidance on Highly Concentrated Caffeine; FDA Safety Alert 2018',
 'warning'),

-- "Natural" claims: FTC scrutiny
('en-US', 'US', 'natural', 'allowed_with_caveat',
 'The FTC scrutinises "natural" claims on supplements. The FDA has not defined "natural" for dietary supplements, but the FTC will challenge the claim if the product contains synthetic ingredients or artificial additives that a consumer would not expect.',
 ARRAY['100% natural (if contains synthetic ingredients)', 'all-natural formula (if contains artificial additives or synthetic vitamins)'],
 ARRAY['naturally sourced ingredients', 'no artificial colours, flavours or sweeteners', 'plant-based formula'],
 'FTC Act s.5; FDA draft guidance on "natural"',
 'warning'),

-- =============================================================================
-- AUSTRALIA — TGA + FSANZ Standard 2.9.4 + ACL
-- =============================================================================

-- Therapeutic claims require ARTG listing
('en-AU', 'AU', 'health', 'requires_artg',
 'Products making therapeutic indications (claims about treating, preventing, or managing a health condition or disease) must be listed on the Australian Register of Therapeutic Goods (ARTG) as a Listed Medicine (AUST L) or Registered Medicine (AUST R). Food supplements making therapeutic claims without ARTG listing are illegal.',
 ARRAY['treats', 'prevents', 'cures', 'relieves', 'heals', 'manages [condition]', 'reduces symptoms of', 'TGA approved', 'TGA registered (if AUST L listed product)'],
 ARRAY['traditionally used to support', 'helps maintain', 'may assist with', 'formulated to support normal function of'],
 'Therapeutic Goods Act 1989; TGA Advertising Code 2021; ARTG',
 'error'),

-- "Clinically proven" requires ACL substantiation
('en-AU', 'AU', 'absolute', 'requires_substantiation',
 'Absolute and comparative claims ("clinically proven", "scientifically tested", "Australia''s #1") require substantiation under the Australian Consumer Law. The ACCC enforces misleading and deceptive conduct broadly. Ad Standards adjudicates advertising complaints.',
 ARRAY['clinically proven', 'scientifically tested', 'Australia''s #1', 'most effective', 'guaranteed results', 'doctor-recommended (without data)'],
 ARRAY['third-party tested', 'research-supported', 'tested by independent laboratories', 'developed with sports dietitians'],
 'Australian Consumer Law (ACL) s.18, s.29; ACCC guidance; Ad Standards',
 'warning'),

-- Sports food claims must comply with FSANZ Standard 2.9.4
('en-AU', 'AU', 'structure_function', 'allowed_with_caveat',
 'Formulated supplementary sports foods are regulated under FSANZ Standard 2.9.4. Claims must relate to permitted purposes: muscle development, exercise performance, electrolyte replacement, weight management in sport. Claims outside these categories may require TGA listing.',
 ARRAY['improves athletic performance beyond normal limits', 'medically enhances sport performance', 'replaces the need for food'],
 ARRAY['supports muscle recovery after exercise', 'contributes to electrolyte balance', 'formulated to support endurance performance', 'helps maintain muscle mass during training'],
 'FSANZ Food Standards Code Standard 2.9.4; TGA Advertising Code',
 'warning'),

-- Weight loss claims: TGA/ACCC heightened scrutiny
('en-AU', 'AU', 'weight_loss', 'requires_substantiation',
 'Weight loss claims on supplements face scrutiny from both the ACCC (consumer law) and TGA (if therapeutic). Claims of specific weight loss or fat burning require substantiated clinical evidence. "Guaranteed results" is prohibited.',
 ARRAY['lose X kg in X weeks', 'clinically proven fat burner', 'guaranteed weight loss', 'melt fat', 'rapid weight loss'],
 ARRAY['supports healthy body composition as part of an active lifestyle', 'formulated to support metabolism during exercise', 'may help maintain a healthy weight alongside a balanced diet'],
 'ACL s.18; TGA Advertising Code; ACCC enforcement guidelines',
 'error'),

-- =============================================================================
-- MEXICO — Ley General de Salud + NOM-051 + COFEPRIS
-- =============================================================================

-- Health claims require COFEPRIS authorisation
('es-MX', 'MX', 'health', 'requires_cofepris',
 'In Mexico, health claims on supplements must be authorised by COFEPRIS under the Ley General de Salud and NOM-086-SSA1-1994. Disease claims and unsubstantiated therapeutic language are prohibited. COFEPRIS sanitary registration (Registro Sanitario) is required before any supplement is sold.',
 ARRAY['trata', 'cura', 'previene', 'sana', 'alivia', 'elimina enfermedades', 'medicamento natural', 'aprobado por COFEPRIS (sin registro)'],
 ARRAY['ayuda a mantener', 'contribuye a', 'apoya la función normal de', 'puede ayudar a', 'formulado para apoyar'],
 'Ley General de Salud Art.215, 216; NOM-086-SSA1-1994; NOM-051-SCFI/SSA1-2010; COFEPRIS',
 'error'),

-- NOM-051 2020: positive claims about high sugar/sodium/saturated fat are problematic
('es-MX', 'MX', 'nutrient_content', 'allowed_with_caveat',
 'The 2020 NOM-051 amendment requires front-of-pack octagonal warning seals for products exceeding thresholds for calories, sugar, sodium, saturated fat, or trans fat per 100g/100ml. Do not make positive claims about nutrients that trigger warning seals — this creates a direct contradiction on the label.',
 ARRAY['energizante natural (if high sugar)', 'rico en sodio (as a benefit)', 'alto contenido calórico para deportistas (if triggers seal)'],
 ARRAY['formulado con electrolitos esenciales', 'fuente de proteína de alta calidad', 'sin azúcares añadidos'],
 'NOM-051-SCFI/SSA1-2010; Modificación 2020 (sellos octagonales)',
 'warning'),

-- Absolute and unsubstantiated claims: PROFECO
('es-MX', 'MX', 'absolute', 'requires_substantiation',
 'Unsubstantiated absolute claims violate the Ley Federal de Protección al Consumidor (PROFECO). "El mejor", "clinicamente probado", "científicamente comprobado" require documented evidence.',
 ARRAY['clínicamente probado', 'científicamente comprobado', 'el mejor del mercado', 'garantiza resultados', 'resultados en X días'],
 ARRAY['formulado con ingredientes respaldados por investigación', 'verificado por laboratorio independiente', 'desarrollado por nutriólogos deportivos'],
 'Ley Federal de Protección al Consumidor; NOM-051-SCFI/SSA1-2010',
 'warning'),

-- =============================================================================
-- UNITED KINGDOM — Post-Brexit; retained EC 1924/2006 + ASA CAP Code
-- =============================================================================

-- Health claims must be on the GB Authorised List
('en-GB', 'UK', 'health', 'prohibited_unless_listed',
 'Post-Brexit, the UK maintains its own GB Authorised List of health claims (retained EC 1924/2006). Health claims must appear on this list and be tied to a specific nutrient. The ASA CAP Code enforces these standards in advertising.',
 ARRAY['boosts immunity', 'improves brain function', 'supports gut health', 'anti-inflammatory', 'detoxifies', 'balances hormones'],
 ARRAY['Vitamin C contributes to normal immune function', 'Magnesium contributes to normal muscle function', 'Vitamin B12 contributes to normal energy-yielding metabolism'],
 'UK Nutrition and Health Claims (England) Regulations 2007 (as retained); GB Authorised List; ASA CAP Code',
 'error'),

-- Absolute and comparative claims: ASA CAP Code
('en-GB', 'UK', 'absolute', 'requires_substantiation',
 'Absolute claims ("clinically proven", "the UK''s #1", "scientifically tested") must be substantiated under ASA CAP Code rule 3.7. Comparative claims require verifiable comparative evidence.',
 ARRAY['clinically proven', 'the UK''s #1', 'scientifically tested', 'best in class', 'most advanced formula', 'doctor-recommended (without survey data)'],
 ARRAY['third-party tested', 'research-supported ingredients', 'developed with nutritionists', 'independently tested'],
 'ASA CAP Code r.3.7, r.3.33; UK Advertising Standards Authority',
 'warning'),

-- Weight loss: ASA/MHRA specific rules
('en-GB', 'UK', 'weight_loss', 'requires_substantiation',
 'Weight loss claims are subject to tight ASA scrutiny and MHRA oversight if therapeutic. Claims of specific weight or fat loss, references to appetite suppression, or "fat burning" require robust substantiation. Guarantees of weight loss are prohibited.',
 ARRAY['lose X stone in X weeks', 'clinically proven fat burner', 'suppresses appetite (without RCT evidence)', 'melt fat', 'guaranteed weight loss'],
 ARRAY['supports healthy body composition alongside a balanced diet and exercise', 'formulated to support metabolism', 'may help maintain a healthy weight as part of an active lifestyle'],
 'ASA CAP Code r.13 (Weight Control); MHRA Borderline Products guidance',
 'error'),

-- Testimonials: ASA CAP Code
('en-GB', 'UK', 'testimonial', 'requires_disclaimer',
 'Testimonials in UK advertising must comply with ASA CAP Code. Paid or incentivised endorsements must be clearly labelled (#ad). Testimonials must be genuine, representative, and must not imply results are typical unless substantiated.',
 ARRAY['real results from real customers (without being representative)', 'paid endorsement without disclosure', 'I lost X in X weeks (without typical results evidence)'],
 ARRAY['#ad', 'Gifted / paid partnership', 'Individual results may vary', 'Results based on a study of X participants over X weeks'],
 'ASA CAP Code r.3.45, r.3.47; UK Endorsement Guidance 2023',
 'warning'),

-- Caffeine: same EU mandatory warning retained in UK
('en-GB', 'UK', 'caffeine', 'requires_disclaimer',
 'The UK retained the EU caffeine labelling requirement post-Brexit. Products with ≥150mg/L caffeine (or high caffeine per serving for powders at intended dilution) must display: "High caffeine content. Not recommended for children or pregnant or breast-feeding women."',
 ARRAY['does not include caffeine warning when product is high-caffeine'],
 ARRAY['High caffeine content (Xmg per serving). Not recommended for children or pregnant or breastfeeding women.'],
 'The Coffeine and Related Substances (England) Regulations; retained EU 1169/2011 Annex III',
 'error'),

-- =============================================================================
-- BEVERAGES — additional rules across markets
-- =============================================================================

-- EU/UK: Hydration superiority claims — EFSA specifically rejected these
('*', 'EU', 'health', 'prohibited',
 'EFSA specifically rejected claims that any beverage "hydrates better than water", "rehydrates faster than water", or provides superior hydration to water (EFSA Opinion 2011). These claims are prohibited regardless of electrolyte content. Electrolyte contribution claims must use approved nutrient-specific wording.',
 ARRAY['hydrates better than water', 'rehydrates faster than water', 'superior hydration', 'better than water for hydration', 'outperforms water'],
 ARRAY['contributes to normal water balance (requires: sodium)', 'supports electrolyte balance', 'formulated with electrolytes for hydration during exercise'],
 'EFSA Opinion on water and hydration 2011; EC 1924/2006',
 'error'),

('en-GB', 'UK', 'health', 'prohibited',
 'The UK retained the EFSA rejection of hydration superiority claims. "Hydrates better than water" and equivalent claims are prohibited. Electrolyte-based hydration claims must use GB Authorised List wording tied to specific nutrients (e.g. sodium).',
 ARRAY['hydrates better than water', 'rehydrates faster than water', 'superior hydration to water'],
 ARRAY['contributes to normal water balance', 'formulated with electrolytes to support hydration'],
 'GB Authorised List; retained EFSA Opinion; ASA CAP Code',
 'error'),

-- EU/UK: "Isotonic" — no approved EU health claim for this term
('*', 'EU', 'health', 'allowed_with_caveat',
 '"Isotonic" is a compositional descriptor (matching body fluid osmolality ~280–330 mOsm/kg), not an approved EU health claim. It may be used as a factual statement about the product formulation but cannot be linked to a health benefit unless using approved nutrient-specific wording. EFSA rejected a proposed isotonic claim in 2011.',
 ARRAY['isotonic formula for superior performance', 'isotonic absorption for better hydration', 'faster absorbed because isotonic'],
 ARRAY['isotonic formula (280–330 mOsm/kg)', 'formulated to match the body''s natural fluid osmolality'],
 'EFSA Opinion on isotonic drinks 2011; EC 1924/2006',
 'warning'),

-- EU: Southampton colours — artificial food dyes require advisory warning
('*', 'EU', 'safety', 'requires_disclaimer',
 'Under EU 1333/2008, products containing any of the six Southampton colours (Sunset Yellow E110, Quinoline Yellow E104, Carmoisine E122, Allura Red E129, Tartrazine E102, Ponceau 4R E124) must display: "may have an adverse effect on activity and attention in children." This applies to beverages and supplements containing these dyes.',
 ARRAY['no warning when product contains E102, E104, E110, E122, E124, E129'],
 ARRAY['May have an adverse effect on activity and attention in children (if product contains listed colours)'],
 'EU Regulation 1333/2008 Annex V; EFSA Southampton colours opinion',
 'error'),

-- AU: FSANZ 2.6.4 — Formulated caffeinated beverages (FCBs)
('en-AU', 'AU', 'caffeine', 'requires_disclaimer',
 'Formulated caffeinated beverages (FCBs, i.e. energy drinks) in Australia are regulated under FSANZ Standard 2.6.4 with a maximum caffeine of 320mg/L. FCBs must carry mandatory advisory statements: "Not suitable for children, pregnant or lactating women or individuals sensitive to caffeine." Mixing with alcohol must not be implied or encouraged.',
 ARRAY['safe for everyone', 'no caffeine limit concerns', 'mix with alcohol for a great night', 'suitable for all ages'],
 ARRAY['Contains Xmg caffeine per serving. Not suitable for children, pregnant or lactating women or individuals sensitive to caffeine.', 'Do not mix with alcohol.'],
 'FSANZ Food Standards Code Standard 2.6.4',
 'error'),

-- US: FDA "healthy" — proposed redefinition affects beverages (2022)
('en-US', 'US', 'nutrient_content', 'allowed_with_caveat',
 'The FDA proposed a new definition of "healthy" for foods and beverages in 2022 (not yet final as of 2026). Under the proposed rule, a beverage claiming "healthy" must meet updated fat, sodium, and sugar criteria and contain a meaningful amount of a food group. Using "healthy" on a high-sugar sports drink is likely to be challenged. Monitor FDA final rule.',
 ARRAY['healthy energy drink (if high sugar)', 'the healthy way to fuel your workout (if fails nutrient criteria)'],
 ARRAY['formulated to support active lifestyles', 'nutritious formula for athletes', 'designed for sport performance'],
 'FDA Proposed Rule: "Healthy" definition 2022 (21 CFR 101.65); FTC Act',
 'warning'),

-- =============================================================================
-- VITAMINS & SUPPLEMENTS / CO-BRANDS
-- =============================================================================

-- EU/UK: Probiotics — EFSA rejected every probiotic health claim
('*', 'EU', 'health', 'prohibited',
 'EFSA has rejected every submitted probiotic health claim. "Probiotic" linked to any health benefit ("supports gut health", "boosts immunity", "improves digestion") is prohibited in the EU. "Probiotic" may be used as a descriptor only if tied to a general live culture count statement. No health claims for probiotics are permitted.',
 ARRAY['supports gut health (linked to probiotics)', 'boosts immunity with probiotics', 'probiotics for better digestion', 'live cultures for immune support', 'probiotics reduce bloating'],
 ARRAY['contains live cultures (Xbn CFU)', 'formulated with Lactobacillus acidophilus', 'Vitamin D contributes to normal immune function (if product also contains Vit D at sufficient level)'],
 'EC 1924/2006; EFSA rejection of all probiotic claims 2009–2012; EU 1169/2011',
 'error'),

('en-GB', 'UK', 'health', 'prohibited',
 'The UK retained the EU position: no probiotic health claims are on the GB Authorised List. "Probiotic" cannot be paired with any health benefit claim in UK advertising or labelling.',
 ARRAY['supports gut health (linked to probiotics)', 'immune-boosting probiotics', 'live cultures for digestion'],
 ARRAY['contains live cultures (Xbn CFU per serving)', 'formulated with Lactobacillus and Bifidobacterium strains'],
 'GB Authorised List; ASA CAP Code; retained EC 1924/2006',
 'error'),

-- EU/UK: Botanicals and adaptogens — no approved health claims
('*', 'EU', 'health', 'prohibited',
 'Health claims for botanical ingredients (ashwagandha, rhodiola, turmeric, ginseng, maca, lion''s mane, etc.) are not authorised in the EU. The Article 13.3 botanical claims list has never been finalised. Traditional use claims require authorisation as a Traditional Herbal Medicinal Product (THMPD) under Directive 2004/24/EC. "Adaptogen" has no legal standing in EU food law.',
 ARRAY['ashwagandha reduces stress', 'rhodiola improves focus', 'turmeric reduces inflammation', 'ginseng boosts energy', 'lion''s mane for brain health', 'adaptogen formula', 'adaptogenic blend', 'maca for hormone balance'],
 ARRAY['contains ashwagandha extract', 'formulated with rhodiola rosea', 'includes standardised turmeric extract (95% curcuminoids)'],
 'EC 1924/2006 Art.13.3; Directive 2004/24/EC (THMPD); EFSA botanicals guidance',
 'error'),

-- EU/UK: Collagen — no EFSA-approved health claims for collagen
('*', 'EU', 'health', 'prohibited',
 'There are no EFSA-approved health claims for collagen as an ingredient. Claims such as "supports skin elasticity", "promotes joint health", "improves hair and nails", or "rebuilds cartilage" are prohibited without naming a specific approved nutrient. Vitamin C''s approved claim about collagen formation may be used if Vitamin C is present at a qualifying amount.',
 ARRAY['collagen for skin elasticity', 'collagen supports joint health', 'rebuilds cartilage', 'promotes collagen production', 'collagen improves hair and nails', 'marine collagen for youthful skin'],
 ARRAY['Vitamin C contributes to normal collagen formation for the normal function of skin (requires 12mg Vit C per 100kcal)', 'hydrolysed collagen peptides (as ingredient descriptor only, no health claim)'],
 'EC 1924/2006; EFSA rejection of collagen-specific claims; Vitamin C claim ID 132, 133, 144',
 'error'),

-- EU/UK: Generic "antioxidant" claims — EFSA rejected the term generically
('*', 'EU', 'health', 'prohibited',
 'EFSA rejected the generic claim "antioxidant" as a health claim. Generic phrases like "powerful antioxidant", "antioxidant protection", or "fights free radicals" are prohibited. Only nutrient-specific antioxidant claims are authorised: Vitamin E, Vitamin C, Selenium, and Zinc protect cells from oxidative stress — these specific claims require the named nutrient at a qualifying level.',
 ARRAY['powerful antioxidant formula', 'antioxidant protection', 'fights free radicals', 'antioxidant blend', 'rich in antioxidants (as a health claim)'],
 ARRAY['Vitamin E contributes to the protection of cells from oxidative stress', 'Selenium contributes to the protection of cells from oxidative stress', 'Vitamin C contributes to the protection of cells from oxidative stress'],
 'EC 1924/2006; EFSA rejection of antioxidant claims 2010; EFSA claim IDs 190, 191, 208',
 'error'),

-- EU: Novel Food ingredients — require authorisation before marketing
('*', 'EU', 'implied_medical', 'prohibited',
 'Ingredients not widely consumed in the EU before 15 May 1997 require Novel Food authorisation under Regulation 2015/2283 before they can be marketed. Making efficacy claims for unapproved novel food ingredients compounds the violation. Key affected sports/wellness ingredients include: NMN (nicotinamide mononucleotide), AKG (alpha-ketoglutarate), CBD (cannabidiol), certain mushroom extracts (reishi, lion''s mane in concentrated extract form), astaxanthin from certain sources.',
 ARRAY['NMN for longevity', 'CBD for recovery', 'lion''s mane extract for cognitive function', 'astaxanthin from Haematococcus (if not EU-authorised source)', 'NMN boosts NAD+'],
 ARRAY['contains [ingredient] — please consult current EU Novel Food authorisation status before marketing in EU'],
 'EU Regulation 2015/2283 (Novel Food); EFSA Novel Food opinions; EU Novel Food Catalogue',
 'error'),

-- All: Third-party certification claims must be verified
('*', '*', 'absolute', 'requires_substantiation',
 'Claiming third-party certification (Informed Sport, NSF Certified for Sport, USP Verified, Informed Choice, Cologne List) when the product or batch is not actually certified is misleading in every market and may violate anti-doping trust. Only claim a certification that is current and applies to the specific product/batch being sold.',
 ARRAY['Informed Sport certified (if not certified)', 'NSF Certified for Sport (if not certified)', 'USP Verified (if not USP verified)', 'WADA compliant (without certification)', 'banned substance free (without third-party testing)'],
 ARRAY['Informed Sport certified — certificate number XXXX', 'NSF Certified for Sport — see certificate at nsfsport.com', 'third-party tested for banned substances'],
 'FTC Act; ACL; ASA CAP Code; Informed Sport programme terms; NSF certification terms',
 'error'),

-- =============================================================================
-- SPORTS NUTRITION — additional rules
-- =============================================================================

-- EU: Creatine — one specific EFSA-approved claim exists; use it verbatim
('*', 'EU', 'health', 'allowed_with_caveat',
 'Creatine has ONE EFSA-approved health claim that must be used verbatim: "Creatine increases physical performance in successive bursts of short-term, high intensity exercise." The claim is only authorised at ≥3g creatine per daily serving. Any other creatine performance claim ("improves strength", "builds muscle faster", "enhances power output") is not approved and is prohibited.',
 ARRAY['creatine builds muscle', 'creatine improves strength', 'creatine enhances power output', 'creatine for muscle growth', 'creatine boosts performance (non-verbatim)'],
 ARRAY['Creatine increases physical performance in successive bursts of short-term, high intensity exercise (requires ≥3g creatine per serving)'],
 'EC 1924/2006; EFSA claim ID 739, 1520, 1521; Creatine approved claim condition',
 'info'),

-- All: "Anabolic" language implies medicinal/hormonal effect
('*', '*', 'implied_medical', 'prohibited',
 '"Anabolic" used in supplement copy implies a drug-like hormonal or steroidal effect. In the EU this can cause a product to be classified as a medicinal product by function under Directive 2001/83/EC. In the US, AU, and UK it invites regulatory scrutiny and comparison to anabolic steroids. Avoid in all markets.',
 ARRAY['anabolic formula', 'natural anabolic', 'anabolic muscle builder', 'anabolic activator', 'legal anabolic', 'anabolic window'],
 ARRAY['supports muscle protein synthesis', 'formulated to support muscle recovery and growth', 'high-protein formula for muscle development'],
 'EU Directive 2001/83/EC (medicinal products); FTC Act; TGA Advertising Code; ASA CAP Code',
 'error'),

-- All: Testosterone support/boost — endocrine claim, medicinal in EU
('*', '*', 'implied_medical', 'prohibited',
 'Claims to increase, boost, restore, or support testosterone production imply an endocrine (hormonal) effect. In the EU this classifies the product as a medicinal product by function under Directive 2001/83/EC. In the US, UK, and AU these claims require substantiation and face significant regulatory scrutiny. Zinc and Vitamin D have approved EU claims related to testosterone maintenance only — use the exact approved wording.',
 ARRAY['testosterone booster', 'boosts testosterone', 'increases testosterone', 'natural testosterone support', 'restore testosterone levels', 'T-booster', 'optimise your testosterone'],
 ARRAY['Zinc contributes to the maintenance of normal testosterone levels in the blood (requires ≥1.5mg zinc per serving)', 'Vitamin D contributes to the maintenance of normal muscle function'],
 'EU Directive 2001/83/EC; EC 1924/2006; EFSA claim ID 711 (Zinc/testosterone); FTC Act; TGA Advertising Code',
 'error'),

-- All: Fat burner / thermogenic — no approved claims in any market
('*', '*', 'health', 'prohibited',
 '"Fat burner", "thermogenic", "burns fat", "ignites metabolism", and equivalent phrases have no approved health claim basis in any major market. In the EU they are unapproved health claims. In the US the FTC requires substantiation from two RCTs that does not exist for most products. In AU the ACCC treats unsubstantiated fat-burning claims as misleading under ACL.',
 ARRAY['fat burner', 'fat burning formula', 'thermogenic', 'ignites your metabolism', 'burns fat 24/7', 'accelerates fat loss', 'melt body fat', 'targets stubborn fat'],
 ARRAY['formulated to support energy metabolism during exercise', 'contains caffeine which contributes to normal energy-yielding metabolism', 'supports body composition goals alongside a calorie-controlled diet and exercise'],
 'EC 1924/2006; FTC Gut Check guidance; ACL s.18; ASA CAP Code',
 'error'),

-- EU: Glucomannan — the only EU-approved weight management ingredient
('*', 'EU', 'weight_loss', 'allowed_with_caveat',
 'Glucomannan (konjac fibre) is the only ingredient with an EFSA-approved claim for weight management: "Glucomannan in the context of an energy-restricted diet contributes to weight loss." The claim requires 1g of glucomannan per serving, taken with water before meals, as part of an energy-restricted diet. All other ingredient-based weight loss claims are unapproved in the EU.',
 ARRAY['green tea burns fat (EU)', 'CLA reduces body fat (EU without EFSA approval)', 'L-carnitine for fat loss (EU)', 'chromium for weight loss beyond its approved claim'],
 ARRAY['Glucomannan in the context of an energy-restricted diet contributes to weight loss (requires 1g per serving, taken with water before meals)'],
 'EC 1924/2006; EFSA claim ID 854, 1556, 3725 (Glucomannan); EFSA rejection of most other weight management claims',
 'info'),

-- All: Anti-doping and "banned substance free" claims require certification
('*', '*', 'absolute', 'requires_substantiation',
 'Any anti-doping claim — "banned substance free", "WADA compliant", "safe for tested athletes", "suitable for competitive athletes" — requires current third-party batch certification (Informed Sport, NSF Certified for Sport, or equivalent). These claims cannot be based on ingredient-level review alone. Uncertified products claiming anti-doping safety expose the brand to significant regulatory and reputational risk.',
 ARRAY['WADA compliant (without certification)', 'banned substance free (without batch testing)', 'safe for drug-tested athletes (without certification)', 'contains no prohibited substances (without third-party testing)'],
 ARRAY['Informed Sport certified — every batch tested for over 250 substances prohibited in sport', 'NSF Certified for Sport — certificate XXXX', 'tested for substances prohibited under the WADA Prohibited List by an accredited laboratory'],
 'WADA Prohibited List; Informed Sport programme; NSF Sport certification; FTC Act; ACL; ASA CAP Code',
 'error'),

-- All: "Pump" / nitric oxide claims — no approved wording
('*', '*', 'health', 'prohibited',
 '"Pump", "nitric oxide boost", "vasodilation", "blood flow enhancer" have no approved health claims in any major market. In the EU these are unapproved health claims under EC 1924/2006. In the US they require FTC substantiation. Some have EFSA opinions: nitrate (from beetroot) has a preliminary basis for performance in trained adults but specific approved wording does not yet exist.',
 ARRAY['pump formula', 'nitric oxide booster', 'increases nitric oxide', 'vasodilator', 'blood flow booster', 'skin-splitting pump', 'maximum vascularity'],
 ARRAY['formulated with L-citrulline and arginine', 'contains beetroot extract (naturally rich in nitrates)', 'supports blood flow during training (note: not an approved EU claim — use with caution)'],
 'EC 1924/2006; FTC Act; EFSA review of nitrate/nitric oxide claims',
 'warning'),

-- EU/UK: Yohimbine and banned stimulants
('*', 'EU', 'safety', 'prohibited',
 'Yohimbine (yohimbe bark extract) is banned or heavily restricted in several EU member states (Germany, France, Belgium, Denmark) due to cardiovascular risks. DMAA (1,3-dimethylamylamine) is banned across the EU, US, AU, and UK. Synephrine (bitter orange) is restricted in several EU countries. Claiming these ingredients are safe or effective for fat loss or energy is prohibited in the EU and constitutes a serious safety risk.',
 ARRAY['yohimbine for fat loss', 'yohimbe extract boosts energy', 'DMAA pre-workout', '1,3-DMAA', 'synephrine fat burner', 'bitter orange extract for weight loss'],
 ARRAY['caffeine for energy', 'formulated with evidence-based stimulants', 'contains only ingredients compliant with EU food law'],
 'EU member state bans on yohimbine; EFSA DMAA opinion; EU Novel Food Regulation 2015/2283; FDA ban on DMAA',
 'error'),

('en-AU', 'AU', 'safety', 'prohibited',
 'DMAA (1,3-dimethylamylamine) is prohibited in Australia. Yohimbine requires TGA advisory statements if present above certain levels. Synephrine combined with caffeine has been the subject of TGA safety alerts. Any claim that these stimulants are safe, effective, or desirable in sports supplements is prohibited under the TGA Advertising Code and ACL.',
 ARRAY['DMAA pre-workout', 'yohimbine fat burner', 'synephrine + caffeine stack for energy'],
 ARRAY['contains caffeine (Xmg per serving)', 'stimulant-free formula', 'formulated without banned substances'],
 'TGA Safety Alert on DMAA; TGA Advisory Statement on yohimbine; Therapeutic Goods Act 1989; ACL',
 'error'),

-- All: "Hormone support" / "cortisol control" — endocrine = medicinal
('*', '*', 'implied_medical', 'prohibited',
 'Claims to control, reduce, balance, or modulate cortisol or other stress hormones imply endocrine effects. In the EU, influencing hormone levels classifies a product as a medicinal product by function (Directive 2001/83/EC). In all markets, cortisol-control claims require clinical substantiation that most products lack.',
 ARRAY['controls cortisol', 'reduces cortisol', 'cortisol blocker', 'hormone balancer', 'balances stress hormones', 'adrenal support (as a therapeutic claim)', 'cortisol-crushing formula'],
 ARRAY['formulated with ashwagandha extract (as ingredient descriptor — no health claim in EU)', 'contains Vitamin B5 which contributes to normal mental performance and reduction of tiredness (if Pantothenic acid present at qualifying level)'],
 'EU Directive 2001/83/EC; EC 1924/2006; FTC Act; TGA Advertising Code; EFSA claim on Pantothenic acid ID 56, 59',
 'error');

