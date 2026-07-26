create table if not exists public.cart_items (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  product_id text null references public.products(id) on delete set null,
  product_ref text not null,
  name text not null,
  price integer not null check (price >= 0),
  image text null,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint cart_items_user_product_ref_key unique (user_id, product_ref)
);

create index if not exists cart_items_user_id_idx on public.cart_items(user_id);
create index if not exists cart_items_product_ref_idx on public.cart_items(product_ref);

alter table public.cart_items enable row level security;

drop policy if exists "Cart items are private" on public.cart_items;
create policy "Cart items are private"
on public.cart_items
for all
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

create or replace function public.set_cart_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_cart_items_updated_at on public.cart_items;
create trigger set_cart_items_updated_at
before update on public.cart_items
for each row execute function public.set_cart_items_updated_at();