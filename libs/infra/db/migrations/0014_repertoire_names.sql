-- The derived books were called "Extracted — white" / "Extracted — black".
-- Extraction is how a book got here, not what it is, and a title that
-- leads with its plumbing tells the reader to distrust it. The product
-- has exactly two books; this is what they are called.
--
-- Data only: identity moved to (user, color, source) in the same change,
-- so nothing looks a repertoire up by name any more and renaming these
-- rows cannot orphan anything.
UPDATE "repertoires" SET "name" = 'White repertoire'
  WHERE "name" = 'Extracted — white' AND "color" = 'white';
--> statement-breakpoint
UPDATE "repertoires" SET "name" = 'Black repertoire'
  WHERE "name" = 'Extracted — black' AND "color" = 'black';
