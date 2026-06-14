const fs = require("node:fs");
const path = require("node:path");

const seedPath = path.join(__dirname, "..", "..", "data", "seed.json");

function loadSeed() {
  return JSON.parse(fs.readFileSync(seedPath, "utf8"));
}

function createStore() {
  const state = loadSeed();

  return {
    state,
    list(collection) {
      return state[collection] || [];
    },
    find(collection, id) {
      return this.list(collection).find((item) => item.id === id);
    },
    findBy(collection, key, value) {
      return this.list(collection).find((item) => item[key] === value);
    },
    update(collection, id, patch) {
      const items = this.list(collection);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return null;
      items[index] = { ...items[index], ...patch, updatedAt: new Date().toISOString() };
      return items[index];
    },
    insert(collection, item) {
      if (!state[collection]) state[collection] = [];
      state[collection].push(item);
      return item;
    },
  };
}

module.exports = { createStore };
