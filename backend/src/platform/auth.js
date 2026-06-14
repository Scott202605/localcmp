const { createHmac, pbkdf2Sync, timingSafeEqual } = require("node:crypto");

const publicPaths = new Set(["/api/v1/health", "/api/v1/openapi", "/api/v1/auth/login"]);
const jwtSecret = process.env.JWT_SECRET || "localcmp-dev-jwt-secret-change-me";
const jwtTtlSeconds = Number(process.env.JWT_TTL_SECONDS || 8 * 60 * 60);

const routePermissions = [
  { method: "GET", pattern: /^\/api\/v1\/dashboard\//, permission: "dashboard.read" },
  { method: "GET", pattern: /^\/api\/v1\/accounts/, permission: "account.read" },
  { method: "POST", pattern: /^\/api\/v1\/accounts\//, permission: "account.manage" },
  { method: "GET", pattern: /^\/api\/v1\/users/, permission: "user.read" },
  { method: "POST", pattern: /^\/api\/v1\/users\//, permission: "user.manage" },
  { method: "GET", pattern: /^\/api\/v1\/roles|^\/api\/v1\/permissions/, permission: "permission.read" },
  { method: "GET", pattern: /^\/api\/v1\/sims/, permission: "sim.read" },
  { method: "GET", pattern: /^\/api\/v1\/sim-operations/, permission: "sim.read" },
  { method: "POST", pattern: /^\/api\/v1\/sims/, permission: "sim.operate" },
  { method: "GET", pattern: /^\/api\/v1\/esim-profiles|^\/api\/v1\/esim-operations/, permission: "sim.read" },
  { method: "POST", pattern: /^\/api\/v1\/esim-profiles/, permission: "sim.operate" },
  { method: "GET", pattern: /^\/api\/v1\/packages|^\/api\/v1\/subscriptions|^\/api\/v1\/usage-pools/, permission: "package.read" },
  { method: "POST", pattern: /^\/api\/v1\/packages|^\/api\/v1\/subscriptions|^\/api\/v1\/usage-pools/, permission: "package.manage" },
  { method: "GET", pattern: /^\/api\/v1\/suppliers/, permission: "integration.read" },
  { method: "POST", pattern: /^\/api\/v1\/suppliers/, permission: "integration.manage" },
  { method: "GET", pattern: /^\/api\/v1\/usage|^\/api\/v1\/cdrs/, permission: "usage.read" },
  { method: "POST", pattern: /^\/api\/v1\/cdrs/, permission: "usage.import" },
  { method: "GET", pattern: /^\/api\/v1\/invoices/, permission: "billing.read" },
  { method: "POST", pattern: /^\/api\/v1\/invoice|^\/api\/v1\/invoices/, permission: "billing.manage" },
  { method: "GET", pattern: /^\/api\/v1\/batch-jobs/, permission: "batch.read" },
  { method: "POST", pattern: /^\/api\/v1\/batch-jobs/, permission: "batch.manage" },
  { method: "GET", pattern: /^\/api\/v1\/approval-requests/, permission: "approval.read" },
  { method: "POST", pattern: /^\/api\/v1\/approval-requests/, permission: "approval.decide" },
  { method: "GET", pattern: /^\/api\/v1\/audit-logs/, permission: "audit.read" },
  { method: "POST", pattern: /^\/api\/v1\/audit-logs/, permission: "audit.read" },
  { method: "GET", pattern: /^\/api\/v1\/settings/, permission: "settings.read" },
  { method: "POST", pattern: /^\/api\/v1\/settings/, permission: "settings.read" },
  { method: "GET", pattern: /^\/api\/v1\/api-clients|^\/api\/v1\/webhook-subscriptions|^\/api\/v1\/notification-deliveries/, permission: "integration.read" },
  { method: "POST", pattern: /^\/api\/v1\/api-clients|^\/api\/v1\/webhook-subscriptions/, permission: "integration.manage" },
];

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(input) {
  return createHmac("sha256", jwtSecret).update(input).digest("base64url");
}

function issueJwt(payload) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const claims = { ...payload, iat: now, exp: now + jwtTtlSeconds };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaims = base64url(JSON.stringify(claims));
  const signature = sign(`${encodedHeader}.${encodedClaims}`);
  return `${encodedHeader}.${encodedClaims}.${signature}`;
}

function verifyJwt(token) {
  try {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const expected = sign(`${parts[0]}.${parts[1]}`);
    const provided = parts[2];
    if (expected.length !== provided.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) return null;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch (error) {
    return null;
  }
}

function verifyPassword(user, password) {
  if (!user?.passwordSalt || !user?.passwordHash || !password) return false;
  const hash = pbkdf2Sync(password, user.passwordSalt, 120000, 32, "sha256").toString("hex");
  return hash.length === user.passwordHash.length && timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash));
}

function tokenFromRequest(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
}

function isDescendantOrSelf(store, accountId, ancestorId) {
  if (!accountId || !ancestorId) return false;
  if (accountId === ancestorId) return true;
  let current = store.find("accounts", accountId);
  while (current?.parentAccountId) {
    if (current.parentAccountId === ancestorId) return true;
    current = store.find("accounts", current.parentAccountId);
  }
  return false;
}

function createAuthContext(store, req, url) {
  const claims = verifyJwt(tokenFromRequest(req));
  const headerUserId = process.env.ALLOW_HEADER_AUTH === "true" ? req.headers["x-user-id"] : null;
  const userId = claims?.sub || headerUserId;
  const headerAccountId = process.env.ALLOW_HEADER_AUTH === "true" ? req.headers["x-account-id"] : null;
  const rootAccountId = claims?.accountId || headerAccountId || "acc_root";
  const requestedScopeAccountId = req.headers["x-account-scope-id"];
  const accountId = requestedScopeAccountId && isDescendantOrSelf(store, requestedScopeAccountId, rootAccountId) ? requestedScopeAccountId : rootAccountId;
  const user = store.find("users", userId);
  const roleIds = store.list("userRoles").filter((item) => item.userId === userId).map((item) => item.roleId);
  const permissionIds = store.list("rolePermissions").filter((item) => roleIds.includes(item.roleId)).map((item) => item.permissionId);
  const permissions = store
    .list("permissions")
    .filter((permission) => permissionIds.includes(permission.id))
    .map((permission) => permission.permissionCode);
  return {
    userId,
    accountId,
    user,
    claims,
    permissions: new Set(permissions),
    isPublic: publicPaths.has(url.pathname),
  };
}

function requiredPermission(method, pathname) {
  const match = routePermissions.find((item) => item.method === method && item.pattern.test(pathname));
  return match?.permission || null;
}

function ensureAuthorized(auth, method, pathname) {
  if (auth.isPublic) return;
  if (!auth.user || auth.user.status !== "active") {
    const error = new Error("Active user context is required");
    error.statusCode = 401;
    error.code = "AUTH_USER_REQUIRED";
    throw error;
  }
  const permission = requiredPermission(method, pathname);
  if (permission && !auth.permissions.has(permission) && !auth.permissions.has("*")) {
    const error = new Error(`Permission ${permission} is required`);
    error.statusCode = 403;
    error.code = "PERM_DENIED";
    throw error;
  }
}

module.exports = { createAuthContext, ensureAuthorized, issueJwt, verifyPassword };
