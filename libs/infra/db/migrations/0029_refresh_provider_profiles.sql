-- Nothing stored a country before the column existed, and a row inside its
-- refresh window is not asked again for a week. Ageing every row makes the
-- next read of each handle fill what is missing.
UPDATE "provider_profiles" SET "fetched_at" = 'epoch';
