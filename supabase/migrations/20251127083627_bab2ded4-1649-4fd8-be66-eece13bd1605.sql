-- Change years_of_experience from integer to numeric to support decimal values
ALTER TABLE profiles 
ALTER COLUMN years_of_experience TYPE numeric USING years_of_experience::numeric;