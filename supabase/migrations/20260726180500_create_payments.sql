create table if not exists public.payments (
  id text primary key,
  "orderId" text not null unique references public.orders(id) on delete cascade,
  method text not null,
  amount integer not null,
  status text not null default 'Pending' check (status in ('Pending', 'Paid', 'Expired', 'Cancelled')),
  "expiredAt" timestamp(3),
  "paidAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);

create index if not exists payments_status_idx on public.payments(status);