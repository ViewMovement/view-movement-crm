-- v6: Role-based access control
-- Roles: admin (full access), retention (financial + retention views), ops (operational only — no financials)

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  role text not null default 'ops' check (role in ('admin', 'retention', 'ops')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_roles_email on user_roles (email);

-- Seed: Ty is admin
insert into user_roles (email, role) values ('ty@viewmovement.com', 'admin')
on conflict (email) do update set role = 'admin';
