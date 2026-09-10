-- Partners declare the kinds of events they accept. The all-types default
-- preserves discovery visibility for every existing profile.
alter table public.artists
  add column if not exists event_types text[] not null default array[
    'wedding',
    'proposal',
    'cununie',
    'baptism',
    'cumatrie',
    'birthday',
    'kids_birthday',
    'corporate',
    'concert',
    'other'
  ]::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'artists_event_types_allowed_check'
      and conrelid = 'public.artists'::regclass
  ) then
    alter table public.artists
      add constraint artists_event_types_allowed_check
      check (
        cardinality(event_types) > 0
        and event_types <@ array[
          'wedding',
          'proposal',
          'cununie',
          'baptism',
          'cumatrie',
          'birthday',
          'kids_birthday',
          'corporate',
          'concert',
          'other'
        ]::text[]
      );
  end if;
end
$$;

create index if not exists artists_event_types_gin_idx
  on public.artists using gin (event_types);

-- Add the requested partner category. Slug is the stable identity across
-- environments; the upsert also repairs a partially-created row.
insert into public.categories (
  name_ro,
  name_ru,
  name_en,
  slug,
  description_ro,
  description_ru,
  description_en,
  icon,
  image_url,
  image_alt,
  type,
  is_active,
  sort_order,
  seo_title_ro,
  seo_title_ru,
  seo_title_en,
  seo_desc_ro,
  seo_desc_ru,
  seo_desc_en
)
values (
  'Coordonatori de evenimente',
  'Координаторы мероприятий',
  'Event Coordinators',
  'coordonatori-evenimente',
  'Coordonare și organizare pentru nunți, petreceri și evenimente corporate.',
  'Координация и организация свадеб, праздников и корпоративных мероприятий.',
  'Coordination and planning for weddings, celebrations, and corporate events.',
  'clipboard-check',
  '/images/redesign/home/home-feature-planner.webp',
  'Coordonator de eveniment care organizează detaliile unei petreceri',
  'service',
  true,
  8,
  'Coordonatori de evenimente în Moldova | ePetrecere.md',
  'Координаторы мероприятий в Молдове | ePetrecere.md',
  'Event Coordinators in Moldova | ePetrecere.md',
  'Găsește coordonatori de evenimente pentru nunți, aniversări și petreceri în Chișinău și în toată Moldova.',
  'Найдите координатора для свадьбы, праздника или корпоративного мероприятия в Кишинёве и по всей Молдове.',
  'Find event coordinators for weddings, celebrations, and corporate events in Chișinău and across Moldova.'
)
on conflict (slug) do update set
  name_ro = excluded.name_ro,
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  description_ro = excluded.description_ro,
  description_ru = excluded.description_ru,
  description_en = excluded.description_en,
  icon = excluded.icon,
  image_url = excluded.image_url,
  image_alt = excluded.image_alt,
  type = excluded.type,
  is_active = excluded.is_active,
  seo_title_ro = excluded.seo_title_ro,
  seo_title_ru = excluded.seo_title_ru,
  seo_title_en = excluded.seo_title_en,
  seo_desc_ro = excluded.seo_desc_ro,
  seo_desc_ru = excluded.seo_desc_ru,
  seo_desc_en = excluded.seo_desc_en;

-- Keep Foto, Video and Foto & Video adjacent everywhere that respects the
-- category sort order. Every known category receives one deterministic slot.
update public.categories as category
set sort_order = desired.sort_order
from (
  values
    ('moderatori', 1),
    ('dj', 2),
    ('cantareti', 3),
    ('formatii', 4),
    ('fotografi', 5),
    ('videografi', 6),
    ('foto-video', 7),
    ('coordonatori-evenimente', 8),
    ('decor', 9),
    ('animatori', 10),
    ('echipament-tehnic', 11),
    ('show-program', 12),
    ('cantareti-de-estrada', 13),
    ('interpreti-muzica-populara', 14),
    ('cover-band', 15),
    ('instrumentalisti', 16),
    ('cvartet', 17),
    ('dansatori', 18),
    ('dansuri-populare', 19),
    ('ansamblu-tiganesc', 20),
    ('dans-oriental', 21),
    ('striptiz', 22),
    ('iluzionisti-magicieni', 23),
    ('show-ul-focului', 24),
    ('clovni', 25),
    ('interesant-la-sarbatoare', 26),
    ('stand-up', 27),
    ('show-circus', 28),
    ('mos-craciun', 29),
    ('foto-zona-selfie', 30)
) as desired(slug, sort_order)
where category.slug = desired.slug;
