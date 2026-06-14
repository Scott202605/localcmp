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
    getPackage(packageId) {
      const pkg = this.packages().find((item) => item.id === packageId);
      if (!pkg) {
        const error = new Error("Package not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      return {
        ...pkg,
        entitlements: this.packageEntitlements().filter((item) => item.packageId === packageId),
        subscriptions: this.subscriptions().filter((item) => item.packageId === packageId),
        usagePools: this.usagePools().filter((item) => item.packageId === packageId),
      };
    },
    createPackage(body, auth, correlationId) {
      const name = String(body.name || "").trim();
      const packageCode = String(body.packageCode || name)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const quotaGb = Number(body.quotaGb || 0);
      if (!name || !packageCode || quotaGb <= 0) {
        const error = new Error("name, packageCode and quotaGb are required");
        error.statusCode = 400;
        error.code = "VALIDATION_PACKAGE_REQUIRED";
        throw error;
      }
      if (store.list("packages").some((item) => item.packageCode === packageCode)) {
        const error = new Error("Package code already exists");
        error.statusCode = 409;
        error.code = "PACKAGE_CODE_EXISTS";
        throw error;
      }
      const pkg = store.insert("packages", {
        id: `pkg_${Date.now()}`,
        packageCode,
        name,
        packageType: body.packageType || "data",
        packageStatus: body.packageStatus || "draft",
        regionScope: body.regionScope || "Global",
        quotaBytes: Math.round(quotaGb * 1024 * 1024 * 1024),
        billingStartType: body.billingStartType || "calendar_month",
        poolEnabled: body.poolEnabled === true,
        authorizedAccounts: 0,
        createdAt: new Date().toISOString(),
      });
      store.insert("auditLogs", {
        id: `audit_package_create_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "package.created",
        resourceType: "package",
        resourceId: pkg.id,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return this.getPackage(pkg.id);
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
    createUsagePool(body, auth, correlationId) {
      const account = store.find("accounts", body.accountId);
      const pkg = store.find("packages", body.packageId);
      const quotaGb = Number(body.quotaGb || 0);
      if (!account || !pkg || quotaGb <= 0) {
        const error = new Error("Valid accountId, packageId and quotaGb are required");
        error.statusCode = 400;
        error.code = "VALIDATION_USAGE_POOL_REQUIRED";
        throw error;
      }
      const pool = store.insert("usagePools", {
        id: `pool_${Date.now()}`,
        accountId: account.id,
        packageId: pkg.id,
        name: String(body.name || `${account.accountName} ${pkg.name} Pool`),
        quotaBytes: Math.round(quotaGb * 1024 * 1024 * 1024),
        usedBytes: 0,
        cycleStartAt: body.cycleStartAt || new Date().toISOString(),
        cycleEndAt: body.cycleEndAt || null,
        resetPolicy: body.resetPolicy || "calendar_month",
        overagePolicy: body.overagePolicy || "throttle",
        createdAt: new Date().toISOString(),
      });
      store.insert("auditLogs", {
        id: `audit_pool_create_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "usage_pool.created",
        resourceType: "usage_pool",
        resourceId: pool.id,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return this.usagePools().find((item) => item.id === pool.id);
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
    getSupplier(supplierId) {
      const supplier = store.find("suppliers", supplierId);
      if (!supplier) {
        const error = new Error("Supplier not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      return {
        ...supplier,
        packages: store.list("packages").filter((pkg) => pkg.supplierId === supplierId),
        esimProfiles: store.list("esimProfiles").filter((profile) => profile.supplierId === supplierId),
        sims: store.list("sims").filter((sim) => sim.supplierId === supplierId),
      };
    },
    syncSupplier(supplierId, auth, correlationId) {
      const supplier = store.find("suppliers", supplierId);
      if (!supplier) {
        const error = new Error("Supplier not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      const now = new Date().toISOString();
      const updated = store.update("suppliers", supplierId, {
        status: supplier.status === "failed" ? "watch" : supplier.status,
        lastSyncAt: now,
        cdrDelayMinutes: Math.max(1, Number(supplier.cdrDelayMinutes || 30) - 1),
      });
      store.insert("auditLogs", {
        id: `audit_supplier_sync_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "supplier.sync_products",
        resourceType: "supplier",
        resourceId: supplierId,
        correlationId,
        createdAt: now,
      });
      eventBus.publish("supplier.sync_products", "supplier", supplierId, { supplierCode: supplier.supplierCode }, correlationId);
      return this.getSupplier(updated.id);
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
