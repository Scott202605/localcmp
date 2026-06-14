const http = require("node:http");
const path = require("node:path");
const { createRouter, serveStatic } = require("./platform/http");
const { createStore } = require("./platform/store");
const { createEventBus } = require("./platform/events");
const { registerRoutes } = require("./routes");
const { createAccountsService } = require("./modules/accounts");
const { createSimsService } = require("./modules/sims");
const { createCatalogService } = require("./modules/catalog");
const { createUsageService } = require("./modules/usage");
const { createBillingService } = require("./modules/billing");
const { createOperationsService } = require("./modules/operations");
const { createAnalyticsService } = require("./modules/analytics");

const port = Number(process.env.PORT || 8080);
const publicDir = path.resolve(__dirname, "..", "..", "frontend");

const store = createStore();
const eventBus = createEventBus(store);
const services = {};

services.accounts = createAccountsService(store);
services.sims = createSimsService(store, eventBus);
services.catalog = createCatalogService(store);
services.usage = createUsageService(store);
services.billing = createBillingService(store);
services.operations = createOperationsService(store);
services.analytics = createAnalyticsService(store);

eventBus.subscribe("sim.operation.requested", (event) => {
  store.insert("auditLogs", {
    id: `audit_${event.id.slice(0, 8)}`,
    actorType: "system",
    actorId: "sim-inventory-service",
    action: event.eventType,
    resourceType: event.aggregateType,
    resourceId: event.aggregateId,
    correlationId: event.correlationId,
    createdAt: new Date().toISOString(),
  });
});

const router = registerRoutes(createRouter(), services);

const server = http.createServer(async (req, res) => {
  const handled = await router.handle(req, res, { services });
  if (handled) return;
  serveStatic(req, res, publicDir);
});

server.listen(port, () => {
  console.log(`LocalCMP backend running at http://localhost:${port}`);
  console.log(`Frontend served at http://localhost:${port}/`);
});
