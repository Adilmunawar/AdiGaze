-- Fix experience_years column to accept decimal values
ALTER TABLE candidate_matches 
ALTER COLUMN experience_years TYPE numeric(5,2);

COMMENT ON COLUMN candidate_matches.experience_years IS 'Years of professional experience (allows decimals like 2.5 years)';