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
    return {
      ...account,
      childCount: store.list("accounts").filter((item) => item.parentAccountId === account.id).length,
      inheritedRestriction: inheritedRestriction(account),
    };
  }

  return {
    list() {
      return store.list("accounts").map(enrich);
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
