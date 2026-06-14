const { bytesToGb } = require("./shared");

function createCatalogService(store) {
  return {
    packages() {
      return store.list("packages").map((pkg) => ({
        ...pkg,
        quotaGb: bytesToGb(pkg.quotaBytes || 0),
      }));
    },
    esimProfiles() {
      return store.list("esimProfiles").map((profile) => ({
        ...profile,
        supplierName: store.find("suppliers", profile.supplierId)?.supplierName || "-",
        accountName: profile.accountId ? store.find("accounts", profile.accountId)?.accountName : "库存",
      }));
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
