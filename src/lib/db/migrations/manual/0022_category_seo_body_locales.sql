-- The category SEO body existed only in Romanian, and the page rendered it
-- whatever language the reader had chosen. So /ru/categorie/formatii served a
-- Russian header and a Russian footer wrapped around Romanian headings and
-- paragraphs — on an indexed page, which is both a poor read and a mixed
-- language signal to search engines.
--
-- Titles and descriptions already had all three (seo_title_ro/ru/en,
-- seo_desc_ro/ru/en); only the body was left behind. This finishes the set.
ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "seo_body_ru" text,
  ADD COLUMN IF NOT EXISTS "seo_body_en" text;
