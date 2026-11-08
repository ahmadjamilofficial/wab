-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  jurisdiction_default text NOT NULL DEFAULT 'PSX'::text,
  logo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  full_name text NOT NULL DEFAULT ''::text,
  role text NOT NULL DEFAULT 'owner'::text CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'analyst'::text, 'viewer'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_user_id_key UNIQUE (user_id),
  CONSTRAINT profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tax_profiles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  jurisdiction text NOT NULL,
  filer_status text NOT NULL DEFAULT 'Filer'::text,
  cgt_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  wht_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  holding_period_tiers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tax_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT tax_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.broker_accounts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  broker_name text NOT NULL,
  currency text NOT NULL DEFAULT 'PKR'::text,
  exchange text NOT NULL DEFAULT 'PSX'::text,
  external_ref text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT broker_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT broker_accounts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.documents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  broker_account_id uuid,
  storage_path text NOT NULL,
  doc_type text NOT NULL DEFAULT 'trade_confirmation'::text,
  status text NOT NULL DEFAULT 'uploading'::text CHECK (status = ANY (ARRAY['uploading'::text, 'processing'::text, 'done'::text, 'failed'::text])),
  extracted_data jsonb,
  confidence_score numeric,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT documents_pkey PRIMARY KEY (id),
  CONSTRAINT documents_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT documents_broker_account_id_fkey FOREIGN KEY (broker_account_id) REFERENCES public.broker_accounts(id),
  CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  broker_account_id uuid,
  document_id uuid,
  ticker text NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['BUY'::text, 'SELL'::text, 'DIV'::text])),
  quantity numeric NOT NULL,
  price numeric NOT NULL,
  fees numeric NOT NULL DEFAULT 0,
  wht numeric NOT NULL DEFAULT 0,
  trade_date date NOT NULL,
  ref_id text NOT NULL DEFAULT ''::text,
  confidence_score numeric NOT NULL DEFAULT 1.0,
  status text NOT NULL DEFAULT 'posted'::text CHECK (status = ANY (ARRAY['posted'::text, 'needs_review'::text])),
  exchange text NOT NULL DEFAULT 'PSX'::text,
  broker text NOT NULL DEFAULT ''::text,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT transactions_broker_account_id_fkey FOREIGN KEY (broker_account_id) REFERENCES public.broker_accounts(id),
  CONSTRAINT transactions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id)
);
CREATE TABLE public.ledger_entries (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  broker_account_id uuid,
  transaction_id uuid,
  entry_type text NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_pkey PRIMARY KEY (id),
  CONSTRAINT ledger_entries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT ledger_entries_broker_account_id_fkey FOREIGN KEY (broker_account_id) REFERENCES public.broker_accounts(id),
  CONSTRAINT ledger_entries_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id)
);
CREATE TABLE public.reconciliation_flags (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  broker_account_id uuid,
  flag_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warn'::text CHECK (severity = ANY (ARRAY['ok'::text, 'warn'::text, 'bad'::text])),
  ticker text NOT NULL DEFAULT ''::text,
  ref_id text NOT NULL DEFAULT ''::text,
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NOT NULL DEFAULT ''::text,
  suggested_resolution text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text, 'expected'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_flags_pkey PRIMARY KEY (id),
  CONSTRAINT reconciliation_flags_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT reconciliation_flags_broker_account_id_fkey FOREIGN KEY (broker_account_id) REFERENCES public.broker_accounts(id)
);
CREATE TABLE public.tax_computations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  tax_profile_id uuid,
  tax_year text NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'PSX'::text,
  filer_status text NOT NULL DEFAULT 'Filer'::text,
  short_term_gain numeric NOT NULL DEFAULT 0,
  long_term_gain numeric NOT NULL DEFAULT 0,
  dividend_wht numeric NOT NULL DEFAULT 0,
  estimated_tax_due numeric NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tax_computations_pkey PRIMARY KEY (id),
  CONSTRAINT tax_computations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT tax_computations_tax_profile_id_fkey FOREIGN KEY (tax_profile_id) REFERENCES public.tax_profiles(id)
);
CREATE TABLE public.tax_loss_harvest_suggestions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  position_ticker text NOT NULL,
  exchange text NOT NULL DEFAULT 'PSX'::text,
  unrealized_loss numeric NOT NULL,
  potential_offset numeric NOT NULL,
  holding_days integer NOT NULL DEFAULT 0,
  rationale text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'applied'::text, 'dismissed'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tax_loss_harvest_suggestions_pkey PRIMARY KEY (id),
  CONSTRAINT tax_loss_harvest_suggestions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash text NOT NULL DEFAULT ''::text,
  hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free'::text CHECK (plan = ANY (ARRAY['free'::text, 'pro'::text, 'enterprise'::text])),
  status text NOT NULL DEFAULT 'active'::text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.chat_threads (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New audit'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_threads_pkey PRIMARY KEY (id),
  CONSTRAINT chat_threads_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT chat_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.chat_messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  thread_id uuid NOT NULL,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  ai_message_id text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id),
  CONSTRAINT chat_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);