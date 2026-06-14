const { bytesToGb, moneyCny } = require("./shared");

function createUsageService(store) {
  function normalizeSupplierCdr(record, index) {
    const sim = store.findBy("sims", "iccid", record.iccid);
    if (!sim) {
      const error = new Error(`CDR row ${index + 1} references unknown ICCID ${record.iccid}`);
      error.statusCode = 422;
      error.code = "CDR_UNKNOWN_ICCID";
      throw error;
    }
    const totalBytes = Number(record.totalBytes ?? record.bytes ?? 0);
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
      const error = new Error(`CDR row ${index + 1} has invalid usage bytes`);
      error.statusCode = 422;
      error.code = "CDR_INVALID_BYTES";
      throw error;
    }
    return {
      id: `cdr_${Date.now()}_${index}`,
      supplierRecordId: record.supplierRecordId || record.recordId || `manual_${Date.now()}_${index}`,
      supplierCode: record.supplierCode || "manual",
      simId: sim.id,
      iccid: sim.iccid,
      country: record.country || "UN",
      operatorName: record.operatorName || record.operator || "Unknown",
      totalBytes,
      amount: Number(record.amount || 0),
      currency: record.currency || "CNY",
      startTime: record.startTime || new Date().toISOString(),
      normalizedAt: new Date().toISOString(),
      status: "normalized",
    };
  }

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
    importCdrs(body, auth, correlationId) {
      const records = Array.isArray(body.records) ? body.records : [];
      if (!records.length) {
        const error = new Error("records must contain at least one supplier CDR row");
        error.statusCode = 400;
        error.code = "VALIDATION_EMPTY_CDR_IMPORT";
        throw error;
      }
      const existing = new Set(store.list("usageCdrs").map((item) => item.supplierRecordId).filter(Boolean));
      const normalized = [];
      const duplicates = [];
      records.forEach((record, index) => {
        const row = normalizeSupplierCdr(record, index);
        if (existing.has(row.supplierRecordId)) {
          duplicates.push(row.supplierRecordId);
          return;
        }
        existing.add(row.supplierRecordId);
        store.insert("usageCdrs", row);
        normalized.push(row);
      });
      store.insert("auditLogs", {
        id: `audit_cdr_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "cdr.imported",
        resourceType: "usage_cdr",
        resourceId: normalized[0]?.id || "none",
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return {
        acceptedCount: records.length,
        normalizedCount: normalized.length,
        duplicateCount: duplicates.length,
        duplicates,
        cdrs: normalized.map((cdr) => ({ ...cdr, totalGb: bytesToGb(cdr.totalBytes), amountDisplay: moneyCny(cdr.amount) })),
      };
    },
  };
}

module.exports = { createUsageService };
