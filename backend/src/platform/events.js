const { randomUUID } = require("node:crypto");

function createEventBus(store) {
  const listeners = new Map();

  function publish(eventType, aggregateType, aggregateId, payload, correlationId) {
    const event = {
      id: randomUUID(),
      eventType,
      aggregateType,
      aggregateId,
      payload,
      correlationId,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    store.insert("outboxEvents", event);
    setTimeout(() => {
      event.status = "published";
      event.publishedAt = new Date().toISOString();
      (listeners.get(eventType) || []).forEach((handler) => handler(event));
    }, 10);
    return event;
  }

  function subscribe(eventType, handler) {
    const current = listeners.get(eventType) || [];
    listeners.set(eventType, [...current, handler]);
  }

  return { publish, subscribe };
}

module.exports = { createEventBus };
