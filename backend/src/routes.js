function registerRoutes(router, services) {
  router.add("GET", "/api/v1/health", () => ({
    status: "ok",
    architecture: "phase-1 modular-monolith",
    database: "PostgreSQL schema in database/schema.sql",
  }));

  router.add("GET", "/api/v1/dashboard/overview", ({ services: scoped }) => scoped.analytics.overview());
  router.add("GET", "/api/v1/accounts", ({ services: scoped }) => scoped.accounts.list());
  router.add("GET", "/api/v1/accounts/tree", ({ services: scoped }) => scoped.accounts.tree());
  router.add("GET", "/api/v1/sims", ({ services: scoped }) => scoped.sims.list());
  router.add("POST", "/api/v1/sims/operation-preview", ({ services: scoped, body }) => scoped.sims.preview(body.operation_type || body.operationType, body.sim_ids || body.simIds || []));
  router.add("POST", "/api/v1/sims/:simId/:action", ({ services: scoped, params, req, correlationId }) => {
    return scoped.sims.operate(params.action, params.simId, req.headers["idempotency-key"], correlationId);
  });
  router.add("GET", "/api/v1/esim-profiles", ({ services: scoped }) => scoped.catalog.esimProfiles());
  router.add("GET", "/api/v1/packages", ({ services: scoped }) => scoped.catalog.packages());
  router.add("GET", "/api/v1/usage/summary", ({ services: scoped }) => scoped.usage.summary());
  router.add("GET", "/api/v1/cdrs", ({ services: scoped }) => scoped.usage.cdrs());
  router.add("GET", "/api/v1/suppliers", ({ services: scoped }) => scoped.catalog.suppliers());
  router.add("GET", "/api/v1/invoices", ({ services: scoped }) => scoped.billing.invoices());
  router.add("POST", "/api/v1/invoice-runs", ({ services: scoped }) => scoped.billing.runPreview());
  router.add("GET", "/api/v1/batch-jobs", ({ services: scoped }) => scoped.operations.batchJobs());
  router.add("GET", "/api/v1/api-clients", ({ services: scoped }) => scoped.catalog.apiClients());
  router.add("GET", "/api/v1/settings", ({ services: scoped }) => scoped.operations.settings());
  router.add("GET", "/api/v1/audit-logs", ({ services: scoped }) => scoped.operations.auditLogs());
  router.add("GET", "/api/v1/outbox-events", ({ services: scoped }) => scoped.operations.outbox());

  return router;
}

module.exports = { registerRoutes };
