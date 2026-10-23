ALTER TABLE "index_listings" ALTER COLUMN "moderation" SET DEFAULT 'visible';--> statement-breakpoint
ALTER TABLE "index_animals" ADD COLUMN "birth_estimate" date;--> statement-breakpoint
-- Approval now belongs to the organisation (index_orgs.trusted, checked at query time), so a
-- listing's own state only records whether a report has hidden it. Birth estimates fill in
-- as animals are re-indexed.
UPDATE "index_listings" SET "moderation" = 'visible' WHERE "moderation" IN ('pending', 'approved');
