create table if not exists public.parcel_categories (
  id text primary key,
  name text not null,
  slug text not null unique,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);

create table if not exists public.parcels (
  id text primary key,
  "categoryId" text null references public.parcel_categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  price integer not null check (price >= 0),
  contents jsonb not null default '[]'::jsonb,
  badge text,
  image text,
  "isActive" boolean not null default true,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);

create table if not exists public.parcel_images (
  id text primary key,
  "parcelId" text not null references public.parcels(id) on delete cascade,
  url text not null,
  alt text,
  "sortOrder" integer not null default 0,
  "createdAt" timestamp(3) not null default current_timestamp
);

create index if not exists parcels_category_id_idx on public.parcels("categoryId");
create index if not exists parcel_images_parcel_id_idx on public.parcel_images("parcelId");

insert into public.parcel_categories (id, name, slug)
select 'parcel-category-default', 'Parcel', 'parcel'
where not exists (select 1 from public.parcel_categories where slug = 'parcel');

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'parcel_packages') then
    insert into public.parcels (id, "categoryId", name, slug, description, price, contents, badge, image, "isActive")
    select
      id,
      'parcel-category-default',
      name,
      slug,
      coalesce(category, 'Parcel'),
      price,
      contents::jsonb,
      badge,
      image,
      "isActive"
    from public.parcel_packages
    on conflict (slug) do nothing;
  end if;
end $$;

alter table public.parcel_categories enable row level security;
alter table public.parcels enable row level security;
alter table public.parcel_images enable row level security;

drop policy if exists "Parcel categories are public readable" on public.parcel_categories;
create policy "Parcel categories are public readable" on public.parcel_categories for select using (true);

drop policy if exists "Parcels are public readable" on public.parcels;
create policy "Parcels are public readable" on public.parcels for select using (true);

drop policy if exists "Parcel images are public readable" on public.parcel_images;
create policy "Parcel images are public readable" on public.parcel_images for select using (true);