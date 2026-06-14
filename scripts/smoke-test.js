const http = require("node:http");
const { spawn } = require("node:child_process");

const port = Number(process.env.SMOKE_PORT || 18080);
const baseUrl = `http://localhost:${port}/api/v1`;
let token = "";

function request(path, options = {}) {
  const body = options.body ? JSON.stringify(options.body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${path}`,
      {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-Correlation-Id": `smoke_${Date.now()}`,
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const payload = data ? JSON.parse(data) : {};
          if (res.statusCode < 200 || res.statusCode >= 300 || payload.error) {
            reject(new Error(`${path} failed: ${payload.error?.message || res.statusCode}`));
            return;
          }
          resolve(payload.data);
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      return await request("/health");
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Service did not become healthy");
}

async function main() {
  const child = spawn(process.execPath, ["backend/src/server.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });

  try {
    await waitForHealth();
    const login = await request("/auth/login", {
      method: "POST",
      body: { email: "13911657767@139.com", password: "LocalCMP@2026" },
    });
    token = login.token;
    await request("/auth/context");
    await request("/sims");
    const preview = await request("/sims/operation-preview", {
      method: "POST",
      body: { operation_type: "suspend", sim_ids: ["sim_1842"] },
    });
    if (typeof preview.eligibleCount !== "number") throw new Error("Invalid SIM preview response");
    const cdr = await request("/cdrs/import", {
      method: "POST",
      body: {
        records: [
          {
            supplierRecordId: `smoke-cdr-${Date.now()}`,
            supplierCode: "GLOBAL-ROAM",
            iccid: "8986041020250001842",
            country: "DE",
            operatorName: "Telefonica",
            totalBytes: 1048576,
            amount: 12,
            currency: "CNY",
            startTime: new Date().toISOString(),
          },
        ],
      },
    });
    if (cdr.normalizedCount !== 1) throw new Error("CDR smoke import failed");
    const job = await request("/batch-jobs", {
      method: "POST",
      body: { jobType: "sim_suspend", requiresApproval: false, items: [{ iccid: "8986041020250001842" }] },
    });
    await request(`/batch-jobs/${encodeURIComponent(job.id)}/run`, { method: "POST" });
    await request("/sim-operations");
    const esimOperation = await request("/esim-profiles/profile_1842/enable", { method: "POST" });
    if (!esimOperation.operationId) throw new Error("eSIM smoke operation failed");
    await request("/esim-operations");
    await request("/api-clients");
    console.log("LocalCMP smoke test passed");
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
