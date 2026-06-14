const { bytesToGb, moneyCny } = require("./shared");

function createUsageService(store) {
  return {
    cdrs() {
      return store.list("usageCdrs").map((cdr) => ({
        ...cdr,
        totalGb: bytesToGb(cdr.totalBytes || 0),
        amountDisplay: moneyCny(cdr.amount || 0),
      }));
    },
    summary() {
      const sims = store.list("sims");
      const totalBytes = sims.reduce((sum, sim) => sum + (sim.usageMonthBytes || 0), 0);
      return {
        todayUsageGb: 3891,
        monthUsageTb: Number((totalBytes / 1024 / 1024 / 1024 / 1024).toFixed(2)),
        cdrDelayMinutes: 9,
        anomalyCount: 12,
        trend: [42, 56, 49, 64, 70, 58, 78, 72, 82, 75, 88, 84, 92, 87],
      };
    },
  };
}

module.exports = { createUsageService };
