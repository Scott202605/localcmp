const { randomUUID } = require("node:crypto");
const { bytesToGb } = require("./shared");

function createCatalogService(store, eventBus) {
  const packageTransitions = {
    "submit-review": { from: ["draft"], to: "pending_review" },
    publish: { from: ["pending_review"], to: "active" },
    deprecate: { from: ["active"], to: "deprecated" },
    restore: { from: ["deprecated"], to: "active" },
    retire: { from: ["active", "deprecated"], to: "retired" },
    archive: { from: ["retired"], to: "archived" },
  };

  function packageUsage(packageId) {
    return store.list("subscriptions").filter((sub) => sub.packageId === packageId);
  }

  return {
    packages() {
      return store.list("packages").map((pkg) => ({
        ...pkg,
        quotaGb: bytesToGb(pkg.quotaBytes || 0),
        subscriptionCount: packageUsage(pkg.id).length,
        entitlementCount: store.list("packageEntitlements").filter((item) => item.packageId === pkg.id && item.status === "active").length,
      }));
    },
    packageEntitlements() {
      return store.list("packageEntitlements").map((item) => ({
        ...item,
        accountName: store.find("accounts", item.accountId)?.accountName || "-",
        packageName: store.find("packages", item.packageId)?.name || "-",
      }));
    },
    subscriptions() {
      return store.list("subscriptions").map((item) => ({
        ...item,
        accountName: store.find("accounts", item.accountId)?.accountName || "-",
        simIccid: store.find("sims", item.simId)?.iccid || "-",
        packageName: store.find("packages", item.packageId)?.name || "-",
      }));
    },
    usagePools() {
      return store.list("usagePools").map((item) => ({
        ...item,
        accountName: store.find("accounts", item.accountId)?.accountName || "-",
        packageName: store.find("packages", item.packageId)?.name || "-",
        usedPercent: item.quotaBytes ? Number(((item.usedBytes / item.quotaBytes) * 100).toFixed(1)) : 0,
      }));
    },
    transitionPackage(packageId, action, correlationId) {
      const pkg = store.find("packages", packageId);
      if (!pkg) {
        const error = new Error("Package not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      const transition = packageTransitions[action];
      if (!transition || !transition.from.includes(pkg.packageStatus)) {
        const error = new Error(`Package cannot ${action} from ${pkg.packageStatus}`);
        error.statusCode = 409;
        error.code = "RESOURCE_INVALID_STATE";
        throw error;
      }
      if (action === "retire" && packageUsage(packageId).some((sub) => sub.status === "active")) {
        store.insert("approvalRequests", {
          id: `approval_pkg_${Date.now()}`,
          requestType: "package_retire",
          status: "pending",
          requestedBy: "system",
          approverId: "user_scott",
          impactCount: packageUsage(packageId).length,
          riskSummary: `Retiring package ${pkg.name} affects active subscriptions.`,
          correlationId,
          createdAt: new Date().toISOString(),
        });
        return { approvalRequired: true, package: pkg };
      }
      const updated = store.update("packages", packageId, { packageStatus: transition.to });
      return { approvalRequired: false, package: updated };
    },
    esimProfiles() {
      return store.list("esimProfiles").map((profile) => ({
        ...profile,
        supplierName: store.find("suppliers", profile.supplierId)?.supplierName || "-",
        accountName: profile.accountId ? store.find("accounts", profile.accountId)?.accountName : "库存",
      }));
    },
    esimOperations() {
      return store.list("esimOperations").map((operation) => ({
        ...operation,
        profileIccid: store.find("esimProfiles", operation.profileId)?.iccid || "-",
      }));
    },
    operateEsim(profileId, action, body, correlationId) {
      const profile = store.find("esimProfiles", profileId);
      if (!profile) {
        const error = new Error("eSIM profile not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      const transitions = {
        allocate: { from: ["available"], to: "allocated" },
        enable: { from: ["allocated", "downloaded", "disabled", "enabled"], to: "enabled" },
        disable: { from: ["enabled"], to: "disabled" },
        release: { from: ["allocated", "disabled", "available"], to: "available" },
      };
      const transition = transitions[action];
      if (!transition || !transition.from.includes(profile.profileState)) {
        const error = new Error(`Profile ${profile.iccid} cannot ${action} from ${profile.profileState}`);
        error.statusCode = 409;
        error.code = "RESOURCE_INVALID_STATE";
        throw error;
      }
      const operation = store.insert("esimOperations", {
        id: randomUUID(),
        profileId: profile.id,
        operationType: action,
        operationStatus: "processing",
        correlationId,
        createdAt: new Date().toISOString(),
      });
      const patch = { profileState: transition.to, lastOperation: `${action} processing` };
      if (action === "allocate") {
        patch.accountId = body.accountId || profile.accountId || "acc_fleetlink";
        patch.eid = body.eid || profile.eid || "890490320000000000009999";
      }
      if (action === "release") {
        patch.accountId = null;
        patch.eid = null;
      }
      store.update("esimProfiles", profileId, patch);
      eventBus.publish("esim.operation.requested", "esim_profile", profileId, { action, operationId: operation.id }, correlationId);
      setTimeout(() => {
        operation.operationStatus = "succeeded";
        operation.completedAt = new Date().toISOString();
        store.update("esimProfiles", profileId, { profileState: transition.to, lastOperation: `${action} succeeded` });
        eventBus.publish("esim.operation.succeeded", "esim_profile", profileId, { action, operationId: operation.id }, correlationId);
      }, 250);
      return { operationId: operation.id, operationStatus: operation.operationStatus, accepted: true };
    },
    suppliers() {
      return store.list("suppliers");
    },
    apiClients() {
      return store.list("apiClients").map((client) => ({
        ...client,
        accountName: store.find("accounts", client.accountId)?.accountName || "-",
      }));
    },
  };
}

module.exports = { createCatalogService };
