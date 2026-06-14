function registerRoutes(router, services) {
  router.add("GET", "/api/v1/health", ({ services: scoped }) => ({
    status: "ok",
    architecture: "phase-1 modular-monolith",
    database: "PostgreSQL schema in database/schema.sql",
    persistence: scoped.store.mode,
  }));
  router.add("GET", "/api/v1/auth/context", ({ auth }) => ({
    user: auth.user ? { ...auth.user, passwordHash: undefined, passwordSalt: undefined } : null,
    accountId: auth.accountId,
    permissions: [...auth.permissions],
  }));
  router.add("POST", "/api/v1/auth/login", ({ services: scoped, body, correlationId }) => scoped.identity.login(body, correlationId));
  router.add("GET", "/api/v1/openapi", () => ({
    openapi: "3.1.0",
    info: { title: "LocalCMP API", version: "0.1.0" },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/sims": { get: { summary: "List SIM inventory" } },
      "/sims/operation-preview": { post: { summary: "Preview SIM lifecycle operation" } },
      "/cdrs/import": { post: { summary: "Import and normalize supplier CDR records" } },
      "/batch-jobs": { get: { summary: "List batch jobs" }, post: { summary: "Create batch job" } },
      "/batch-jobs/{job_id}/run": { post: { summary: "Approve and execute a phase-1 batch job" } },
      "/invoices/{invoice_id}/send": { post: { summary: "Queue invoice email delivery" } },
      "/api-clients": { get: { summary: "List API clients" }, post: { summary: "Create API client and return one-time secret" } },
      "/webhook-subscriptions": { get: { summary: "List webhook subscriptions" }, post: { summary: "Create webhook subscription" } },
    },
  }));

  router.add("GET", "/api/v1/dashboard/overview", ({ services: scoped }) => scoped.analytics.overview());
  router.add("GET", "/api/v1/accounts", ({ services: scoped }) => scoped.accounts.list());
  router.add("GET", "/api/v1/accounts/tree", ({ services: scoped }) => scoped.accounts.tree());
  router.add("POST", "/api/v1/accounts", ({ services: scoped, body, auth, correlationId }) => scoped.accounts.create(body, auth, correlationId));
  router.add("GET", "/api/v1/accounts/:accountId", ({ services: scoped, params, auth }) => scoped.accounts.get(params.accountId, auth));
  router.add("POST", "/api/v1/accounts/:accountId/:action", ({ services: scoped, params, correlationId }) => {
    return scoped.accounts.transition(params.accountId, params.action, correlationId);
  });
  router.add("GET", "/api/v1/users", ({ services: scoped }) => scoped.identity.users());
  router.add("POST", "/api/v1/users", ({ services: scoped, body, auth, correlationId }) => scoped.identity.createUser(body, auth, correlationId));
  router.add("GET", "/api/v1/users/:userId", ({ services: scoped, params }) => scoped.identity.getUser(params.userId));
  router.add("POST", "/api/v1/users/:userId/deactivate", ({ services: scoped, params, correlationId }) => scoped.identity.deactivateUser(params.userId, correlationId));
  router.add("GET", "/api/v1/roles", ({ services: scoped }) => scoped.identity.roles());
  router.add("GET", "/api/v1/permissions", ({ services: scoped }) => scoped.identity.permissions());
  router.add("GET", "/api/v1/sims", ({ services: scoped }) => scoped.sims.list());
  router.add("GET", "/api/v1/sim-operations", ({ services: scoped }) => scoped.sims.operations());
  router.add("GET", "/api/v1/sim-operations/:operationId", ({ services: scoped, params }) => scoped.sims.operation(params.operationId));
  router.add("POST", "/api/v1/sims/operation-preview", ({ services: scoped, body }) => scoped.sims.preview(body.operation_type || body.operationType, body.sim_ids || body.simIds || []));
  router.add("POST", "/api/v1/sims/:simId/:action", ({ services: scoped, params, req, correlationId }) => {
    return scoped.sims.operate(params.action, params.simId, req.headers["idempotency-key"], correlationId);
  });
  router.add("GET", "/api/v1/esim-profiles", ({ services: scoped }) => scoped.catalog.esimProfiles());
  router.add("GET", "/api/v1/esim-operations", ({ services: scoped }) => scoped.catalog.esimOperations());
  router.add("POST", "/api/v1/esim-profiles/:profileId/:action", ({ services: scoped, params, body, correlationId }) => {
    return scoped.catalog.operateEsim(params.profileId, params.action, body, correlationId);
  });
  router.add("GET", "/api/v1/packages", ({ services: scoped }) => scoped.catalog.packages());
  router.add("POST", "/api/v1/packages", ({ services: scoped, body, auth, correlationId }) => scoped.catalog.createPackage(body, auth, correlationId));
  router.add("GET", "/api/v1/packages/:packageId", ({ services: scoped, params }) => scoped.catalog.getPackage(params.packageId));
  router.add("POST", "/api/v1/packages/:packageId/:action", ({ services: scoped, params, correlationId }) => {
    return scoped.catalog.transitionPackage(params.packageId, params.action, correlationId);
  });
  router.add("GET", "/api/v1/package-entitlements", ({ services: scoped }) => scoped.catalog.packageEntitlements());
  router.add("GET", "/api/v1/subscriptions", ({ services: scoped }) => scoped.catalog.subscriptions());
  router.add("GET", "/api/v1/usage-pools", ({ services: scoped }) => scoped.catalog.usagePools());
  router.add("POST", "/api/v1/usage-pools", ({ services: scoped, body, auth, correlationId }) => scoped.catalog.createUsagePool(body, auth, correlationId));
  router.add("GET", "/api/v1/usage/summary", ({ services: scoped }) => scoped.usage.summary());
  router.add("GET", "/api/v1/cdrs", ({ services: scoped }) => scoped.usage.cdrs());
  router.add("POST", "/api/v1/cdrs/import", ({ services: scoped, body, auth, correlationId }) => scoped.usage.importCdrs(body, auth, correlationId));
  router.add("GET", "/api/v1/suppliers", ({ services: scoped }) => scoped.catalog.suppliers());
  router.add("GET", "/api/v1/suppliers/:supplierId", ({ services: scoped, params }) => scoped.catalog.getSupplier(params.supplierId));
  router.add("POST", "/api/v1/suppliers/:supplierId/sync-products", ({ services: scoped, params, auth, correlationId }) => scoped.catalog.syncSupplier(params.supplierId, auth, correlationId));
  router.add("GET", "/api/v1/invoices", ({ services: scoped }) => scoped.billing.invoices());
  router.add("POST", "/api/v1/invoice-runs", ({ services: scoped }) => scoped.billing.runPreview());
  router.add("POST", "/api/v1/invoices/:invoiceId/send", ({ services: scoped, params, auth, correlationId }) => scoped.billing.sendInvoice(params.invoiceId, auth, correlationId));
  router.add("GET", "/api/v1/batch-jobs", ({ services: scoped }) => scoped.operations.batchJobs());
  router.add("POST", "/api/v1/batch-jobs", ({ services: scoped, body, auth, correlationId }) => scoped.operations.createBatchJob(body, auth, correlationId));
  router.add("POST", "/api/v1/batch-jobs/:jobId/run", ({ services: scoped, params, auth, correlationId }) => scoped.operations.runBatchJob(params.jobId, auth, correlationId));
  router.add("GET", "/api/v1/approval-requests", ({ services: scoped }) => scoped.operations.approvalRequests());
  router.add("POST", "/api/v1/approval-requests/:approvalId/:decision", ({ services: scoped, params, body, correlationId }) => {
    return scoped.operations.decideApproval(params.approvalId, params.decision, body.comment, correlationId);
  });
  router.add("GET", "/api/v1/api-clients", ({ services: scoped }) => scoped.integration.apiClients());
  router.add("POST", "/api/v1/api-clients", ({ services: scoped, body, auth, correlationId }) => scoped.integration.createApiClient(body, auth, correlationId));
  router.add("POST", "/api/v1/api-clients/:clientId/rotate", ({ services: scoped, params, auth, correlationId }) => scoped.integration.rotateApiClient(params.clientId, auth, correlationId));
  router.add("POST", "/api/v1/api-clients/:clientId/suspend", ({ services: scoped, params, auth, correlationId }) => scoped.integration.suspendApiClient(params.clientId, auth, correlationId));
  router.add("GET", "/api/v1/webhook-subscriptions", ({ services: scoped }) => scoped.integration.webhookSubscriptions());
  router.add("POST", "/api/v1/webhook-subscriptions", ({ services: scoped, body, auth, correlationId }) => scoped.integration.createWebhookSubscription(body, auth, correlationId));
  router.add("POST", "/api/v1/webhook-subscriptions/:subscriptionId/test", ({ services: scoped, params, auth, correlationId }) => scoped.integration.testWebhook(params.subscriptionId, auth, correlationId));
  router.add("POST", "/api/v1/webhook-subscriptions/:subscriptionId/delete", ({ services: scoped, params, auth, correlationId }) => scoped.integration.deleteWebhookSubscription(params.subscriptionId, auth, correlationId));
  router.add("GET", "/api/v1/notification-deliveries", ({ services: scoped }) => scoped.integration.notificationDeliveries());
  router.add("GET", "/api/v1/settings", ({ services: scoped }) => scoped.operations.settings());
  router.add("POST", "/api/v1/settings", ({ services: scoped, body, auth, correlationId }) => scoped.operations.updateSettings(body, auth, correlationId));
  router.add("GET", "/api/v1/audit-logs", ({ services: scoped }) => scoped.operations.auditLogs());
  router.add("POST", "/api/v1/audit-logs/export", ({ services: scoped, body, auth, correlationId }) => scoped.operations.exportAuditLogs(body, auth, correlationId));
  router.add("GET", "/api/v1/outbox-events", ({ services: scoped }) => scoped.operations.outbox());

  return router;
}

module.exports = { registerRoutes };
