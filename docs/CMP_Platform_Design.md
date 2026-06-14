# IoT CMP Platform Design

## 1. Product Positioning

This CMP is a cloud-native IoT connectivity management platform for operators, MVNOs, IoT solution providers, resellers, and enterprise customers. It manages SIM/eSIM lifecycle, data package resale, usage rating, CDR normalization, billing, hierarchical accounts, customer APIs, and operational dashboards.

The platform should follow the professional CMP model seen in products such as Jasper/Cisco IoT Control Center: real-time connectivity visibility, provisioning, mobile service management, diagnostics, billing, business automation, operator integration, and customer self-service APIs.

## 2. Core User Roles

- Platform owner: operates resources, suppliers, products, billing rules, integrations, tenants, and SLA.
- Reseller: buys wholesale traffic or profiles, creates downstream reseller/customer accounts, manages packages and billing within granted scope.
- Enterprise customer: manages devices, SIMs/eSIMs, packages, usage, alerts, invoices, and API keys.
- Finance user: reviews rating, invoices, settlements, payments, credits, and disputes.
- Operations user: handles SIM/eSIM operations, CDR imports, supplier incidents, order retries, and batch jobs.
- Read-only auditor: views logs, billing, security events, and compliance records.

Use RBAC plus tenant-level data isolation. For large customers, add optional ABAC policies such as region, account tree, SIM group, product line, and cost center.

## 3. Functional Modules

### 3.1 Dashboard

- Global overview: active SIMs, active eSIM profiles, suspended lines, monthly usage, cost, revenue, margin, failed operations, and supplier health.
- Customer dashboard: traffic usage by region/package/device group, top consuming SIMs, pool balance, alerts, invoice status, and recent eSIM operations.
- Operations dashboard: CDR ingestion latency, rating backlog, failed supplier API calls, provisioning queue depth, retry volume, and SLA indicators.

### 3.2 eSIM Management

Entities:
- eUICC/eID inventory
- eSIM profile inventory
- profile state: available, allocated, downloading, installed, enabled, disabled, deleted, released, error
- SM-DP+, SM-SR, eIM, supplier, activation code, matching ID, ICCID, IMSI, MSISDN, Ki metadata reference, and profile policy

Capabilities:
- profile upload/import from supplier
- eID binding and unbinding
- profile allocation to account, device, package, or order
- download, install, enable, disable, delete, swap, release, suspend, resume, and status refresh
- bulk eSIM operation with validation, scheduling, dry run, retry, and rollback policy
- support multiple eSIM modes: SGP.22 consumer, SGP.02 M2M, and SGP.32 IoT/eIM-oriented flows
- immutable operation logs with request, response, actor, supplier transaction ID, correlation ID, and result

### 3.3 SIM/Number Management

- ICCID, IMSI, MSISDN, eID, APN, static IP, roaming policy, network access policy, device IMEI binding, and SIM group.
- Lifecycle: stock, assigned, activated, test-ready, active, suspended, terminated, recycled, lost, retired.
- Number inventory import, allocation, quarantine, recycling, ownership transfer, and compliance retention.
- Diagnostics: latest network attach, PDP/PDN session, last usage, current serving country/operator, IP session, SMS status, and abnormal traffic patterns.

### 3.4 Resource Supplier Integration

Resource suppliers include MNOs, MVNOs, eSIM aggregators, roaming hubs, wholesale data providers, SM-DP+/eIM vendors, and billing/CDR providers.

Integration capabilities:
- API adapter per supplier with versioning and credential isolation.
- Supplier product catalog sync: country, operator, RAT, APN, roaming zone, price, validity, throttling, and fair-use policy.
- Provisioning API: activate, suspend, resume, terminate, package change, profile operation, status query.
- CDR ingestion: SFTP, API pull, webhook, object storage drop, or message queue.
- CDR normalization pipeline converts supplier CDRs into one internal canonical CDR format.
- Settlement reconciliation: compare supplier CDR/cost against internal rated usage and customer bills.

Canonical CDR fields:
- cdr_id, supplier_id, account_id, iccid, imsi, msisdn, eid, session_id
- usage_type: data, sms, voice, event, eSIM operation
- start_time, end_time, timezone, country, operator, mcc, mnc, rat
- uplink_bytes, downlink_bytes, total_bytes, chargeable_units
- supplier_cost, rated_amount, currency, package_id, rate_plan_id
- raw_file_id, raw_record_hash, ingest_batch_id, rating_status

### 3.5 Package And Rating Configuration

Package dimensions:
- region: country, zone, operator, MCC/MNC, global, custom area
- traffic size: fixed quota, unlimited with FUP, pay-as-you-go, stepped tier, pooled quota
- validity: daily, monthly, annual, custom cycle, one-time, renewal package
- billing start: calendar month, activation day, first-usage day, custom contract day
- sharing: single SIM, account pool, reseller pool, device group pool, cross-region pool
- overage: stop, throttle, charge per MB/GB, auto top-up, alert-only

Rating engine:
- event-driven rating for near-real-time usage and batch rating for CDR settlement.
- deterministic versioned rate plans. A historical invoice always uses the exact rate-plan version active at rating time.
- priority model: customer contract override > reseller plan > default product plan > supplier base cost.
- support prepaid balance, postpaid billing, credit limit, and deposit.

### 3.6 Account And Tenant Hierarchy

Account tree:
- platform root
- reseller level N
- customer account
- sub-account / department / cost center

Each account has:
- parent account, account type, billing profile, currency, timezone, contract terms, invoice cycle, credit limit, reseller markup policy, package visibility, API scope, and data retention policy.

Rules:
- reseller can create child accounts only within assigned products, price floors, regions, and quotas.
- child usage rolls up to parent for settlement while still generating child-level invoices when configured.
- data access is scoped by account subtree.

### 3.7 User And Permission Management

- Organization users, service accounts, API clients, and temporary support access.
- RBAC roles: owner, admin, ops, finance, support, developer, viewer, custom role.
- Permission scopes: account tree, SIM group, package group, supplier, region, billing, API key, audit log.
- Security: SSO/SAML/OIDC, MFA, password policy, IP allowlist, session control, SCIM user provisioning, full audit trail.

### 3.8 Batch Operations

Supported batch jobs:
- SIM/eSIM import
- profile allocation
- package activation/deactivation
- suspend/resume/terminate
- APN/static IP assignment
- CDR import/reprocess
- price plan migration
- account creation

Batch architecture:
- upload file -> schema validation -> business validation -> preview -> approval -> async execution -> progress tracking -> downloadable result.
- every row gets a status, error code, retry eligibility, and operation correlation ID.
- support idempotency keys to avoid duplicate activation or billing.

### 3.9 Billing

Capabilities:
- automated account creation with billing profile and invoice delivery configuration.
- rating, invoice generation, tax/fee configuration, discounts, reseller markup, revenue share, credit notes, and adjustments.
- invoice cycles: monthly, activation-day monthly, weekly, custom contract cycle.
- email invoice delivery with PDF, CSV detail, and canonical CDR attachment/link.
- customer portal for invoice download, payment status, disputes, and usage drill-down.
- settlement module for supplier payable, reseller receivable/payable, and margin analysis.

### 3.10 Settings And Integration Management

- supplier API credentials, token rotation, webhooks, SFTP keys, IP allowlist, retry policy, timeout policy, and endpoint versions.
- customer API keys, OAuth clients, webhook subscriptions, rate limits, and callback signing secrets.
- global system settings: currencies, tax rules, regions, notification templates, SMTP provider, object storage, SLA thresholds, retention rules, and data export policy.

## 4. Customer Open API

API style:
- REST for standard business operations.
- Webhooks for async events.
- Optional GraphQL/read API for dashboard-style aggregation later.

Key APIs:
- accounts, users, roles, API keys
- SIM/eSIM inventory
- eSIM profile operation
- package activation and change
- usage query and usage export
- CDR export
- invoice query and download
- batch job creation/status
- webhook management

API design requirements:
- OAuth2 client credentials plus signed webhook callbacks.
- per-account rate limiting and quota.
- idempotency key for mutating operations.
- correlation ID returned in every response.
- versioned paths such as `/api/v1`.
- OpenAPI documentation and sandbox environment.

## 5. Cloud-Native Backend Architecture

Recommended service boundaries:
- Identity and Access Service
- Account/Tenant Service
- SIM Inventory Service
- eSIM Orchestration Service
- Supplier Integration Service
- Product/Package Service
- Rating Service
- CDR Ingestion Service
- Billing Service
- Batch Job Service
- Notification Service
- Dashboard Analytics Service
- Public API Gateway
- Audit/Compliance Service

Communication:
- synchronous REST/gRPC for low-latency queries and command submission.
- message bus for long-running provisioning, CDR import, rating, billing, notifications, and retries.
- workflow engine for eSIM operations and supplier orchestration.

Recommended infrastructure:
- Kubernetes or managed container platform.
- API gateway with WAF, rate limiting, authentication, request logging, and routing.
- PostgreSQL-compatible primary relational database for transactional data.
- partitioned usage/CDR tables or columnar warehouse for high-volume analytics.
- Redis for cache, locks, idempotency, and short-lived counters.
- Kafka/Pulsar/RabbitMQ for event streams and async jobs.
- object storage for raw CDR files, invoices, exports, and audit archives.
- search engine for operational logs and SIM lookup at scale.

## 6. Data Architecture

Transactional database:
- accounts, users, roles, permissions
- SIMs, eSIM profiles, eIDs, packages, contracts, rate plans
- orders, operations, jobs, invoices, payments

High-volume data:
- raw CDR files in object storage.
- normalized CDR in partitioned tables by month/supplier/account.
- rated usage facts in analytics storage.
- aggregated usage by account/SIM/day/hour/package for dashboard speed.

Principles:
- raw supplier CDR is immutable.
- normalized CDR is traceable to raw record hash.
- rated usage is versioned by rating policy.
- invoices are immutable after issue; corrections use credit/debit notes.

## 7. Scalability And SLA Design

Performance targets:
- portal page API p95 under 300-800 ms for common queries.
- SIM/eSIM command submission p95 under 1 second, with async completion.
- CDR ingestion horizontally scalable by supplier and file partition.
- dashboard reads served from pre-aggregated tables/cache, not raw CDR scans.

Availability:
- multi-AZ deployment.
- database read replicas for reporting.
- queue-based backpressure.
- retry with exponential backoff and dead-letter queues.
- supplier circuit breaker and degraded-mode status.
- RPO/RTO defined per module; billing and CDR require stronger backup policy.

Isolation:
- tenant-aware queries and account subtree authorization.
- optional large-customer shard or dedicated tenant partition.
- supplier adapter isolation so one failing resource party does not affect others.

## 8. Frontend Information Architecture

Primary navigation:
- Dashboard
- SIMs & Devices
- eSIM Profiles
- Packages
- Usage & CDR
- Accounts
- Billing
- Batch Jobs
- Supplier Resources
- APIs & Webhooks
- Settings
- Audit Logs

Important screens:
- SIM detail: lifecycle, package, usage chart, diagnostics, operations, CDR, billing impact.
- eSIM profile detail: eID binding, profile state, operation history, supplier transaction, QR/activation metadata.
- package builder: region selector, quota, cycle, pool rules, overage, price, reseller visibility, effective version.
- account tree: hierarchy, permissions, billing profile, credit limit, package entitlements.
- supplier console: API health, credentials, product sync, CDR files, reconciliation.
- billing center: invoice run, preview, approval, delivery, settlement, disputes.
- batch center: upload, validate, approve, execute, retry, export result.

UX principles:
- operational tables need dense filtering, saved views, bulk selection, export, and column customization.
- destructive operations require preview, impact summary, confirmation, and audit.
- every async action shows status and correlation ID.
- dashboard should separate executive metrics from ops incident metrics.

## 9. Security And Compliance

- least-privilege RBAC and scoped API keys.
- MFA/SSO for privileged roles.
- encrypt secrets with KMS; never store supplier tokens in plain text.
- encrypt data in transit and at rest.
- audit every account, billing, SIM/eSIM, supplier credential, and API-key action.
- signed webhooks and replay protection.
- fraud controls: abnormal usage detection, credit-limit enforcement, sudden roaming spike alerts.
- data retention and deletion policy by tenant and jurisdiction.

## 10. Recommended MVP Scope

Phase 1:
- account hierarchy, users/RBAC, SIM inventory, package configuration, supplier adapter framework, CDR normalization, usage dashboard, basic billing, customer API, audit logs.

Phase 2:
- full eSIM orchestration, reseller settlement, batch operations, advanced rating, invoice email automation, reconciliation, API sandbox, alerting.

Phase 3:
- multi-supplier optimization, real-time network diagnostics, advanced analytics, anomaly detection, SLA automation, dedicated tenant/sharding support, marketplace-style product catalog.

## 11. Suggested Domain Model

- Account
- User
- Role
- Permission
- Supplier
- SupplierProduct
- Sim
- Euicc
- EsimProfile
- Package
- RatePlan
- Contract
- Subscription
- UsageCdr
- RatedUsage
- Invoice
- InvoiceLine
- BatchJob
- Operation
- WebhookSubscription
- AuditLog

## 12. Integration Flow Examples

Supplier CDR flow:
1. supplier drops file or API exposes new CDR.
2. ingestion service stores raw file and creates ingest batch.
3. parser adapter validates and normalizes records.
4. deduplication uses supplier record ID and raw hash.
5. rating service applies package/rate-plan version.
6. aggregation service updates dashboard facts.
7. billing service consumes rated usage in invoice cycle.

eSIM operation flow:
1. user/API submits profile enable or download command.
2. platform validates account, profile state, package, and supplier availability.
3. workflow service creates operation and calls supplier/eIM/SM-DP+ adapter.
4. adapter returns async transaction ID.
5. status poll/webhook updates operation result.
6. inventory state changes only through state machine transition.
7. audit log and notification are emitted.

