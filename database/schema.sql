-- LocalCMP phase-1 PostgreSQL schema.
-- Modular monolith boundary: independent schemas, shared database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS account;
CREATE SCHEMA IF NOT EXISTS resource;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS esim;
CREATE SCHEMA IF NOT EXISTS product;
CREATE SCHEMA IF NOT EXISTS usage_data;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS operation;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS account.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_account_id uuid REFERENCES account.accounts(id),
  account_code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('platform', 'reseller', 'customer', 'sub_account', 'cost_center', 'billing_entity')),
  account_status text NOT NULL CHECK (account_status IN ('draft', 'pending_review', 'active', 'suspended', 'closed')),
  risk_status text NOT NULL DEFAULT 'normal' CHECK (risk_status IN ('normal', 'credit_hold', 'compliance_hold', 'fraud_hold')),
  billing_status text NOT NULL DEFAULT 'current' CHECK (billing_status IN ('current', 'overdue', 'dunning', 'bad_debt')),
  currency char(3) NOT NULL DEFAULT 'CNY',
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  billing_cycle_type text NOT NULL DEFAULT 'calendar_month',
  billing_day smallint,
  credit_limit_amount numeric(18, 4) DEFAULT 0,
  reseller_level int DEFAULT 0,
  path text NOT NULL,
  data_retention_days int DEFAULT 730,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_parent ON account.accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_path ON account.accounts(path);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON account.accounts(account_status, risk_status, billing_status);

CREATE TABLE IF NOT EXISTS identity.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  phone text,
  display_name text NOT NULL,
  user_type text NOT NULL DEFAULT 'human_user' CHECK (user_type IN ('human_user', 'support_user')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'locked', 'suspended', 'deactivated', 'deleted')),
  mfa_enabled boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  identity_provider text,
  external_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code text NOT NULL UNIQUE,
  role_name text NOT NULL,
  role_scope text NOT NULL DEFAULT 'tenant',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_code text NOT NULL UNIQUE,
  description text
);

CREATE TABLE IF NOT EXISTS identity.user_accounts (
  user_id uuid NOT NULL REFERENCES identity.users(id),
  account_id uuid NOT NULL REFERENCES account.accounts(id),
  scope_type text NOT NULL CHECK (scope_type IN ('self', 'subtree')),
  status text NOT NULL DEFAULT 'active',
  PRIMARY KEY (user_id, account_id)
);

CREATE TABLE IF NOT EXISTS identity.user_roles (
  user_id uuid NOT NULL REFERENCES identity.users(id),
  role_id uuid NOT NULL REFERENCES identity.roles(id),
  account_id uuid NOT NULL REFERENCES account.accounts(id),
  PRIMARY KEY (user_id, role_id, account_id)
);

CREATE TABLE IF NOT EXISTS identity.role_permissions (
  role_id uuid NOT NULL REFERENCES identity.roles(id),
  permission_id uuid NOT NULL REFERENCES identity.permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS resource.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code text NOT NULL UNIQUE,
  supplier_name text NOT NULL,
  supplier_type text NOT NULL CHECK (supplier_type IN ('mno', 'mvno', 'aggregator', 'esim_provider', 'cdr_provider')),
  status text NOT NULL DEFAULT 'active',
  api_base_url text,
  callback_url text,
  timezone text DEFAULT 'UTC',
  default_currency char(3) DEFAULT 'USD',
  sla_level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource.supplier_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES resource.suppliers(id),
  auth_type text NOT NULL CHECK (auth_type IN ('api_key', 'oauth2', 'basic', 'certificate', 'sftp_key')),
  credential_name text NOT NULL,
  encrypted_secret_ref text NOT NULL,
  token_expired_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  last_rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_code text NOT NULL UNIQUE,
  name text NOT NULL,
  package_type text NOT NULL CHECK (package_type IN ('data', 'sms', 'voice', 'esim_operation', 'bundle')),
  package_status text NOT NULL CHECK (package_status IN ('draft', 'pending_review', 'active', 'deprecated', 'retired', 'archived')),
  region_scope text NOT NULL,
  quota_bytes bigint,
  validity_type text,
  billing_start_type text NOT NULL CHECK (billing_start_type IN ('calendar_month', 'activation_day', 'first_usage_day', 'contract_day')),
  pool_enabled boolean NOT NULL DEFAULT false,
  overage_policy text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product.rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES product.packages(id),
  version int NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  currency char(3) NOT NULL,
  base_fee_amount numeric(18, 4) NOT NULL DEFAULT 0,
  included_quota_bytes bigint,
  overage_unit text,
  overage_price_amount numeric(18, 4),
  tier_rules_json jsonb,
  reseller_min_price_amount numeric(18, 4),
  status text NOT NULL CHECK (status IN ('draft', 'scheduled', 'effective', 'expired', 'cancelled')),
  UNIQUE (package_id, version)
);

CREATE TABLE IF NOT EXISTS inventory.sims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account.accounts(id),
  supplier_id uuid REFERENCES resource.suppliers(id),
  package_id uuid REFERENCES product.packages(id),
  iccid text NOT NULL UNIQUE,
  imsi text,
  msisdn text,
  eid text,
  imei text,
  sim_type text NOT NULL CHECK (sim_type IN ('physical', 'esim_profile')),
  inventory_status text NOT NULL CHECK (inventory_status IN ('stock', 'reserved', 'assigned', 'recycled', 'retired')),
  service_status text NOT NULL CHECK (service_status IN ('not_started', 'pending_activation', 'test_ready', 'active', 'suspension_pending', 'suspended', 'resume_pending', 'termination_pending', 'terminated', 'failed')),
  service_status_reason text,
  country text,
  mcc text,
  mnc text,
  apn text,
  static_ip inet,
  activated_at timestamptz,
  suspended_at timestamptz,
  terminated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sims_account_status ON inventory.sims(account_id, service_status);
CREATE INDEX IF NOT EXISTS idx_sims_imsi ON inventory.sims(imsi);
CREATE INDEX IF NOT EXISTS idx_sims_msisdn ON inventory.sims(msisdn);
CREATE INDEX IF NOT EXISTS idx_sims_eid ON inventory.sims(eid);

CREATE TABLE IF NOT EXISTS esim.euiccs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES account.accounts(id),
  eid text NOT NULL UNIQUE,
  device_id text,
  manufacturer text,
  model text,
  rsp_mode text CHECK (rsp_mode IN ('sgp22', 'sgp02', 'sgp32')),
  status text NOT NULL DEFAULT 'active',
  last_seen_at timestamptz
);

CREATE TABLE IF NOT EXISTS esim.esim_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES resource.suppliers(id),
  account_id uuid REFERENCES account.accounts(id),
  euicc_id uuid REFERENCES esim.euiccs(id),
  iccid text NOT NULL UNIQUE,
  imsi text,
  msisdn text,
  profile_type text,
  profile_state text NOT NULL CHECK (profile_state IN ('available', 'allocated', 'downloading', 'installed', 'enabled', 'disabled', 'deleted', 'released', 'error')),
  smdp_address text,
  smsr_id text,
  eim_id text,
  activation_code_ref text,
  matching_id text,
  allocated_at timestamptz,
  installed_at timestamptz,
  enabled_at timestamptz
);

CREATE TABLE IF NOT EXISTS product.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account.accounts(id),
  sim_id uuid REFERENCES inventory.sims(id),
  package_id uuid NOT NULL REFERENCES product.packages(id),
  rate_plan_id uuid REFERENCES product.rate_plans(id),
  status text NOT NULL CHECK (status IN ('pending_activation', 'active', 'suspended', 'pending_change', 'expired', 'cancelled', 'terminated')),
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  billing_anchor_at timestamptz,
  auto_renew boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS operation.sim_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account.accounts(id),
  sim_id uuid NOT NULL REFERENCES inventory.sims(id),
  operation_type text NOT NULL CHECK (operation_type IN ('activate', 'suspend', 'resume', 'terminate', 'change_package')),
  operation_status text NOT NULL CHECK (operation_status IN ('accepted', 'validating', 'submitted', 'processing', 'succeeded', 'failed', 'cancelled', 'timeout')),
  supplier_transaction_id text,
  idempotency_key text,
  request_payload_hash text,
  response_payload_hash text,
  error_code text,
  error_message text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_operations_idempotency ON operation.sim_operations(sim_id, operation_type, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS operation.esim_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account.accounts(id),
  profile_id uuid REFERENCES esim.esim_profiles(id),
  euicc_id uuid REFERENCES esim.euiccs(id),
  operation_type text NOT NULL,
  operation_status text NOT NULL,
  supplier_transaction_id text,
  idempotency_key text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS usage_data.raw_cdr_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES resource.suppliers(id),
  file_name text NOT NULL,
  storage_uri text NOT NULL,
  file_hash text NOT NULL,
  record_count int,
  status text NOT NULL CHECK (status IN ('received', 'parsing', 'parsed', 'failed', 'archived')),
  received_at timestamptz NOT NULL DEFAULT now(),
  parsed_at timestamptz
);

CREATE TABLE IF NOT EXISTS usage_data.usage_cdrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id uuid REFERENCES usage_data.raw_cdr_files(id),
  supplier_id uuid REFERENCES resource.suppliers(id),
  account_id uuid REFERENCES account.accounts(id),
  sim_id uuid REFERENCES inventory.sims(id),
  iccid text,
  imsi text,
  msisdn text,
  eid text,
  session_id text,
  usage_type text NOT NULL DEFAULT 'data',
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  country text,
  operator_name text,
  mcc text,
  mnc text,
  rat text,
  uplink_bytes bigint DEFAULT 0,
  downlink_bytes bigint DEFAULT 0,
  total_bytes bigint DEFAULT 0,
  chargeable_units numeric(18, 4),
  raw_record_hash text,
  rating_status text NOT NULL DEFAULT 'unrated'
);

CREATE INDEX IF NOT EXISTS idx_usage_cdrs_account_time ON usage_data.usage_cdrs(account_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_usage_cdrs_iccid_time ON usage_data.usage_cdrs(iccid, start_time DESC);

CREATE TABLE IF NOT EXISTS usage_data.rated_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_cdr_id uuid REFERENCES usage_data.usage_cdrs(id),
  account_id uuid REFERENCES account.accounts(id),
  subscription_id uuid REFERENCES product.subscriptions(id),
  package_id uuid REFERENCES product.packages(id),
  rate_plan_id uuid REFERENCES product.rate_plans(id),
  rate_plan_version int,
  rated_units numeric(18, 4),
  unit_price_amount numeric(18, 6),
  amount numeric(18, 4),
  currency char(3),
  supplier_cost_amount numeric(18, 4),
  rating_time timestamptz NOT NULL DEFAULT now(),
  invoice_id uuid,
  status text NOT NULL DEFAULT 'rated'
);

CREATE TABLE IF NOT EXISTS billing.billing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES account.accounts(id),
  invoice_email text,
  billing_cycle_type text NOT NULL,
  billing_day smallint,
  tax_id text,
  tax_rate numeric(8, 4) DEFAULT 0,
  payment_terms_days int DEFAULT 30,
  invoice_language text DEFAULT 'zh-CN',
  invoice_template_id text
);

CREATE TABLE IF NOT EXISTS billing.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account.accounts(id),
  invoice_no text NOT NULL UNIQUE,
  invoice_period_start date NOT NULL,
  invoice_period_end date NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'preview', 'approved', 'issued', 'sent', 'paid', 'voided')),
  currency char(3) NOT NULL,
  subtotal_amount numeric(18, 4) NOT NULL DEFAULT 0,
  tax_amount numeric(18, 4) NOT NULL DEFAULT 0,
  total_amount numeric(18, 4) NOT NULL DEFAULT 0,
  due_at date,
  issued_at timestamptz,
  sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS operation.batch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES account.accounts(id),
  job_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('uploaded', 'validating', 'waiting_approval', 'running', 'completed', 'failed', 'cancelled')),
  source_file_uri text,
  total_count int DEFAULT 0,
  success_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  created_by text,
  approved_by text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account.accounts(id),
  client_name text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  secret_hash text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration.webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES account.accounts(id),
  event_type text NOT NULL,
  target_url text NOT NULL,
  signing_secret_ref text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  retry_policy jsonb
);

CREATE TABLE IF NOT EXISTS operation.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES account.accounts(id),
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'api_client', 'system')),
  actor_id text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  before_hash text,
  after_hash text,
  ip_address inet,
  user_agent text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_account_time ON audit.audit_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit.audit_logs(resource_type, resource_id);
