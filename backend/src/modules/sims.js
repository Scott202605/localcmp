const { randomUUID, createHash } = require("node:crypto");
const { bytesToGb, accountName, packageName, supplierName } = require("./shared");

const transitions = {
  activate: { from: ["not_started", "failed"], pending: "pending_activation", to: "active", event: "sim.activated" },
  suspend: { from: ["active"], pending: "suspension_pending", to: "suspended", event: "sim.suspended" },
  resume: { from: ["suspended"], pending: "resume_pending", to: "active", event: "sim.resumed" },
  terminate: { from: ["active", "suspended", "failed"], pending: "termination_pending", to: "terminated", event: "sim.terminated" },
};

function createSimsService(store, eventBus) {
  function enrich(sim) {
    return {
      ...sim,
      accountName: accountName(store, sim.accountId),
      packageName: packageName(store, sim.packageId),
      supplierName: supplierName(store, sim.supplierId),
      usageMonthGb: bytesToGb(sim.usageMonthBytes || 0),
    };
  }

  function ensureOperationAllowed(sim, action) {
    const transition = transitions[action];
    if (!transition) {
      const error = new Error(`Unsupported SIM operation: ${action}`);
      error.statusCode = 400;
      error.code = "VALIDATION_UNSUPPORTED_OPERATION";
      throw error;
    }
    if (!transition.from.includes(sim.serviceStatus)) {
      const error = new Error(`SIM ${sim.iccid} cannot ${action} from ${sim.serviceStatus}`);
      error.statusCode = 409;
      error.code = "RESOURCE_INVALID_STATE";
      throw error;
    }
    if (!["assigned", "reserved"].includes(sim.inventoryStatus)) {
      const error = new Error(`SIM ${sim.iccid} inventory status ${sim.inventoryStatus} is not operable`);
      error.statusCode = 409;
      error.code = "RESOURCE_INVALID_INVENTORY_STATE";
      throw error;
    }
    const account = store.find("accounts", sim.accountId);
    if (!account || account.accountStatus !== "active" || account.billingStatus === "bad_debt" || ["credit_hold", "compliance_hold", "fraud_hold"].includes(account.riskStatus)) {
      const error = new Error(`Account ${account?.accountName || sim.accountId} is not eligible for this operation`);
      error.statusCode = 409;
      error.code = "ACCOUNT_RESTRICTED";
      throw error;
    }
    const hasPendingOperation = store
      .list("simOperations")
      .some((operation) => operation.simId === sim.id && ["accepted", "validating", "submitted", "processing"].includes(operation.operationStatus));
    if (hasPendingOperation) {
      const error = new Error(`SIM ${sim.iccid} already has an operation in progress`);
      error.statusCode = 409;
      error.code = "SIM_OPERATION_IN_PROGRESS";
      throw error;
    }
    const pkg = store.find("packages", sim.packageId);
    const entitlement = store
      .list("packageEntitlements")
      .find((item) => item.accountId === sim.accountId && item.packageId === sim.packageId && item.status === "active");
    if (action === "activate" && (!pkg || pkg.packageStatus !== "active" || !entitlement)) {
      const error = new Error(`SIM ${sim.iccid} does not have an active package entitlement`);
      error.statusCode = 409;
      error.code = "PACKAGE_NOT_ENTITLED";
      throw error;
    }
  }

  return {
    list() {
      return store.list("sims").map(enrich);
    },
    operations() {
      return store.list("simOperations").map((operation) => ({
        ...operation,
        simIccid: store.find("sims", operation.simId)?.iccid || "-",
        accountName: accountName(store, operation.accountId),
      }));
    },
    operation(operationId) {
      const operation = this.operations().find((item) => item.id === operationId);
      if (!operation) {
        const error = new Error("SIM operation not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      return operation;
    },
    preview(action, simIds) {
      const targets = store.list("sims").filter((sim) => !simIds?.length || simIds.includes(sim.id) || simIds.includes(sim.iccid));
      const blocked = [];
      const eligible = [];
      targets.forEach((sim) => {
        try {
          ensureOperationAllowed(sim, action);
          eligible.push(enrich(sim));
        } catch (error) {
          blocked.push({ sim: enrich(sim), reason: error.message });
        }
      });
      return {
        action,
        eligibleCount: eligible.length,
        blockedCount: blocked.length,
        approvalRequired: action === "terminate" || eligible.length > 20,
        requiresTypedConfirmation: action === "terminate",
        billingImpact: action === "terminate" ? "Final rating and invoice adjustment will be triggered." : "Billing anchor will be preserved.",
        eligible,
        blocked,
      };
    },
    operate(action, simId, idempotencyKey, correlationId) {
      const sim = store.find("sims", simId) || store.findBy("sims", "iccid", simId);
      if (!sim) {
        const error = new Error("SIM not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      ensureOperationAllowed(sim, action);
      const transition = transitions[action];
      const operation = {
        id: randomUUID(),
        accountId: sim.accountId,
        simId: sim.id,
        operationType: action,
        operationStatus: "processing",
        idempotencyKey,
        requestPayloadHash: createHash("sha256").update(`${sim.id}:${action}:${idempotencyKey || ""}`).digest("hex"),
        correlationId,
        createdAt: new Date().toISOString(),
      };
      store.insert("simOperations", operation);
      store.update("sims", sim.id, { serviceStatus: transition.pending, lastOperation: `${action} processing` });
      eventBus.publish("sim.operation.requested", "sim", sim.id, { action, operationId: operation.id }, correlationId);

      setTimeout(() => {
        operation.operationStatus = "succeeded";
        operation.completedAt = new Date().toISOString();
        store.update("sims", sim.id, {
          serviceStatus: transition.to,
          serviceStatusReason: action === "suspend" ? "customer_request" : undefined,
          lastOperation: `${action} succeeded`,
        });
        eventBus.publish(transition.event, "sim", sim.id, { action, operationId: operation.id }, correlationId);
      }, 250);

      return { operationId: operation.id, operationStatus: operation.operationStatus, accepted: true };
    },
  };
}

module.exports = { createSimsService };
