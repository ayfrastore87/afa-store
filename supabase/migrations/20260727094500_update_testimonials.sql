create table if not exists testimonials (
  id text primary key,
  name text not null,
  city text not null,
  whatsapp text,
  message text not null,
  rating integer not null default 5 check (rating between 1 and 5),
  avatar text,
  "isActive" boolean not null default false,
  "isVerified" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

alter table testimonials add column if not exists whatsapp text;
alter table testimonials add column if not exists "isVerified" boolean not null default false;
alter table testimonials add column if not exists "updatedAt" timestamptz not null default now();
alter table testimonials alter column "isActive" set default false;

create index if not exists testimonials_public_idx on testimonials ("isActive", "isVerified", rating, "createdAt");