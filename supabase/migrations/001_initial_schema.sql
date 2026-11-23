-- ============================================================
-- Yimaru CRM — Database schema (Supabase / PostgreSQL)
-- Spec §4 — 9 tables
-- Run this in the Supabase SQL editor or via supabase db push
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── users ──────────────────────────────────────────────────
create type user_role as enum ('partner', 'staff');

create table if not exists users (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  username     text unique not null,
  password_hash text not null,
  role         user_role not null default 'staff',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references users(id)
);

-- ── settings (single row) ──────────────────────────────────
create table if not exists settings (
  id              uuid primary key default gen_random_uuid(),
  business_name   text not null default 'Yimaru Consulting',
  currency        text not null default 'ETB',
  p1_registration integer,
  p1_total        integer,
  p2_registration integer,
  p2_total        integer,
  cadence         integer[] not null default '{0,1,3,7,14}',
  updated_at      timestamptz not null default now(),
  updated_by      uuid references users(id)
);

-- ── destination_prices ─────────────────────────────────────
create table if not exists destination_prices (
  id         uuid primary key default gen_random_uuid(),
  country    text unique not null,
  payment1   integer not null default 150000,
  payment2   integer not null default 150000,
  sort_order integer not null default 0
);

-- ── students ───────────────────────────────────────────────
create type student_stage as enum (
  'registration', 'assessment', 'onboarding',
  'admission', 'visafile', 'submitted', 'outcome'
);
create type risk_level as enum ('strong', 'improve', 'high');
create type visa_decision as enum ('approved', 'additional', 'refused');
create type sponsor_type as enum ('scholarship', 'self');
create type package_type as enum ('p1', 'p2');

create table if not exists students (
  id                      uuid primary key default gen_random_uuid(),
  case_id                 text unique not null,  -- YIM-YYYY-NNNN
  full_name               text not null,
  phone                   text,
  email                   text,
  source                  text,
  age                     text,
  education               text,
  gpa                     text,
  graduation_year         text,
  field_of_study          text,
  english_proficiency     text,
  work_experience         text,
  study_level             text,
  target_countries        text[] not null default '{}',
  budget                  text,
  sponsor                 text,
  sponsor_relationship    text,
  previous_visa_history   text,
  previous_refusals       text,
  passport_status         text,
  intended_intake         text,
  risk                    risk_level,
  assessment_notes        text,
  strategy_country        text,
  strategy_university     text,
  strategy_program        text,
  strategy_admission_route text,
  strategy_funding        text,
  strategy_visa_route     text,
  stage                   student_stage not null default 'registration',
  officer                 uuid references users(id),
  archived                boolean not null default false,
  sponsor_type            sponsor_type,
  package_type            package_type,
  financial               jsonb not null default '{}',
  financial_notes         text,
  visa_country            text,
  visa                    jsonb not null default '{}',
  qc_passed               boolean not null default false,
  qc_notes                text,
  appt_requested          boolean not null default false,
  appt_confirmed          boolean not null default false,
  appt_biometrics         boolean not null default false,
  appt_submitted          boolean not null default false,
  appt_date               date,
  interview               jsonb not null default '{}',
  decision                visa_decision,
  decided_at              timestamptz,
  converted_from_lead     uuid,
  is_sample               boolean not null default false,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  updated_by              uuid references users(id)
);

-- ── payments (3 rows per student, created with student) ────
create type payment_kind as enum ('registration', 'payment1', 'payment2');

create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  kind        payment_kind not null,
  paid        boolean not null default false,
  amount      integer not null default 0,  -- birr, no cents
  paid_on     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references users(id),
  unique (student_id, kind)
);

-- ── applications ───────────────────────────────────────────
create type app_status as enum (
  'Planned', 'Applied', 'In review', 'Offer', 'Rejected', 'Enrolled'
);

create table if not exists applications (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  university  text not null,
  program     text not null,
  portal      text,
  conditions  text,
  result      text,
  fee         integer,
  deadline    date,
  applied_on  date,
  status      app_status not null default 'Planned',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references users(id)
);

-- ── activity ───────────────────────────────────────────────
create type activity_kind as enum ('note', 'stage', 'money', 'file', 'call');

create table if not exists activity (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  ts          timestamptz not null default now(),
  author_id   uuid references users(id),
  author_name text not null,  -- denormalised copy
  kind        activity_kind not null,
  text        text not null   -- English key with {params}; translated on display
);

-- ── leads ──────────────────────────────────────────────────
create type lead_status as enum ('open', 'closed', 'converted');
create type close_reason as enum ('no_response', 'not_interested', 'out_of_scope', 'other');
create type lead_package as enum ('p1', 'p2');

create table if not exists leads (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null,  -- L-001
  name               text,
  phone              text,
  telegram           text,
  source             text,
  interest_country   text,
  interest_package   lead_package,
  education          text,
  intake             text,
  goal               text,
  notes              text,
  status             lead_status not null default 'open',
  call_attempts      integer not null default 0,
  next_call_on       date,
  close_reason       close_reason,
  converted_case_id  uuid references students(id),
  is_sample          boolean not null default false,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references users(id)
);

-- ── lead_calls ─────────────────────────────────────────────
create type lead_outcome as enum ('no_answer', 'answered', 'not_interested', 'out_of_scope');

create table if not exists lead_calls (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  ts          timestamptz not null default now(),
  attempt     integer not null,
  outcome     lead_outcome not null,
  note        text,
  author_id   uuid references users(id),
  author_name text not null
);

-- ── Indexes ────────────────────────────────────────────────
create index if not exists idx_students_stage      on students(stage)       where deleted_at is null;
create index if not exists idx_students_archived   on students(archived)    where deleted_at is null;
create index if not exists idx_students_officer    on students(officer)     where deleted_at is null;
create index if not exists idx_leads_status        on leads(status)         where deleted_at is null;
create index if not exists idx_leads_next_call     on leads(next_call_on)   where deleted_at is null;
create index if not exists idx_activity_student    on activity(student_id, ts desc);
create index if not exists idx_lead_calls_lead     on lead_calls(lead_id, ts desc);

-- ── Row-Level Security ─────────────────────────────────────
-- Enable RLS on every table. The API (or Supabase auth) enforces roles.
alter table users            enable row level security;
alter table settings         enable row level security;
alter table destination_prices enable row level security;
alter table students         enable row level security;
alter table payments         enable row level security;
alter table applications     enable row level security;
alter table activity         enable row level security;
alter table leads            enable row level security;
alter table lead_calls       enable row level security;

-- ── Seed settings and destination prices ───────────────────
insert into settings (business_name, currency, cadence)
values ('Yimaru Consulting', 'ETB', '{0,1,3,7,14}')
on conflict do nothing;

insert into destination_prices (country, payment1, payment2, sort_order) values
  ('Italy',   150000, 150000, 1),
  ('Germany', 150000, 150000, 2),
  ('Hungary', 150000, 150000, 3),
  ('Austria', 150000, 150000, 4),
  ('Canada',  150000, 150000, 5),
  ('USA',     150000, 150000, 6),
  ('UK',      150000, 150000, 7),
  ('Cyprus',  150000, 150000, 8)
on conflict (country) do nothing;
