const { bytesToGb, moneyCny } = require("./shared");

function createAnalyticsService(store) {
  return {
    overview() {
      const sims = store.list("sims");
      const profiles = store.list("esimProfiles");
      const invoices = store.list("invoices");
      const failedSims = sims.filter((sim) => sim.serviceStatus === "failed").length;
      const totalBytes = sims.reduce((sum, sim) => sum + (sim.usageMonthBytes || 0), 0);
      const totalRevenue = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
      return {
        kpis: {
          activeSims: sims.filter((sim) => sim.serviceStatus === "active").length,
          esimProfiles: profiles.length,
          monthUsageGb: bytesToGb(totalBytes),
          revenue: moneyCny(totalRevenue),
          failedOperations: failedSims,
        },
        trend: [42, 56, 49, 64, 70, 58, 78, 72, 82, 75, 88, 84, 92, 87],
        supplierHealth: store.list("suppliers"),
        operationQueue: store.list("batchJobs").map((job) => ({
          id: job.id,
          title: job.jobType,
          status: job.status,
          totalCount: job.totalCount,
        })),
      };
    },
  };
}

module.exports = { createAnalyticsService };
