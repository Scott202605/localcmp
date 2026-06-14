const { pbkdf2Sync } = require("node:crypto");
const { issueJwt, verifyPassword } = require("../platform/auth");

function createIdentityService(store) {
  function isDescendantOrSelf(accountId, ancestorId) {
    if (!accountId || !ancestorId) return false;
    if (accountId === ancestorId) return true;
    let current = store.find("accounts", accountId);
    while (current?.parentAccountId) {
      if (current.parentAccountId === ancestorId) return true;
      current = store.find("accounts", current.parentAccountId);
    }
    return false;
  }

  function ensureAccountInScope(accountId, auth) {
    const rootAccountId = auth.accountId || "acc_root";
    if (auth.permissions?.has("*") && rootAccountId === "acc_root") return;
    if (!isDescendantOrSelf(accountId, rootAccountId)) {
      const error = new Error("Target account is outside current account scope");
      error.statusCode = 403;
      error.code = "ACCOUNT_SCOPE_DENIED";
      throw error;
    }
  }

  function permissionsForRole(roleId) {
    const permissionIds = store.list("rolePermissions").filter((item) => item.roleId === roleId).map((item) => item.permissionId);
    return store.list("permissions").filter((permission) => permissionIds.includes(permission.id));
  }

  return {
    users() {
      return store.list("users").map((user) => ({
        ...user,
        passwordHash: undefined,
        passwordSalt: undefined,
        accounts: store.list("userAccounts").filter((item) => item.userId === user.id),
        roles: store.list("userRoles").filter((item) => item.userId === user.id),
      }));
    },
    getUser(userId) {
      const user = this.users().find((item) => item.id === userId);
      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      return {
        ...user,
        accountDetails: user.accounts.map((item) => ({
          ...item,
          accountName: store.find("accounts", item.accountId)?.accountName || "-",
        })),
        roleDetails: user.roles.map((item) => ({
          ...item,
          roleName: store.find("roles", item.roleId)?.roleName || "-",
        })),
      };
    },
    createUser(body, auth, correlationId) {
      const email = String(body.email || "").trim().toLowerCase();
      const displayName = String(body.displayName || "").trim();
      const accountId = body.accountId || auth.accountId || "acc_root";
      const roleId = body.roleId || "role_viewer";
      if (!email || !displayName) {
        const error = new Error("email and displayName are required");
        error.statusCode = 400;
        error.code = "VALIDATION_USER_REQUIRED";
        throw error;
      }
      if (store.list("users").some((item) => item.email.toLowerCase() === email)) {
        const error = new Error("Email already exists");
        error.statusCode = 409;
        error.code = "USER_EMAIL_EXISTS";
        throw error;
      }
      if (!store.find("accounts", accountId) || !store.find("roles", roleId)) {
        const error = new Error("Valid accountId and roleId are required");
        error.statusCode = 400;
        error.code = "VALIDATION_USER_ASSIGNMENT";
        throw error;
      }
      ensureAccountInScope(accountId, auth);
      const password = String(body.initialPassword || `LocalCMP@${new Date().getFullYear()}`);
      const passwordSalt = `localcmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const user = store.insert("users", {
        id: `user_${Date.now()}`,
        email,
        phone: String(body.phone || ""),
        displayName,
        userType: "human_user",
        status: body.status || "active",
        passwordSalt,
        passwordHash: pbkdf2Sync(password, passwordSalt, 120000, 32, "sha256").toString("hex"),
        mfaEnabled: body.mfaEnabled !== false,
        createdAt: new Date().toISOString(),
      });
      store.insert("userAccounts", {
        id: `ua_${Date.now()}`,
        userId: user.id,
        accountId,
        scopeType: body.scopeType || "account",
        status: "active",
      });
      store.insert("userRoles", {
        id: `ur_${Date.now()}`,
        userId: user.id,
        roleId,
        accountId,
      });
      store.insert("auditLogs", {
        id: `audit_user_create_${Date.now()}`,
        actorType: "user",
        actorId: auth.userId,
        action: "user.created",
        resourceType: "user",
        resourceId: user.id,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return { ...this.getUser(user.id), initialPassword: password };
    },
    roles() {
      return store.list("roles").map((role) => ({
        ...role,
        permissions: permissionsForRole(role.id),
      }));
    },
    permissions() {
      return store.list("permissions");
    },
    login(body, correlationId) {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = store.list("users").find((item) => item.email.toLowerCase() === email);
      if (!user || user.status !== "active" || !verifyPassword(user, password)) {
        const error = new Error("Invalid email or password");
        error.statusCode = 401;
        error.code = "AUTH_INVALID_CREDENTIALS";
        throw error;
      }
      const account = store.list("userAccounts").find((item) => item.userId === user.id && item.status === "active");
      const token = issueJwt({ sub: user.id, email: user.email, accountId: account?.accountId || "acc_root" });
      store.update("users", user.id, { lastLoginAt: new Date().toISOString() });
      store.insert("auditLogs", {
        id: `audit_login_${Date.now()}`,
        actorType: "user",
        actorId: user.id,
        action: "auth.login",
        resourceType: "user",
        resourceId: user.id,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return {
        token,
        tokenType: "Bearer",
        expiresIn: Number(process.env.JWT_TTL_SECONDS || 8 * 60 * 60),
        user: { ...user, passwordHash: undefined, passwordSalt: undefined },
        accountId: account?.accountId || "acc_root",
      };
    },
    deactivateUser(userId, correlationId) {
      const user = store.update("users", userId, { status: "deactivated", deactivatedAt: new Date().toISOString() });
      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        error.code = "RESOURCE_NOT_FOUND";
        throw error;
      }
      store.insert("auditLogs", {
        id: `audit_user_${Date.now()}`,
        actorType: "system",
        actorId: "identity-service",
        action: "user.deactivated",
        resourceType: "user",
        resourceId: userId,
        correlationId,
        createdAt: new Date().toISOString(),
      });
      return user;
    },
  };
}

module.exports = { createIdentityService };
