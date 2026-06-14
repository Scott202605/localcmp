const { issueJwt, verifyPassword } = require("../platform/auth");

function createIdentityService(store) {
  function permissionsForRole(roleId) {
    const permissionIds = store.list("rolePermissions").filter((item) => item.roleId === roleId).map((item) => item.permissionId);
    return store.list("permissions").filter((permission) => permissionIds.includes(permission.id));
  }

  return {
    users() {
      return store.list("users").map((user) => ({
        ...user,
        accounts: store.list("userAccounts").filter((item) => item.userId === user.id),
        roles: store.list("userRoles").filter((item) => item.userId === user.id),
      }));
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
