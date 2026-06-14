const { createHash, randomBytes, randomUUID } = require("node:crypto");

function maskSecret(secret) {
  return `${secret.slice(0, 10)}...${secret.slice(-4)}`;
}

function hashSecret(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

function accountName(store, accountId) {
  return store.find("accounts", accountId)?.accountName || "-";
}

function createIntegrationService(store, eventBus) {
  function apiClients() {
    return store.list("apiClients").map((client) => ({
      ...client,
      accountName: accountName(store, client.accountId),
      clientSecretHash: undefined,
    }));
  }

  function webhookSubscriptions() {
    return store.list("webhookSubscriptions").map((subscription) => ({
      ...subscription,
      accountName: accountName(store, subscription.accountId),
      signingSecretHash: undefined,
    }));
  }

  return {
    apiClients,
    webhookSubscriptions,
    createApiClient(body, auth, correlationId) {
      if (!body.clientName || !body.accountId || !Array.isArray(body.scopes) || !body.scopes.length) {
        const error = new Error("clientName, accountId and scopes are required");
        error.statusCode = 400;
        error.code = "VALIDATION_API_CLIENT_REQUIRED";
        throw error;
      }
      if (!store.find("accounts", body.accountId)) {
        const error = new Error("Account not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      const secret = `cmp_sk_${randomBytes(24).toString("hex")}`;
      const client = store.insert("apiClients", {
        id: `client_${Date.now()}`,
        accountId: body.accountId,
        clientName: body.clientName,
        scopes: body.scopes,
        status: "active",
        secretPreview: maskSecret(secret),
        clientSecretHash: hashSecret(secret),
        createdBy: auth.userId,
        createdAt: new Date().toISOString(),
      });
      store.insert("auditLogs", {
        id: `audit_client_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "api_client.created",
        resourceType: "api_client",
        resourceId: client.id,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return { ...client, accountName: accountName(store, client.accountId), clientSecret: secret, clientSecretHash: undefined };
    },
    rotateApiClient(clientId, auth, correlationId) {
      const client = store.find("apiClients", clientId);
      if (!client) {
        const error = new Error("API client not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      const secret = `cmp_sk_${randomBytes(24).toString("hex")}`;
      const updated = store.update("apiClients", clientId, {
        secretPreview: maskSecret(secret),
        clientSecretHash: hashSecret(secret),
        rotatedAt: new Date().toISOString(),
      });
      store.insert("auditLogs", {
        id: `audit_client_rotate_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "api_client.rotated",
        resourceType: "api_client",
        resourceId: clientId,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return { ...updated, accountName: accountName(store, updated.accountId), clientSecret: secret, clientSecretHash: undefined };
    },
    suspendApiClient(clientId, auth, correlationId) {
      const updated = store.update("apiClients", clientId, { status: "suspended", suspendedAt: new Date().toISOString() });
      if (!updated) {
        const error = new Error("API client not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      store.insert("auditLogs", {
        id: `audit_client_suspend_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "api_client.suspended",
        resourceType: "api_client",
        resourceId: clientId,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return { ...updated, accountName: accountName(store, updated.accountId), clientSecretHash: undefined };
    },
    createWebhookSubscription(body, auth, correlationId) {
      if (!body.accountId || !body.targetUrl || !Array.isArray(body.eventTypes) || !body.eventTypes.length) {
        const error = new Error("accountId, targetUrl and eventTypes are required");
        error.statusCode = 400;
        error.code = "VALIDATION_WEBHOOK_REQUIRED";
        throw error;
      }
      const secret = `whsec_${randomBytes(20).toString("hex")}`;
      const subscription = store.insert("webhookSubscriptions", {
        id: `wh_${Date.now()}`,
        accountId: body.accountId,
        targetUrl: body.targetUrl,
        eventTypes: body.eventTypes,
        status: "active",
        signingSecretPreview: maskSecret(secret),
        signingSecretHash: hashSecret(secret),
        retryPolicy: body.retryPolicy || "exponential_24h",
        createdBy: auth.userId,
        createdAt: new Date().toISOString(),
      });
      store.insert("auditLogs", {
        id: `audit_webhook_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "webhook.created",
        resourceType: "webhook_subscription",
        resourceId: subscription.id,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return { ...subscription, accountName: accountName(store, subscription.accountId), signingSecret: secret, signingSecretHash: undefined };
    },
    testWebhook(subscriptionId, auth, correlationId) {
      const subscription = store.find("webhookSubscriptions", subscriptionId);
      if (!subscription) {
        const error = new Error("Webhook subscription not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      const delivery = store.insert("notificationDeliveries", {
        id: `delivery_${Date.now()}`,
        accountId: subscription.accountId,
        subscriptionId,
        eventId: randomUUID(),
        eventType: "webhook.test",
        targetUrl: subscription.targetUrl,
        status: "queued",
        attemptCount: 0,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      eventBus.publish("webhook.test_queued", "webhook_subscription", subscriptionId, { deliveryId: delivery.id }, correlationId);
      store.insert("auditLogs", {
        id: `audit_webhook_test_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "webhook.test_queued",
        resourceType: "webhook_subscription",
        resourceId: subscriptionId,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return delivery;
    },
    deleteWebhookSubscription(subscriptionId, auth, correlationId) {
      const updated = store.update("webhookSubscriptions", subscriptionId, { status: "deleted", deletedAt: new Date().toISOString() });
      if (!updated) {
        const error = new Error("Webhook subscription not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      store.insert("auditLogs", {
        id: `audit_webhook_delete_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "webhook.deleted",
        resourceType: "webhook_subscription",
        resourceId: subscriptionId,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return { ...updated, accountName: accountName(store, updated.accountId), signingSecretHash: undefined };
    },
    notificationDeliveries() {
      return store.list("notificationDeliveries");
    },
  };
}

module.exports = { createIntegrationService };
