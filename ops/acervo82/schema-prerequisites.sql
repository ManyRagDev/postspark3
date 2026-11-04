-- Local application prerequisites absent from the historical migration chain.
-- This is not a replica of the hosted billing/ManyLabs infrastructure.
create extension if not exists "uuid-ossp" with schema extensions;
create table postspark.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  plan text not null default 'FREE' check (plan in ('FREE','LITE','PRO','AGENCY','FOUNDER','DEV')),
  sparks integer not null default 0 check (sparks >= 0),
  sparks_refill_date timestamptz,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table postspark.background_assets (
  id bigint generated always as identity primary key,
  user_uuid uuid not null references auth.users(id) on delete cascade,
  image_url text not null, source_type text not null, prompt text, label text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index background_assets_owner on postspark.background_assets(user_uuid, "createdAt" desc);
create table postspark.privacy_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id), action text not null,
  timestamp timestamptz not null default now(), metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index privacy_logs_owner on postspark.privacy_logs(user_id, created_at desc);
create table postspark.subscriptions (
  id text primary key, user_id uuid references postspark.profiles(id),
  stripe_subscription_id text unique, stripe_customer_id text, plan text, status text,
  current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean not null default false
);
create table postspark.topup_packages (
  id text primary key, name text not null, sparks integer not null,
  price_brl numeric not null, stripe_price_id text, active boolean not null default false
);
