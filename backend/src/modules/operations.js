function createOperationsService(store, eventBus) {
  function createItems(jobId, items) {
    return items.map((item, index) =>
      store.insert("batchJobItems", {
        id: `${jobId}_item_${index + 1}`,
        jobId,
        rowNumber: index + 1,
        status: "validated",
        payload: item,
        result: null,
        createdAt: new Date().toISOString(),
      }),
    );
  }

  return {
    batchJobs() {
      return store.list("batchJobs").map((job) => ({
        ...job,
        items: store.list("batchJobItems").filter((item) => item.jobId === job.id),
      }));
    },
    createBatchJob(body, auth, correlationId) {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!body.jobType || !items.length) {
        const error = new Error("jobType and items are required");
        error.statusCode = 400;
        error.code = "VALIDATION_BATCH_JOB_REQUIRED";
        throw error;
      }
      const job = store.insert("batchJobs", {
        id: `job_${Date.now()}`,
        jobType: body.jobType,
        status: body.requiresApproval === false ? "validated" : "waiting_approval",
        totalCount: items.length,
        successCount: 0,
        failedCount: 0,
        createdBy: auth.userId,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      createItems(job.id, items);
      eventBus.publish("batch_job.created", "batch_job", job.id, { jobType: job.jobType, totalCount: job.totalCount }, correlationId);
      return job;
    },
    runBatchJob(jobId, auth, correlationId) {
      const job = store.find("batchJobs", jobId);
      if (!job) {
        const error = new Error("Batch job not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      if (!["validated", "waiting_approval"].includes(job.status)) {
        const error = new Error(`Batch job cannot run from ${job.status}`);
        error.statusCode = 409;
        error.code = "RESOURCE_INVALID_STATE";
        throw error;
      }
      const items = store.list("batchJobItems").filter((item) => item.jobId === jobId);
      items.forEach((item) => {
        item.status = "succeeded";
        item.result = { message: `${job.jobType} accepted for ${item.payload.iccid || item.payload.id || item.rowNumber}` };
        item.completedAt = new Date().toISOString();
      });
      const updated = store.update("batchJobs", jobId, {
        status: "completed",
        successCount: items.length,
        failedCount: 0,
        approvedBy: auth.userId,
        completedAt: new Date().toISOString(),
      });
      eventBus.publish("batch_job.completed", "batch_job", jobId, { jobType: job.jobType, successCount: items.length }, correlationId);
      return updated;
    },
    approvalRequests() {
      return store.list("approvalRequests");
    },
    decideApproval(approvalId, decision, comment, correlationId) {
      const status = decision === "approve" ? "approved" : "rejected";
      const approval = store.update("approvalRequests", approvalId, {
        status,
        decisionComment: comment || "",
        decidedAt: new Date().toISOString(),
      });
      if (!approval) {
        const error = new Error("Approval request not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      store.insert("auditLogs", {
        id: `audit_approval_${Date.now()}`,
        actorType: "system",
        actorId: "approval-service",
        action: `approval.${status}`,
        resourceType: "approval_request",
        resourceId: approvalId,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return approval;
    },
    auditLogs() {
      return store.list("auditLogs");
    },
    outbox() {
      return store.list("outboxEvents");
    },
    settings() {
      return {
        security: { mfaRequiredForAdmins: true, productionHttpsRequired: true, tokenMasking: true },
        sla: { apiAvailability: "99.9%", cdrDelayMinutes: 30, webhookSuccessRate: "99%" },
        retention: { cdrDays: 730, auditDays: 1095 },
      };
    },
  };
}

module.exports = { createOperationsService };
