alter table if exists products add column if not exists sku text unique;
alter table if exists products add column if not exists description text;
alter table if exists products add column if not exists "minimumStock" integer not null default 0;
alter table if exists products add column if not exists status text not null default 'Aktif';
alter table if exists products add column if not exists "updatedAt" timestamptz not null default now();

do $$
begin
  if to_regclass('public.parcel_packages') is not null then
    insert into products (id, name, slug, sku, image, description, category, stock, "minimumStock", price, status, "isActive", badge, "createdAt", "updatedAt")
    select id, name, coalesce(nullif(slug, ''), lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))), nullif(slug, ''), image, description, 'Parcel', 0, 0, price, case when "isActive" then 'Aktif' else 'Tidak Aktif' end, "isActive", badge, "createdAt", coalesce("updatedAt", now())
    from parcel_packages
    on conflict (id) do update set name = excluded.name, slug = excluded.slug, sku = excluded.sku, image = excluded.image, description = excluded.description, category = 'Parcel', price = excluded.price, status = excluded.status, "isActive" = excluded."isActive", badge = excluded.badge, "updatedAt" = excluded."updatedAt";
  end if;
end $$;

drop table if exists parcel_images cascade;
drop table if exists parcel_packages cascade;
drop table if exists parcel_categories cascade;