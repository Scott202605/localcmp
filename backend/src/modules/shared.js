function bytesToGb(bytes) {
  return Number((bytes / 1024 / 1024 / 1024).toFixed(2));
}

function moneyCny(cents) {
  return `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function accountName(store, accountId) {
  return store.find("accounts", accountId)?.accountName || "-";
}

function packageName(store, packageId) {
  return store.find("packages", packageId)?.name || "-";
}

function supplierName(store, supplierId) {
  return store.find("suppliers", supplierId)?.supplierName || "-";
}

module.exports = { bytesToGb, moneyCny, accountName, packageName, supplierName };
