function createAccountsService(store) {
  return {
    list() {
      return store.list("accounts").map((account) => ({
        ...account,
        childCount: store.list("accounts").filter((item) => item.parentAccountId === account.id).length,
      }));
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
      }));
    },
  };
}

module.exports = { createAccountsService };
