const { moneyCny, accountName } = require("./shared");

function createBillingService(store) {
  return {
    invoices() {
      return store.list("invoices").map((invoice) => ({
        ...invoice,
        accountName: accountName(store, invoice.accountId),
        totalDisplay: moneyCny(invoice.totalAmount),
      }));
    },
    runPreview() {
      return {
        runId: `run_${Date.now()}`,
        status: "preview",
        invoiceCount: store.list("invoices").length,
        message: "Invoice run preview created. Approval is required before issue.",
      };
    },
  };
}

module.exports = { createBillingService };
