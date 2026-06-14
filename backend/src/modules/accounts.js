function createAccountsService(store) {
  const transitions = {
    "submit-review": { from: ["draft"], to: "pending_review", action: "account.submit_review" },
    approve: { from: ["pending_review"], to: "active", action: "account.approved" },
    suspend: { from: ["active"], to: "suspended", action: "account.suspended" },
    resume: { from: ["suspended"], to: "active", action: "account.resumed" },
    close: { from: ["active", "suspended"], to: "closed", action: "account.closed" },
  };

  function inheritedRestriction(account) {
    let parentId = account.parentAccountId;
    while (parentId) {
      const parent = store.find("accounts", parentId);
      if (!parent) return null;
      if (parent.accountStatus === "suspended" || parent.riskStatus !== "normal") {
        return {
          inheritedFrom: parent.accountName,
          accountStatus: parent.accountStatus,
          riskStatus: parent.riskStatus,
        };
      }
      parentId = parent.parentAccountId;
    }
    return null;
  }

  function enrich(account) {
    const users = store
      .list("userAccounts")
      .filter((item) => item.accountId === account.id && item.status !== "inactive")
      .map((item) => {
        const user = store.find("users", item.userId);
        return user
          ? {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              status: user.status,
              scopeType: item.scopeType,
            }
          : null;
      })
      .filter(Boolean);
    return {
      ...account,
      childCount: store.list("accounts").filter((item) => item.parentAccountId === account.id).length,
      inheritedRestriction: inheritedRestriction(account),
      users,
    };
  }

  function normalizeCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function pathSegment(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function isDescendantOrSelf(accountId, ancestorId) {
    if (!accountId || !ancestorId) return false;
    if (accountId === ancestorId) return true;
    let current = store.find("accounts", accountId);
    while (current?.parentAccountId) {
      if (current.parentAccountId === ancestorId) return true;
      current = store.find("accounts", current.parentAccountId);
    }
    return false;
  }

  function ensureAccountInScope(accountId, auth) {
    const rootAccountId = auth.accountId || "acc_root";
    if (auth.permissions?.has("*") && rootAccountId === "acc_root") return;
    if (!isDescendantOrSelf(accountId, rootAccountId)) {
      const error = new Error("Target account is outside current account scope");
      error.statusCode = 403;
      error.code = "ACCOUNT_SCOPE_DENIED";
      throw error;
    }
  }

  return {
    list() {
      return store.list("accounts").map(enrich);
    },
    get(accountId, auth) {
      if (auth) ensureAccountInScope(accountId, auth);
      const account = store.find("accounts", accountId);
      if (!account) {
        const error = new Error("Account not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      const children = store.list("accounts").filter((item) => item.parentAccountId === accountId).map(enrich);
      const sims = store.list("sims").filter((sim) => sim.accountId === accountId);
      const entitlements = store.list("packageEntitlements").filter((item) => item.accountId === accountId);
      return { ...enrich(account), children, sims, entitlements };
    },
    create(body, auth, correlationId) {
      const accountName = String(body.accountName || "").trim();
      const accountType = String(body.accountType || "customer").trim();
      const parentAccountId = body.parentAccountId || auth.accountId || "acc_root";
      const parent = store.find("accounts", parentAccountId);
      if (!accountName || !["reseller", "customer"].includes(accountType)) {
        const error = new Error("accountName and a valid accountType are required");
        error.statusCode = 400;
        error.code = "VALIDATION_ACCOUNT_REQUIRED";
        throw error;
      }
      if (!parent) {
        const error = new Error("Parent account not found");
        error.statusCode = 404;
        error.code = "PARENT_ACCOUNT_NOT_FOUND";
        throw error;
      }
      if (parent.accountStatus !== "active") {
        const error = new Error("Child accounts can only be created under an active parent account");
        error.statusCode = 409;
        error.code = "PARENT_ACCOUNT_RESTRICTED";
        throw error;
      }
      ensureAccountInScope(parentAccountId, auth);
      if (!["platform", "reseller"].includes(parent.accountType)) {
        const error = new Error("Only platform or reseller accounts can create child accounts");
        error.statusCode = 409;
        error.code = "PARENT_ACCOUNT_NOT_RESELLER";
        throw error;
      }
      const accountCode = normalizeCode(body.accountCode || accountName);
      if (store.list("accounts").some((item) => item.accountCode === accountCode)) {
        const error = new Error("Account code already exists");
        error.statusCode = 409;
        error.code = "ACCOUNT_CODE_EXISTS";
        throw error;
      }
      const account = store.insert("accounts", {
        id: `acc_${Date.now()}`,
        parentAccountId,
        accountCode,
        accountName,
        accountType,
        accountStatus: body.autoActivate === true ? "active" : "draft",
        riskStatus: "normal",
        billingStatus: "current",
        currency: body.currency || parent.currency || "CNY",
        timezone: body.timezone || parent.timezone || "Asia/Shanghai",
        companyName: String(body.companyName || accountName).trim(),
        taxId: String(body.taxId || "").trim(),
        contactName: String(body.contactName || "").trim(),
        contactEmail: String(body.contactEmail || "").trim().toLowerCase(),
        companyAddress: String(body.companyAddress || "").trim(),
        path: `${parent.path || ""}/${pathSegment(accountCode)}`,
        createdAt: new Date().toISOString(),
      });
      store.insert("auditLogs", {
        id: `audit_account_create_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "account.created",
        resourceType: "account",
        resourceId: account.id,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return enrich(account);
    },
    tree() {
      const accounts = this.list();
      return accounts.map((account) => ({
        id: account.id,
        accountName: account.accountName,
        accountType: account.accountType,
        accountStatus: account.accountStatus,
        riskStatus: account.riskStatus,
        billingStatus: account.billingStatus,
        parentAccountId: account.parentAccountId,
        childCount: account.childCount,
        inheritedRestriction: account.inheritedRestriction,
      }));
    },
    transition(accountId, action, correlationId) {
      const account = store.find("accounts", accountId);
      if (!account) {
        const error = new Error("Account not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      const transition = transitions[action];
      if (!transition || !transition.from.includes(account.accountStatus)) {
        const error = new Error(`Account cannot ${action} from ${account.accountStatus}`);
        error.statusCode = 409;
        error.code = "RESOURCE_INVALID_STATE";
        throw error;
      }
      if (action === "close") {
        const activeSims = store.list("sims").filter((sim) => sim.accountId === accountId && ["active", "suspended"].includes(sim.serviceStatus));
        if (activeSims.length) {
          const error = new Error("Close is blocked while active or suspended SIMs exist");
          error.statusCode = 409;
          error.code = "ACCOUNT_CLOSE_BLOCKED";
          throw error;
        }
      }
      const updated = store.update("accounts", accountId, { accountStatus: transition.to });
      store.insert("auditLogs", {
        id: `audit_account_${Date.now()}`,
        actorType: "system",
        actorId: "account-service",
        action: transition.action,
        resourceType: "account",
        resourceId: accountId,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return enrich(updated);
    },
  };
}

module.exports = { createAccountsService };
