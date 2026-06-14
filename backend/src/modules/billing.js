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
    sendInvoice(invoiceId, auth, correlationId) {
      const invoice = store.update("invoices", invoiceId, {
        status: "sent",
        sentAt: new Date().toISOString(),
        lastEmailStatus: "queued",
      });
      if (!invoice) {
        const error = new Error("Invoice not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      store.insert("auditLogs", {
        id: `audit_invoice_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "invoice.send_queued",
        resourceType: "invoice",
        resourceId: invoiceId,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return {
        invoice,
        delivery: {
          channel: "email",
          status: "queued",
          message: "Invoice email has been queued by the phase-1 notification adapter.",
        },
      };
    },
  };
}

module.exports = { createBillingService };
