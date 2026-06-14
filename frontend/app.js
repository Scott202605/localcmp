const navItems = [
  ["dashboard", "⌁", "Dashboard"],
  ["sims", "▦", "SIM 与设备"],
  ["esim", "◇", "eSIM Profiles"],
  ["packages", "▣", "套餐与流量池"],
  ["usage", "⌇", "用量与 CDR"],
  ["accounts", "◎", "账户与客户"],
  ["billing", "¥", "Billing"],
  ["batch", "⇄", "批量任务"],
  ["suppliers", "S", "资源方"],
  ["api", "{}", "API 与 Webhook"],
  ["settings", "⚙", "Settings"],
  ["audit", "A", "Audit Logs"],
];

const configuredApiBase = window.__LOCALCMP_CONFIG__?.API_BASE;
const API_BASE = configuredApiBase || (window.location.protocol === "file:" ? "http://localhost:8080/api/v1" : "/api/v1");

let sims = [
  ["8986041020250001842", "FleetLink CN", "Global 5GB Monthly", "active", "4.2 GB", "Resume succeeded"],
  ["8986041020250001916", "Reseller East / EVBox", "APAC Pool 500GB", "suspended", "312 MB", "Suspend by credit hold"],
  ["8986041020250002068", "MedTrack Europe", "EU 1GB Activation Day", "failed", "0 MB", "Activation failed"],
  ["8986041020250002197", "ColdChain Global", "Global Shared Pool", "active", "8.9 GB", "Package changed"],
];

let currentView = "dashboard";
let selectedSim = sims[0];
let selectedAccountId = null;
let selectedAccountDetailId = null;
let selectedUserId = null;
let selectedPackageId = null;
let selectedSupplierId = null;
let currentScopeAccountId = localStorage.getItem("localcmp_scope_account_id") || "acc_root";
let pendingAction = null;
let pendingSimId = null;
let isLoadingData = false;
let lastTaskResult = null;
let remoteData = {
  authContext: null,
  health: null,
  dashboard: null,
  accounts: [],
  packages: [],
  entitlements: [],
  subscriptions: [],
  usagePools: [],
  esimProfiles: [],
  esimOperations: [],
  cdrs: [],
  invoices: [],
  batchJobs: [],
  simOperations: [],
  suppliers: [],
  apiClients: [],
  webhookSubscriptions: [],
  notificationDeliveries: [],
  auditLogs: [],
  approvals: [],
  users: [],
  roles: [],
  settings: null,
};

const main = document.querySelector("#main");
const navList = document.querySelector("#navList");
const toastEl = document.querySelector("#toast");
const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const currentUserName = document.querySelector("#currentUserName");
const accountScopeSearch = document.querySelector("#accountScopeSearch");
const accountScopeOptions = document.querySelector("#accountScopeOptions");
const confirmDialog = document.querySelector("#confirmDialog");
const confirmMessage = document.querySelector("#confirmMessage");
const typedConfirmWrap = document.querySelector("#typedConfirmWrap");
const typedConfirm = document.querySelector("#typedConfirm");
const typedConfirmError = document.querySelector("#typedConfirmError");
const confirmAction = document.querySelector("#confirmAction");

const statusText = { active: "Active", suspended: "Suspended", failed: "Failed", pending: "Pending", retired: "Retired" };
const statusClass = (status) => (status === "active" ? "ok" : status === "failed" || status === "retired" ? "danger" : "watch");

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 2800);
}

function authToken() {
  return localStorage.getItem("localcmp_token") || "";
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}),
    "X-Correlation-Id": `web_${Date.now()}`,
    "X-Account-Scope-Id": currentScopeAccountId,
  };
}

function showLogin(message = "") {
  loginError.textContent = message;
  loginScreen.classList.remove("hidden");
}

function hideLogin() {
  loginScreen.classList.add("hidden");
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (response.status === 401) {
    localStorage.removeItem("localcmp_token");
    showLogin("登录已过期，请重新登录。");
    throw new Error("Unauthorized");
  }
  if (!response.ok) throw new Error(`API ${path} failed`);
  const payload = await response.json();
  return payload.data;
}

async function apiPost(path, body = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": "application/json",
      "Idempotency-Key": `idem_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    }),
    body: JSON.stringify(body),
  });
  if (response.status === 401) {
    localStorage.removeItem("localcmp_token");
    showLogin("登录已过期，请重新登录。");
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || "API request failed");
  }
  const payload = await response.json();
  return payload.data;
}

async function login(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Correlation-Id": `web_${Date.now()}` },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error?.message || "登录失败");
  localStorage.setItem("localcmp_token", payload.data.token);
  currentUserName.textContent = payload.data.user.displayName || payload.data.user.email;
  hideLogin();
  await loadBackendData();
  render();
}

function normalizeSim(sim) {
  return [
    sim.iccid,
    sim.accountName || sim.account || "-",
    sim.packageName || sim.package || "-",
    sim.serviceStatus || sim.status,
    `${sim.usageMonthGb ?? sim.usage ?? 0} GB`,
    sim.lastOperation || "-",
    sim.id,
  ];
}

async function loadBackendData() {
  try {
    isLoadingData = true;
    renderNav();
    const [
      health,
      authContext,
      dashboard,
      remoteSims,
      accounts,
      packages,
      entitlements,
      subscriptions,
      usagePools,
      esimProfiles,
      esimOperations,
      cdrs,
      invoices,
      batchJobs,
      suppliers,
      apiClients,
      webhookSubscriptions,
      notificationDeliveries,
      auditLogs,
      approvals,
      users,
      roles,
      settings,
    ] = await Promise.all([
      apiGet("/health"),
      apiGet("/auth/context"),
      apiGet("/dashboard/overview"),
      apiGet("/sims"),
      apiGet("/accounts"),
      apiGet("/packages"),
      apiGet("/package-entitlements"),
      apiGet("/subscriptions"),
      apiGet("/usage-pools"),
      apiGet("/esim-profiles"),
      apiGet("/esim-operations"),
      apiGet("/cdrs"),
      apiGet("/invoices"),
      apiGet("/batch-jobs"),
      apiGet("/suppliers"),
      apiGet("/api-clients"),
      apiGet("/webhook-subscriptions"),
      apiGet("/notification-deliveries"),
      apiGet("/audit-logs"),
      apiGet("/approval-requests"),
      apiGet("/users"),
      apiGet("/roles"),
      apiGet("/settings"),
    ]);
    const simOperations = await apiGet("/sim-operations");
    remoteData = { health, authContext, dashboard, accounts, packages, entitlements, subscriptions, usagePools, esimProfiles, esimOperations, cdrs, invoices, batchJobs, simOperations, suppliers, apiClients, webhookSubscriptions, notificationDeliveries, auditLogs, approvals, users, roles, settings };
    refreshAccountScopePicker();
    if (authContext?.user) currentUserName.textContent = authContext.user.displayName || authContext.user.email;
    sims = remoteSims.map(normalizeSim);
    selectedSim = sims.find((sim) => sim[0] === selectedSim?.[0]) || sims[0] || selectedSim;
  } catch (error) {
    showToast("后端未连接，当前使用前端样例数据。");
  } finally {
    isLoadingData = false;
  }
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function status(status) {
  return `<span class="status ${statusClass(status)}">${statusText[status] || esc(status)}</span>`;
}

function page(title, subtitle, actions = "") {
  return `
    <section class="page-heading" aria-labelledby="pageTitle">
      <div>
        <h1 id="pageTitle">${title}</h1>
        <p>${subtitle}</p>
      </div>
      <div class="heading-actions">${actions}</div>
    </section>
  `;
}

function systemBanner() {
  const user = remoteData.authContext?.user?.displayName || remoteData.authContext?.user?.email || "未登录";
  const permissionCount = remoteData.authContext?.permissions?.length || 0;
  const mode = remoteData.health?.persistence || "memory";
  return `
    <section class="system-banner" aria-label="系统状态">
      <span>${isLoadingData ? "同步中" : "已连接"}</span>
      <strong>${esc(user)}</strong>
      <small>权限 ${permissionCount} · 数据模式 ${esc(mode)}</small>
    </section>
  `;
}

function table(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  `;
}

function metric(label, value, note, tone = "") {
  return `<article class="metric-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function renderDashboard() {
  return `
    ${systemBanner()}
    ${page("连接运营 Dashboard", "统一查看 SIM/eSIM、用量、供应商健康、账单与批量任务状态。", `<button class="secondary-button" data-toast="报告导出任务已创建">导出报告</button><button class="primary-button" data-view-target="batch">新建批量任务</button>`)}
    <section class="kpi-grid" aria-label="关键指标">
      ${metric("活跃 SIM", "128,420", "较上月 +8.4%")}
      ${metric("eSIM Profiles", "42,618", "下载成功率 98.7%")}
      ${metric("本月流量", "86.2 TB", "池使用率 74%")}
      ${metric("账单收入", "¥ 3.86M", "毛利率 31.5%")}
      ${metric("失败操作", "37", "需运营处理", "warning")}
    </section>
    <section class="dashboard-grid">
      <article class="panel usage-panel">
        <div class="panel-header"><div><h2>流量使用趋势</h2><p>按日聚合，最近 14 天</p></div><div class="segmented"><button class="active">14D</button><button>30D</button><button>90D</button></div></div>
        <div class="chart" aria-label="流量趋势柱状图">${[42,56,49,64,70,58,78,72,82,75,88,84,92,87].map((n) => `<span class="bar-${n}"></span>`).join("")}</div>
      </article>
      <article class="panel"><div class="panel-header"><div><h2>供应商健康</h2><p>API、CDR、Provisioning</p></div></div>
        <div class="health-list">
          <div>${status("active")}<strong>Global Roam Hub</strong><small>API 成功率 99.3% · CDR 延迟 8m</small></div>
          <div>${status("pending")}<strong>Asia eSIM Bridge</strong><small>Profile 回调延迟 23m</small></div>
          <div>${status("failed")}<strong>EU Data Pool</strong><small>12 次暂停操作失败</small></div>
        </div>
      </article>
      <article class="panel"><div class="panel-header"><div><h2>运营队列</h2><p>异步任务和审批</p></div></div>
        <ol class="task-list"><li><span>CDR 标准化</span><strong>1,204 rows</strong><em>运行中</em></li><li><span>套餐变更审批</span><strong>86 SIMs</strong><em>待审批</em></li><li><span>账单邮件发送</span><strong>212 invoices</strong><em>排队</em></li></ol>
      </article>
    </section>
    ${renderSimsCore(false)}
  `;
}

function renderSimsCore(full = true) {
  const rows = sims.map((sim) => `
    <tr tabindex="0" data-sim="${esc(sim[0])}" class="${selectedSim[0] === sim[0] ? "selected" : ""}">
      <td class="mono">${sim[0]}</td><td>${sim[1]}</td><td>${sim[2]}</td><td>${status(sim[3])}</td><td>${sim[4]}</td><td>${sim[5]}</td>
    </tr>`);
  return `
    ${full ? systemBanner() + page("SIM 与设备", "管理号码库存、服务状态、套餐订阅、诊断与生命周期操作。", `<button class="secondary-button" data-toast="SIM 导出任务已创建">导出</button><button class="primary-button" data-action="activate">批量激活</button>`) : ""}
    <section class="content-layout">
      <article class="panel table-panel">
        <div class="panel-header table-header">
          <div><h2>SIM 服务状态</h2><p>库存状态、服务状态与最近操作</p></div>
          <form class="filters" id="simFilterForm">
            <label><span>状态</span><select id="statusFilter"><option value="all">全部</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="failed">Failed</option></select></label>
            <label><span>ICCID</span><input id="iccidFilter" type="text" inputmode="numeric" placeholder="8986..." /></label>
            <button class="secondary-button" type="submit">筛选</button>
          </form>
        </div>
        ${table(["ICCID", "账户", "套餐", "服务状态", "本月用量", "最近操作"], rows)}
      </article>
      ${renderSimDetail()}
    </section>
  `;
}

function simActionButton(action, label, className = "secondary-button") {
  const allowed = {
    activate: ["not_started", "failed"],
    suspend: ["active"],
    resume: ["suspended"],
    terminate: ["active", "suspended", "failed"],
  };
  const serviceStatus = selectedSim?.[3] || "";
  const isAllowed = allowed[action]?.includes(serviceStatus);
  const reason = isAllowed ? "" : `Status ${serviceStatus} does not allow ${label}`;
  return `<button class="${className}" data-action="${action}" data-sim-action-id="${selectedSim[6] || selectedSim[0]}" ${isAllowed ? "" : "disabled"} title="${esc(reason)}">${label}</button>`;
}

function renderSimDetail() {
  const latestOperation = remoteData.simOperations.find((operation) => operation.simId === selectedSim[6]) || null;
  return `
    <aside class="panel detail-panel">
      <div class="detail-top">${status(selectedSim[3])}<h2>SIM 详情</h2><p class="mono">${selectedSim[0]}</p></div>
      <dl class="detail-list">
        <div><dt>账户</dt><dd>${selectedSim[1]}</dd></div>
        <div><dt>套餐</dt><dd>${selectedSim[2]}</dd></div>
        <div><dt>eID</dt><dd>890490320000000000${selectedSim[0].slice(-4)}</dd></div>
        <div><dt>账单影响</dt><dd>${selectedSim[3] === "active" ? "本周期继续计费" : "需重新校验信用与套餐"}</dd></div>
        <div><dt>最近操作状态</dt><dd>${latestOperation ? `${latestOperation.operationType} · ${latestOperation.operationStatus}` : "暂无操作记录"}</dd></div>
      </dl>
      <div class="action-stack">
        ${simActionButton("activate", "Activate", "primary-button")}
        ${simActionButton("suspend", "Suspend")}
        ${simActionButton("resume", "Resume")}
        ${simActionButton("terminate", "Terminate", "danger-button")}
      </div>
      <p class="helper-text">危险操作会展示影响预览，并要求二次确认。</p>
    </aside>
  `;
}

function renderGenericView(config) {
  return `
    ${systemBanner()}
    ${page(config.title, config.subtitle, config.actions || `<button class="secondary-button" data-toast="视图已保存">保存视图</button><button class="primary-button" data-toast="${config.primaryToast || "操作已创建"}">${config.primary || "新建"}</button>`)}
    <section class="summary-strip">${config.metrics.map((m) => metric(m[0], m[1], m[2], m[3] || "")).join("")}</section>
    <section class="module-grid">
      <article class="panel">
        <div class="panel-header"><div><h2>${config.tableTitle}</h2><p>${config.tableNote}</p></div></div>
        ${table(config.headers, config.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`))}
      </article>
      <aside class="panel module-side">
        <div class="panel-header"><div><h2>${config.sideTitle}</h2><p>${config.sideNote}</p></div></div>
        <div class="stack-list">${config.sideItems.map((item) => `<div><strong>${item[0]}</strong><small>${item[1]}</small></div>`).join("")}</div>
        ${config.extraSide || ""}
      </aside>
    </section>
  `;
}

const views = {
  dashboard: renderDashboard,
  sims: () => renderSimsCore(true),
  esim: () => renderGenericView({
    title: "eSIM Profiles", subtitle: "管理 Profile 库存、eID 绑定、RSP 操作和供应商交易。", primary: "启用首个 Profile", primaryToast: "Profile 操作已提交",
    actions: `<button class="secondary-button" data-api-task="esim-release">释放首个 Profile</button><button class="primary-button" data-api-task="esim-enable">启用首个 Profile</button>`,
    metrics: [["可用 Profile", "18,240", "库存充足"], ["已启用", "31,806", "成功率 98.7%"], ["失败操作", "19", "需重试", "warning"]],
    tableTitle: "Profile 列表", tableNote: "支持分配、下载、启用、禁用、删除和状态刷新。",
    headers: ["ICCID", "eID", "Profile 状态", "账户", "供应商", "最近操作"],
    rows: (remoteData.esimProfiles.length ? remoteData.esimProfiles.map((profile) => [profile.iccid, profile.eid || "未绑定", status(profile.profileState === "enabled" ? "active" : "pending"), profile.accountName, profile.supplierName, profile.lastOperation]) : [["89883070000012345678", "890490...5678", status("active"), "FleetLink CN", "Asia eSIM Bridge", "Enable succeeded"], ["89883070000012345679", "未绑定", status("pending"), "库存", "Global Roam Hub", "Ready"]]),
    sideTitle: "操作抽屉", sideNote: "高风险操作先预览影响。", sideItems: [["下载 Profile", "校验 eID、套餐、SM-DP+ 通道"], ["禁用 Profile", "需要记录供应商交易 ID"], ["删除 Profile", "删除前必须二次确认"]],
  }),
  packages: () => renderGenericView({
    title: "套餐与流量池", subtitle: "配置套餐模板、价格版本、账户授权、订阅和共享流量池。", primary: "新建套餐",
    metrics: [["Active 套餐", "46", "可售"], ["Deprecated", "8", "存量续期"], ["流量池", "132", "平均使用率 74%"]],
    tableTitle: "套餐列表", tableNote: "区分 active、deprecated、retired，价格版本不可直接覆盖。",
    headers: ["套餐", "区域", "流量", "周期", "状态", "授权账户"],
    rows: (remoteData.packages.length ? remoteData.packages.map((pkg) => [pkg.name, pkg.regionScope, `${pkg.quotaGb} GB`, pkg.billingStartType, status(pkg.packageStatus === "retired" ? "retired" : pkg.packageStatus === "active" ? "active" : "pending"), String(pkg.entitlementCount)]) : [["Global 5GB Monthly", "Global", "5 GB", "自然月", status("active"), "128"], ["EU 1GB Activation Day", "Europe", "1 GB", "开通日", status("active"), "42"], ["Legacy APAC 500MB", "APAC", "500 MB", "自然月", status("retired"), "存量"]]),
    sideTitle: "套餐向导", sideNote: "基础信息 -> 区域 -> 流量 -> 周期 -> 价格 -> 发布。", sideItems: [["流量池规则", "单 SIM、账户池、Reseller 池"], ["超额策略", "断网、限速、按量、自动加购"], ["发布审批", "影响存量订阅时需要审批"]],
  }),
  usage: () => renderGenericView({
    title: "用量与 CDR", subtitle: "统一查看用量趋势、标准 CDR、导出和 Rating 重跑。", primary: "导入示例 CDR",
    actions: `<button class="secondary-button" data-toast="CDR 导出任务已创建">导出 CDR</button><button class="primary-button" data-api-task="cdr-import">导入示例 CDR</button>`,
    metrics: [["今日用量", "3.8 TB", "同比 +4.2%"], ["CDR 延迟", "9m", "SLA 内"], ["异常流量", "12", "待处理", "warning"]],
    tableTitle: "标准 CDR", tableNote: "供应商原始话单已统一映射为平台格式。",
    headers: ["时间", "ICCID", "国家", "运营商", "总量", "金额"],
    rows: (remoteData.cdrs.length ? remoteData.cdrs.map((cdr) => [cdr.startTime, cdr.iccid, cdr.country, cdr.operatorName, `${cdr.totalGb} GB`, cdr.amountDisplay]) : [["2026-06-14 09:21", "898604...1842", "DE", "Telefónica", "82 MB", "¥0.42"], ["2026-06-14 09:18", "898604...2197", "CN", "China Mobile", "128 MB", "¥0.31"]]),
    sideTitle: "分析维度", sideNote: "按账户、SIM、国家、套餐、供应商聚合。", sideItems: [["地区排行", "欧洲区增长最快"], ["Top SIM", "前 10 占 18% 用量"], ["Rating 重跑", "需要审批并保留版本"]],
  }),
  accounts: () => renderGenericView({
    title: "账户与客户", subtitle: "管理平台、Reseller、客户和子账户的状态、权限与套餐授权。", primary: "创建下级账户",
    metrics: [["客户账户", "312", "Active 298"], ["Reseller", "26", "最大 3 级"], ["信用冻结", "7", "限制新开通", "warning"]],
    tableTitle: "账户树", tableNote: "同时展示业务状态、风控状态和财务状态。",
    headers: ["账户", "类型", "业务状态", "风控", "账务", "下级"],
    rows: (remoteData.accounts.length ? remoteData.accounts.map((account) => [account.accountName, account.accountType, status(account.accountStatus === "active" ? "active" : account.accountStatus === "suspended" ? "suspended" : "pending"), account.riskStatus, account.billingStatus, String(account.childCount)]) : [["Reseller East", "reseller", status("active"), "normal", "current", "38"], ["FleetLink CN", "customer", status("active"), "normal", "current", "4"], ["EVBox Trial", "customer", status("suspended"), "credit_hold", "overdue", "0"]]),
    sideTitle: "状态与限制", sideNote: "上级限制可继承到下级。", sideItems: [["套餐权限", "只能分配已授权套餐"], ["API Scope", "绑定账户树范围"], ["恢复条件", "清除冻结、补齐账务、重新审核"]],
  }),
  billing: () => renderGenericView({
    title: "Billing 账单", subtitle: "自动生成、审批、发布和发送客户账单，支持明细和 CDR 下载。", primary: "创建账单运行",
    actions: `<button class="secondary-button" data-api-task="invoice-run">账单预览</button><button class="primary-button" data-api-task="invoice-send">发送首张账单</button>`,
    metrics: [["本月收入", "¥3.86M", "毛利率 31.5%"], ["待审批账单", "24", "Preview"], ["逾期账单", "9", "需催收", "warning"]],
    tableTitle: "账单中心", tableNote: "Draft、Preview、Issued、Sent、Paid 全流程跟踪。",
    headers: ["账单号", "账户", "周期", "状态", "金额", "到期日"],
    rows: (remoteData.invoices.length ? remoteData.invoices.map((invoice) => [invoice.invoiceNo, invoice.accountName, invoice.period, status(invoice.status === "overdue" ? "failed" : "pending"), invoice.totalDisplay, invoice.dueAt]) : [["INV-202606-0012", "FleetLink CN", "2026-06", status("pending"), "¥128,400", "2026-07-15"], ["INV-202606-0013", "EVBox", "2026-06", status("failed"), "¥9,820", "逾期"]]),
    sideTitle: "账单操作", sideNote: "发布后不可改金额，使用调整单修正。", sideItems: [["审批发布", "需要 Finance 权限"], ["邮件发送", "附 PDF、CSV、CDR 链接"], ["供应商对账", "成本与内部 Rating 差异"]],
  }),
  batch: () => renderGenericView({
    title: "批量任务", subtitle: "上传、校验、预览、审批、执行和下载逐行结果。", primary: "创建批量任务",
    actions: `<button class="secondary-button" data-api-task="batch-run">执行首个可执行任务</button><button class="primary-button" data-api-task="batch-create">创建示例任务</button>`,
    metrics: [["运行中", "12", "队列正常"], ["待审批", "5", "高风险操作"], ["失败行", "37", "可重试", "warning"]],
    tableTitle: "任务列表", tableNote: "每行独立状态，支持失败重试。",
    headers: ["任务", "类型", "状态", "总数", "成功", "失败"],
    rows: (remoteData.batchJobs.length ? remoteData.batchJobs.map((job) => [job.id, job.jobType, status(job.status === "completed" ? "active" : "pending"), String(job.totalCount), String(job.successCount), String(job.failedCount)]) : [["JOB-9021", "套餐变更", status("pending"), "86", "0", "0"], ["JOB-9018", "eSIM 启用", status("active"), "420", "401", "19"]]),
    sideTitle: "执行阶段", sideNote: "上传 -> 校验 -> 审批 -> 执行 -> 结果。", sideItems: [["影响预览", "展示不可执行对象和原因"], ["审批", "批量终止必须审批"], ["幂等", "每行记录 operation_id"]],
  }),
  suppliers: () => renderGenericView({
    title: "资源方", subtitle: "管理供应商 API、产品目录、CDR 文件、对账和 SLA。", primary: "同步产品",
    metrics: [["供应商", "18", "在线 16"], ["API 成功率", "98.9%", "24h"], ["CDR 积压", "3 files", "需关注", "warning"]],
    tableTitle: "供应商列表", tableNote: "一个供应商异常不应影响其他供应商。",
    headers: ["供应商", "类型", "状态", "成功率", "CDR 延迟", "最后同步"],
    rows: (remoteData.suppliers.length ? remoteData.suppliers.map((supplier) => [supplier.supplierName, supplier.supplierType, status(supplier.status === "failed" ? "failed" : supplier.status === "active" ? "active" : "pending"), `${supplier.successRate}%`, `${supplier.cdrDelayMinutes}m`, supplier.lastSyncAt]) : [["Global Roam Hub", "aggregator", status("active"), "99.3%", "8m", "09:10"], ["EU Data Pool", "mvno", status("failed"), "82.0%", "41m", "08:48"]]),
    sideTitle: "鉴权配置", sideNote: "密钥必须加密存储并支持轮换。", sideItems: [["Token 轮换", "到期前 7 天提醒"], ["API 日志", "记录 latency 和 hash"], ["熔断", "连续失败后降级"]],
  }),
  api: () => renderGenericView({
    title: "API 与 Webhook", subtitle: "为客户提供 OAuth Client、API Scope、Webhook 订阅和调用统计。", primary: "创建 API Client",
    actions: `<button class="secondary-button" data-api-task="webhook-test">测试首个 Webhook</button><button class="secondary-button" data-api-task="api-client-rotate">轮换首个 Client</button><button class="primary-button" data-api-task="api-client-create">创建 Sandbox Client</button>`,
    metrics: [["API Clients", String(remoteData.apiClients.length || 64), "Active"], ["Webhook 订阅", String(remoteData.webhookSubscriptions.length || 142), "成功率 99.1%"], ["通知投递", String(remoteData.notificationDeliveries.length || 28), "24h", "warning"]],
    tableTitle: "API Clients", tableNote: "密钥创建后只展示一次，之后必须遮罩。",
    headers: ["Client", "账户范围", "Scopes", "状态", "最后调用"],
    rows: (remoteData.apiClients.length ? remoteData.apiClients.map((client) => [client.clientName, client.accountName, client.scopes.join(" "), status(client.status === "active" ? "active" : "suspended"), client.lastUsedAt || "-"]) : [["fleetlink-prod", "FleetLink CN", "sim.read sim.operate", status("active"), "2m ago"], ["evbox-test", "EVBox Trial", "usage.read", status("suspended"), "3d ago"]]),
    sideTitle: "Webhook", sideNote: "签名、重放保护和失败重试。", sideItems: (remoteData.webhookSubscriptions.length ? remoteData.webhookSubscriptions.map((item) => [item.targetUrl, `${item.eventTypes.join(", ")} · ${item.status}`]) : [["事件", "sim.activated, invoice.issued"], ["签名", "HMAC SHA-256"], ["测试推送", "不发送真实客户数据"]]),
    extraSide: lastTaskResult ? `<div class="secret-box" role="status"><strong>${esc(lastTaskResult.title)}</strong><p>${esc(lastTaskResult.message)}</p>${lastTaskResult.secret ? `<code>${esc(lastTaskResult.secret)}</code>` : ""}</div>` : "",
  }),
  settings: () => renderGenericView({
    title: "Settings", subtitle: "平台、安全、账单、通知、SLA、对象存储和数据保留配置。", primary: "保存配置",
    metrics: [["安全策略", "MFA On", "强制管理员"], ["SLA 阈值", "99.9%", "API"], ["数据保留", "730d", "CDR"]],
    tableTitle: "配置分区", tableNote: "敏感配置需要审计和二次确认。",
    headers: ["配置项", "范围", "当前值", "状态"],
    rows: [["SMTP Provider", "platform", "mail.localcmp.example", status("active")], ["SFTP Key Rotation", "supplier", "30 days", status("pending")], ["Invoice Template", "billing", "CN default", status("active")]],
    sideTitle: "安全合规", sideNote: "生产环境必须 HTTPS。", sideItems: [["密钥遮罩", "不展示完整 token"], ["Cookie 授权", "可选指标需同意"], ["审计日志", "记录配置变更"]],
  }),
  audit: () => renderGenericView({
    title: "Audit Logs", subtitle: "追踪账户、权限、SIM/eSIM、账单、供应商和 API Key 操作。", primary: "导出审计",
    metrics: [["今日事件", "12,842", "正常"], ["高风险操作", "31", "含审批"], ["失败登录", "18", "已限流", "warning"]],
    tableTitle: "审计事件", tableNote: "记录 actor、action、resource、IP、correlation_id。",
    headers: ["时间", "Actor", "Action", "Resource", "IP", "Correlation ID"],
    rows: (remoteData.auditLogs.length ? remoteData.auditLogs.map((log) => [log.createdAt, log.actorId, log.action, log.resourceId, log.ipAddress || "-", log.correlationId]) : [["09:42", "scott", "sim.terminate.preview", "898604...1842", "10.0.2.18", "corr_8f21"], ["09:31", "api:fleetlink", "cdr.export", "account", "10.0.8.11", "corr_72aa"]]),
    sideTitle: "合规导出", sideNote: "导出需要权限并记录原因。", sideItems: [["不可篡改", "审计不允许普通管理员删除"], ["字段脱敏", "Token、手机号按策略遮罩"], ["保留策略", "按租户和司法辖区配置"]],
  }),
};

function optionList(items, selectedId, labelKey = "accountName") {
  return items.map((item) => `<option value="${esc(item.id)}" ${item.id === selectedId ? "selected" : ""}>${esc(item[labelKey] || item.name || item.roleName || item.id)}</option>`).join("");
}

function accountLabel(account) {
  if (!account) return "";
  return `${account.accountName} (${account.accountCode || account.id})`;
}

function accountById(accountId) {
  return remoteData.accounts.find((item) => item.id === accountId) || null;
}

function isDescendantOrSelf(accountId, ancestorId) {
  if (!accountId || !ancestorId) return false;
  if (accountId === ancestorId) return true;
  let current = accountById(accountId);
  while (current?.parentAccountId) {
    if (current.parentAccountId === ancestorId) return true;
    current = accountById(current.parentAccountId);
  }
  return false;
}

function scopedAccounts() {
  return remoteData.accounts.filter((account) => isDescendantOrSelf(account.id, currentScopeAccountId));
}

function childCreatableAccounts() {
  return scopedAccounts().filter((account) => ["platform", "reseller"].includes(account.accountType) && account.accountStatus === "active");
}

function canCreateUnderCurrentScope() {
  const scope = accountById(currentScopeAccountId);
  return scope && ["platform", "reseller"].includes(scope.accountType) && scope.accountStatus === "active";
}

function setScopeAccount(accountId) {
  const next = accountById(accountId) || accountById("acc_root") || remoteData.accounts[0];
  if (!next) return;
  currentScopeAccountId = next.id;
  localStorage.setItem("localcmp_scope_account_id", currentScopeAccountId);
  selectedAccountId = currentScopeAccountId;
  if (accountScopeSearch) accountScopeSearch.value = accountLabel(next);
}

function refreshAccountScopePicker() {
  if (!accountScopeSearch || !accountScopeOptions || !remoteData.accounts.length) return;
  if (!accountById(currentScopeAccountId)) currentScopeAccountId = "acc_root";
  const current = accountById(currentScopeAccountId) || remoteData.accounts[0];
  currentScopeAccountId = current.id;
  accountScopeOptions.innerHTML = remoteData.accounts.map((account) => `<option value="${esc(accountLabel(account))}" data-account-id="${esc(account.id)}"></option>`).join("");
  accountScopeSearch.value = accountLabel(current);
}

function selectedAccount() {
  return remoteData.accounts.find((item) => item.id === selectedAccountId) || accountById(currentScopeAccountId) || remoteData.accounts[0] || null;
}

function selectedUser() {
  return remoteData.users.find((item) => item.id === selectedUserId) || remoteData.users[0] || null;
}

function selectedPackage() {
  return remoteData.packages.find((item) => item.id === selectedPackageId) || remoteData.packages[0] || null;
}

function selectedSupplier() {
  return remoteData.suppliers.find((item) => item.id === selectedSupplierId) || remoteData.suppliers[0] || null;
}

function renderAccountsManaged() {
  const account = selectedAccount();
  const user = selectedUser();
  const visibleAccounts = scopedAccounts();
  const rows = visibleAccounts.map((item) => `
    <tr tabindex="0" data-account-id="${esc(item.id)}" class="${account?.id === item.id ? "selected" : ""}">
      <td>${esc(item.accountName)}</td><td>${esc(item.accountType)}</td><td>${status(item.accountStatus === "active" ? "active" : item.accountStatus === "suspended" ? "suspended" : "pending")}</td><td>${esc(item.riskStatus)}</td><td>${esc(item.billingStatus)}</td><td>${item.childCount || 0}</td>
    </tr>`);
  const scopedIds = new Set(visibleAccounts.map((item) => item.id));
  const visibleUsers = remoteData.users.filter((item) => (item.accounts || []).some((accountLink) => scopedIds.has(accountLink.accountId)));
  const userRows = visibleUsers.map((item) => `
    <tr tabindex="0" data-user-id="${esc(item.id)}" class="${user?.id === item.id ? "selected" : ""}">
      <td>${esc(item.displayName)}</td><td>${esc(item.email)}</td><td>${status(item.status === "active" ? "active" : "pending")}</td><td>${item.accounts?.length || 0}</td><td>${item.roles?.length || 0}</td>
    </tr>`);
  const canCreate = canCreateUnderCurrentScope() || childCreatableAccounts().length > 0;
  return `
    ${systemBanner()}
    ${page("账户与客户", "当前账号作用域：${esc(accountLabel(accountById(currentScopeAccountId)))}。仅展示当前账户及下级账户数据。", `<button class="secondary-button" data-view-target="userCreate">创建用户</button><button class="primary-button" data-view-target="accountCreate" ${canCreate ? "" : "disabled"} title="${canCreate ? "" : "Customer account cannot create child accounts"}">创建账户</button>`)}
    <section class="panel">
      <div class="panel-header"><div><h2>账户列表</h2><p>点击账户进入独立详情页，可查看更多公司、联系人、授权和下级信息。</p></div></div>
      ${table(["账户", "类型", "状态", "风控", "账务", "下级"], rows)}
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>用户列表</h2><p>点击用户查看账户授权与角色配置。</p></div></div>
      ${table(["姓名", "邮箱", "状态", "账户授权", "角色"], userRows)}
    </section>
  `;
}

function renderAccountDetail() {
  const account = accountById(selectedAccountDetailId) || selectedAccount();
  if (!account) return `${systemBanner()}${page("账户详情", "暂无账户。", `<button class="secondary-button" data-view-target="accounts">返回</button>`)}`;
  const children = remoteData.accounts.filter((item) => item.parentAccountId === account.id);
  const users = remoteData.users.filter((item) => (item.accounts || []).some((link) => link.accountId === account.id));
  const simsForAccount = remoteData.dashboard ? sims.filter((sim) => sim[1] === account.accountName) : [];
  return `
    ${systemBanner()}
    ${page(`账户详情 - ${esc(account.accountName)}`, "公司资料、联系人、层级、用户授权、号码/eSIM 资源范围。", `<button class="secondary-button" data-view-target="accounts">返回账户列表</button><button class="primary-button" data-view-target="userCreate">创建用户</button>`)}
    <section class="module-grid">
      <article class="panel">
        <div class="panel-header"><div><h2>基础资料</h2><p>独立详情页承载更完整的账户配置。</p></div></div>
        <dl class="detail-list">
          <div><dt>账户编码</dt><dd>${esc(account.accountCode)}</dd></div>
          <div><dt>账户类型</dt><dd>${esc(account.accountType)}</dd></div>
          <div><dt>状态</dt><dd>${esc(account.accountStatus)}</dd></div>
          <div><dt>父账户</dt><dd>${esc(accountById(account.parentAccountId)?.accountName || "-")}</dd></div>
          <div><dt>币种 / 时区</dt><dd>${esc(account.currency)} / ${esc(account.timezone)}</dd></div>
          <div><dt>路径</dt><dd>${esc(account.path || "-")}</dd></div>
        </dl>
      </article>
      <aside class="panel module-side">
        <div class="panel-header"><div><h2>公司与联系人</h2><p>创建账户时采集的扩展信息。</p></div></div>
        <dl class="detail-list">
          <div><dt>公司名称</dt><dd>${esc(account.companyName || account.accountName)}</dd></div>
          <div><dt>税号</dt><dd>${esc(account.taxId || "-")}</dd></div>
          <div><dt>联系人</dt><dd>${esc(account.contactName || "-")}</dd></div>
          <div><dt>联系人邮箱</dt><dd>${esc(account.contactEmail || "-")}</dd></div>
          <div><dt>公司地址</dt><dd>${esc(account.companyAddress || "-")}</dd></div>
        </dl>
      </aside>
    </section>
    <section class="module-grid">
      <article class="panel">
        <div class="panel-header"><div><h2>下级账户</h2><p>customer 类型不会出现下级创建入口。</p></div></div>
        ${table(["账户", "类型", "状态", "账务"], children.map((item) => `<tr tabindex="0" data-account-id="${esc(item.id)}"><td>${esc(item.accountName)}</td><td>${esc(item.accountType)}</td><td>${status(item.accountStatus === "active" ? "active" : "pending")}</td><td>${esc(item.billingStatus)}</td></tr>`))}
      </article>
      <article class="panel">
        <div class="panel-header"><div><h2>绑定用户</h2><p>仅显示该账户上的授权用户。</p></div></div>
        ${table(["姓名", "邮箱", "状态"], users.map((item) => `<tr tabindex="0" data-user-id="${esc(item.id)}"><td>${esc(item.displayName)}</td><td>${esc(item.email)}</td><td>${status(item.status === "active" ? "active" : "pending")}</td></tr>`))}
      </article>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>资源范围</h2><p>后续 SIM/eSIM 操作也应限定在当前账户及其下级账户范围内。</p></div></div>
      ${table(["ICCID", "账户", "套餐", "状态", "本月用量"], simsForAccount.map((sim) => `<tr><td class="mono">${esc(sim[0])}</td><td>${esc(sim[1])}</td><td>${esc(sim[2])}</td><td>${status(sim[3])}</td><td>${esc(sim[4])}</td></tr>`))}
    </section>
  `;
}

function renderPackagesManaged() {
  const pkg = selectedPackage();
  const rows = remoteData.packages.map((item) => `
    <tr tabindex="0" data-package-id="${esc(item.id)}" class="${pkg?.id === item.id ? "selected" : ""}">
      <td>${esc(item.name)}</td><td>${esc(item.regionScope)}</td><td>${item.quotaGb} GB</td><td>${esc(item.billingStartType)}</td><td>${status(item.packageStatus === "active" ? "active" : item.packageStatus === "retired" ? "retired" : "pending")}</td><td>${item.entitlementCount || 0}</td>
    </tr>`);
  return `
    ${systemBanner()}
    ${page("套餐与流量池", "配置套餐、计费起始规则、共享流量池和账户授权。")}
    <section class="module-grid wide-module">
      <article class="panel">
        <div class="panel-header"><div><h2>套餐列表</h2><p>点击套餐查看订阅、授权和流量池关系。</p></div></div>
        ${table(["套餐", "地区", "流量", "周期", "状态", "授权账户"], rows)}
      </article>
      <aside class="panel module-side">
        <div class="panel-header"><div><h2>套餐配置</h2><p>${pkg ? esc(pkg.name) : "暂无套餐"}</p></div></div>
        ${pkg ? `<dl class="detail-list">
          <div><dt>套餐编码</dt><dd>${esc(pkg.packageCode)}</dd></div>
          <div><dt>订阅数</dt><dd>${pkg.subscriptionCount || 0}</dd></div>
          <div><dt>是否流量池</dt><dd>${pkg.poolEnabled ? "支持" : "不支持"}</dd></div>
          <div><dt>状态</dt><dd>${esc(pkg.packageStatus)}</dd></div>
        </dl>` : ""}
      </aside>
    </section>
    <section class="module-grid">
      <article class="panel">
        <div class="panel-header"><div><h2>创建套餐</h2><p>先创建 draft，后续可提交审核并发布。</p></div></div>
        <form class="form-grid" id="packageCreateForm">
          <label><span>套餐名称</span><input name="name" required placeholder="Global 10GB Monthly" /></label>
          <label><span>套餐编码</span><input name="packageCode" required placeholder="GLOBAL-10GB-MONTHLY" /></label>
          <label><span>地区</span><input name="regionScope" required value="Global" /></label>
          <label><span>流量 GB</span><input name="quotaGb" type="number" min="0.1" step="0.1" required value="10" /></label>
          <label><span>计费起点</span><select name="billingStartType"><option value="calendar_month">月初计费</option><option value="activation_day">开通日计费</option></select></label>
          <label><span>流量池</span><select name="poolEnabled"><option value="false">不启用</option><option value="true">启用</option></select></label>
          <div class="form-actions"><button class="primary-button" type="submit">创建套餐</button></div>
        </form>
      </article>
      <article class="panel">
        <div class="panel-header"><div><h2>创建流量池</h2><p>绑定账户和套餐，支持月初或开通日重置。</p></div></div>
        <form class="form-grid" id="poolCreateForm">
          <label><span>流量池名称</span><input name="name" required placeholder="FleetLink Global Pool" /></label>
          <label><span>账户</span><select name="accountId">${optionList(scopedAccounts(), selectedAccount()?.id)}</select></label>
          <label><span>套餐</span><select name="packageId">${optionList(remoteData.packages, pkg?.id, "name")}</select></label>
          <label><span>容量 GB</span><input name="quotaGb" type="number" min="1" step="1" required value="100" /></label>
          <label><span>重置策略</span><select name="resetPolicy"><option value="calendar_month">月初重置</option><option value="activation_day">开通日重置</option></select></label>
          <label><span>超额策略</span><select name="overagePolicy"><option value="throttle">限速</option><option value="block">断网</option><option value="pay_as_you_go">按量</option></select></label>
          <div class="form-actions"><button class="primary-button" type="submit">创建流量池</button></div>
        </form>
      </article>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>流量池</h2><p>当前账户池与使用率。</p></div></div>
      ${table(["流量池", "账户", "套餐", "配额", "已用", "策略"], remoteData.usagePools.map((pool) => `<tr><td>${esc(pool.name)}</td><td>${esc(pool.accountName)}</td><td>${esc(pool.packageName)}</td><td>${Math.round(pool.quotaBytes / 1024 / 1024 / 1024)} GB</td><td>${pool.usedPercent}%</td><td>${esc(pool.overagePolicy)}</td></tr>`))}
    </section>
  `;
}

function renderAccountCreate() {
  const parents = childCreatableAccounts();
  const defaultParent = parents.find((item) => item.id === currentScopeAccountId) || parents[0] || null;
  return `
    ${systemBanner()}
    ${page("创建账户", "只能在当前账户或下级 reseller 账户下创建。customer 账户不能创建下级账户。", `<button class="secondary-button" data-view-target="accounts">返回账户列表</button>`)}
    <section class="panel">
      <div class="panel-header"><div><h2>账户资料</h2><p>公司、税务、联系人和地址信息用于账单、合同、对账和合规审计。</p></div></div>
      ${parents.length ? `<form class="form-grid" id="accountCreateForm">
        <label><span>账户名称</span><input name="accountName" required placeholder="FleetLink South" /></label>
        <label><span>账户编码</span><input name="accountCode" required placeholder="FLEETLINK-SOUTH" /></label>
        <label><span>账户类型</span><select name="accountType"><option value="customer">customer</option><option value="reseller">reseller</option></select></label>
        <label><span>父账户</span><select name="parentAccountId">${optionList(parents, defaultParent?.id)}</select></label>
        <label><span>公司名称</span><input name="companyName" required placeholder="FleetLink Technology Ltd." /></label>
        <label><span>税号</span><input name="taxId" required placeholder="Tax ID / VAT No." /></label>
        <label><span>联系人</span><input name="contactName" required placeholder="Jane Ops" /></label>
        <label><span>联系人邮箱</span><input name="contactEmail" type="email" required placeholder="jane@example.com" /></label>
        <label class="span-2"><span>公司地址</span><input name="companyAddress" required placeholder="Company registered address" /></label>
        <label><span>币种</span><select name="currency"><option>CNY</option><option>USD</option><option>EUR</option></select></label>
        <label><span>时区</span><input name="timezone" value="Asia/Shanghai" required /></label>
        <div class="form-actions"><button class="primary-button" type="submit">提交创建</button></div>
      </form>` : `<div class="empty-state"><strong>当前作用域不能创建下级账户</strong><p>请选择 platform 或 reseller 账户作用域后再创建。</p></div>`}
    </section>
  `;
}

function renderUserCreate() {
  const accounts = scopedAccounts();
  const defaultAccount = accounts.find((item) => item.id === currentScopeAccountId) || accounts[0] || null;
  return `
    ${systemBanner()}
    ${page("创建用户", "只能为当前账户及其下级账户创建用户授权。", `<button class="secondary-button" data-view-target="accounts">返回账户列表</button>`)}
    <section class="panel">
      <div class="panel-header"><div><h2>用户资料与授权</h2><p>创建后绑定指定账户和角色，初始密码只显示一次。</p></div></div>
      <form class="form-grid" id="userCreateForm">
        <label><span>姓名</span><input name="displayName" required placeholder="Jane Ops" /></label>
        <label><span>邮箱</span><input name="email" type="email" required placeholder="jane@example.com" /></label>
        <label><span>手机号</span><input name="phone" inputmode="tel" /></label>
        <label><span>绑定账户</span><select name="accountId">${optionList(accounts, defaultAccount?.id)}</select></label>
        <label><span>角色</span><select name="roleId">${optionList(remoteData.roles, "role_viewer", "roleName")}</select></label>
        <label><span>初始密码</span><input name="initialPassword" type="password" minlength="10" placeholder="留空使用默认强密码" /></label>
        <div class="form-actions"><button class="primary-button" type="submit">提交创建</button></div>
      </form>
      ${lastTaskResult?.title === "用户已创建" ? `<div class="secret-box" role="status"><strong>${esc(lastTaskResult.title)}</strong><p>${esc(lastTaskResult.message)}</p></div>` : ""}
    </section>
  `;
}

function renderSuppliersManaged() {
  const supplier = selectedSupplier();
  const rows = remoteData.suppliers.map((item) => `
    <tr tabindex="0" data-supplier-id="${esc(item.id)}" class="${supplier?.id === item.id ? "selected" : ""}">
      <td>${esc(item.supplierName)}</td><td>${esc(item.supplierType)}</td><td>${status(item.status === "active" ? "active" : item.status === "failed" ? "failed" : "pending")}</td><td>${esc(item.successRate)}%</td><td>${esc(item.cdrDelayMinutes)}m</td><td>${esc(item.lastSyncAt || "-")}</td>
    </tr>`);
  return `
    ${systemBanner()}
    ${page("资源方", "对接流量资源方、eSIM/RSP 供应商、CDR 同步和 SLA 监控。", `<button class="primary-button" data-api-task="supplier-sync" data-supplier-id="${supplier?.id || ""}">同步当前资源方</button>`)}
    <section class="module-grid">
      <article class="panel">
        <div class="panel-header"><div><h2>资源方列表</h2><p>点击资源方查看 API 与 CDR 健康信息。</p></div></div>
        ${table(["资源方", "类型", "状态", "成功率", "CDR 延迟", "最后同步"], rows)}
      </article>
      <aside class="panel module-side">
        <div class="panel-header"><div><h2>资源方配置</h2><p>${supplier ? esc(supplier.supplierName) : "暂无资源方"}</p></div></div>
        ${supplier ? `<dl class="detail-list">
          <div><dt>编码</dt><dd>${esc(supplier.supplierCode)}</dd></div>
          <div><dt>类型</dt><dd>${esc(supplier.supplierType)}</dd></div>
          <div><dt>SLA</dt><dd>API ${esc(supplier.successRate)}% / CDR ${esc(supplier.cdrDelayMinutes)}m</dd></div>
          <div><dt>鉴权</dt><dd>Token/密钥仅显示掩码，真实值应在密钥管理器保存。</dd></div>
        </dl>` : ""}
      </aside>
    </section>
  `;
}

function renderSettingsManaged() {
  const settings = remoteData.settings || {};
  return `
    ${systemBanner()}
    ${page("Settings", "平台安全、SLA、账单、数据保留和外部集成配置。")}
    <section class="panel">
      <div class="panel-header"><div><h2>运行配置</h2><p>保存会写入后端设置并产生审计日志。</p></div></div>
      <form class="form-grid" id="settingsForm">
        <label><span>管理员 MFA</span><select name="mfaRequiredForAdmins"><option value="true" ${settings.security?.mfaRequiredForAdmins ? "selected" : ""}>强制</option><option value="false" ${settings.security?.mfaRequiredForAdmins === false ? "selected" : ""}>不强制</option></select></label>
        <label><span>生产 HTTPS</span><select name="productionHttpsRequired"><option value="true" ${settings.security?.productionHttpsRequired ? "selected" : ""}>强制</option><option value="false" ${settings.security?.productionHttpsRequired === false ? "selected" : ""}>不强制</option></select></label>
        <label><span>API SLA</span><input name="apiAvailability" value="${esc(settings.sla?.apiAvailability || "99.9%")}" required /></label>
        <label><span>CDR 延迟分钟</span><input name="cdrDelayMinutes" type="number" min="1" value="${esc(settings.sla?.cdrDelayMinutes || 30)}" required /></label>
        <label><span>CDR 保留天数</span><input name="cdrDays" type="number" min="30" value="${esc(settings.retention?.cdrDays || 730)}" required /></label>
        <label><span>审计保留天数</span><input name="auditDays" type="number" min="90" value="${esc(settings.retention?.auditDays || 1095)}" required /></label>
        <div class="form-actions"><button class="primary-button" type="submit">保存配置</button></div>
      </form>
    </section>
  `;
}

function renderAuditManaged() {
  const rows = remoteData.auditLogs.map((log) => `<tr><td>${esc(log.createdAt)}</td><td>${esc(log.actorId)}</td><td>${esc(log.action)}</td><td>${esc(log.resourceType || "-")}</td><td>${esc(log.resourceId || "-")}</td><td>${esc(log.correlationId || "-")}</td></tr>`);
  return `
    ${systemBanner()}
    ${page("Audit Logs", "记录账户、用户、SIM/eSIM、套餐、账单、资源方和 API 操作。")}
    <section class="module-grid">
      <article class="panel">
        <div class="panel-header"><div><h2>审计事件</h2><p>来自后端 /audit-logs API。</p></div></div>
        ${table(["时间", "Actor", "Action", "类型", "资源", "Correlation ID"], rows)}
      </article>
      <aside class="panel module-side">
        <div class="panel-header"><div><h2>导出审计</h2><p>生成导出任务，返回匹配行数和下载地址。</p></div></div>
        <form class="form-grid compact-form" id="auditExportForm">
          <label><span>Action 包含</span><input name="action" placeholder="sim / user / settings" /></label>
          <label><span>资源类型</span><input name="resourceType" placeholder="sim, account, user" /></label>
          <label><span>格式</span><select name="format"><option value="csv">CSV</option><option value="json">JSON</option></select></label>
          <div class="form-actions"><button class="primary-button" type="submit">导出审计</button></div>
        </form>
        ${lastTaskResult ? `<div class="secret-box" role="status"><strong>${esc(lastTaskResult.title)}</strong><p>${esc(lastTaskResult.message)}</p></div>` : ""}
      </aside>
    </section>
  `;
}

views.accounts = renderAccountsManaged;
views.accountDetail = renderAccountDetail;
views.accountCreate = renderAccountCreate;
views.userCreate = renderUserCreate;
views.packages = renderPackagesManaged;
views.suppliers = renderSuppliersManaged;
views.settings = renderSettingsManaged;
views.audit = renderAuditManaged;

function renderNav() {
  navList.innerHTML = navItems.map(([id, icon, label]) => `
    <button class="nav-item ${id === currentView ? "active" : ""}" type="button" data-view="${id}" ${id === currentView ? 'aria-current="page"' : ""}>
      <span class="nav-icon" aria-hidden="true">${icon}</span>${label}
    </button>`).join("");
}

function render() {
  renderNav();
  main.innerHTML = views[currentView]();
  main.focus({ preventScroll: true });
  bindViewEvents();
}

function switchView(view) {
  if (!views[view]) return;
  currentView = view;
  render();
  document.querySelector(".sidebar").classList.remove("open");
  document.querySelector(".mobile-menu").setAttribute("aria-expanded", "false");
}

function openConfirm(action, simId) {
  pendingAction = action;
  pendingSimId = simId || selectedSim?.[6] || selectedSim?.[0];
  typedConfirm.value = "";
  typedConfirmError.textContent = "";
  typedConfirmWrap.classList.toggle("hidden", action !== "terminate");
  const label = { activate: "激活", suspend: "暂停服务", resume: "恢复服务", terminate: "终止服务", retire: "下架", revoke: "吊销" }[action] || "执行";
  confirmMessage.textContent = `${label}操作将影响当前选中对象。系统会记录审计日志、生成 operation_id，并根据权限要求进入审批。${action === "terminate" ? "终止后不可直接恢复。" : ""}`;
  confirmDialog.showModal();
}

function bindViewEvents() {
  main.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewTarget));
  });
  main.querySelectorAll("[data-toast]").forEach((button) => {
    button.addEventListener("click", () => showToast(button.dataset.toast));
  });
  main.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => openConfirm(button.dataset.action, button.dataset.simActionId));
  });
  main.querySelectorAll("[data-api-task]").forEach((button) => {
    button.addEventListener("click", () => runApiTask(button.dataset.apiTask));
  });
  main.querySelectorAll("[data-sim]").forEach((row) => {
    const select = () => {
      selectedSim = sims.find((sim) => sim[0] === row.dataset.sim) || selectedSim;
      render();
      showToast(`已选择 SIM ${selectedSim[0]}`);
    };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
  main.querySelectorAll("[data-account-id]").forEach((row) => {
    const select = () => {
      selectedAccountId = row.dataset.accountId;
      selectedAccountDetailId = row.dataset.accountId;
      switchView("accountDetail");
      showToast("已打开账户详情");
    };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
  main.querySelectorAll("[data-user-id]").forEach((row) => {
    const select = () => {
      selectedUserId = row.dataset.userId;
      render();
      showToast("已加载用户配置");
    };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
  main.querySelectorAll("[data-package-id]").forEach((row) => {
    const select = () => {
      selectedPackageId = row.dataset.packageId;
      render();
      showToast("已加载套餐配置");
    };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
  main.querySelectorAll("[data-supplier-id]").forEach((row) => {
    const select = () => {
      selectedSupplierId = row.dataset.supplierId;
      render();
      showToast("已加载资源方配置");
    };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
  bindManagedForms();
  const filterForm = main.querySelector("#simFilterForm");
  if (filterForm) {
    filterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      showToast("筛选已应用。");
    });
  }
}

function formPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function toBoolean(value) {
  return value === true || value === "true";
}

function bindManagedForms() {
  const accountForm = main.querySelector("#accountCreateForm");
  if (accountForm) {
    accountForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = formPayload(accountForm);
        const account = await apiPost("/accounts", payload);
        selectedAccountId = account.id;
        selectedAccountDetailId = account.id;
        currentScopeAccountId = account.id;
        localStorage.setItem("localcmp_scope_account_id", account.id);
        showToast(`账户已创建：${account.accountName}`);
        await loadBackendData();
        switchView("accountDetail");
      } catch (error) {
        showToast(`账户创建失败：${error.message}`);
      }
    });
  }
  const userForm = main.querySelector("#userCreateForm");
  if (userForm) {
    userForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = formPayload(userForm);
        if (!payload.initialPassword) delete payload.initialPassword;
        const user = await apiPost("/users", payload);
        selectedUserId = user.id;
        lastTaskResult = {
          title: "用户已创建",
          message: `初始密码只返回一次：${user.initialPassword}`,
        };
        showToast(`用户已创建：${user.displayName}`);
        await loadBackendData();
        render();
      } catch (error) {
        showToast(`用户创建失败：${error.message}`);
      }
    });
  }
  const packageForm = main.querySelector("#packageCreateForm");
  if (packageForm) {
    packageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = formPayload(packageForm);
        payload.quotaGb = Number(payload.quotaGb);
        payload.poolEnabled = toBoolean(payload.poolEnabled);
        const pkg = await apiPost("/packages", payload);
        selectedPackageId = pkg.id;
        showToast(`套餐已创建：${pkg.name}`);
        await loadBackendData();
        render();
      } catch (error) {
        showToast(`套餐创建失败：${error.message}`);
      }
    });
  }
  const poolForm = main.querySelector("#poolCreateForm");
  if (poolForm) {
    poolForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = formPayload(poolForm);
        payload.quotaGb = Number(payload.quotaGb);
        const pool = await apiPost("/usage-pools", payload);
        showToast(`流量池已创建：${pool.name}`);
        await loadBackendData();
        render();
      } catch (error) {
        showToast(`流量池创建失败：${error.message}`);
      }
    });
  }
  const settingsForm = main.querySelector("#settingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = formPayload(settingsForm);
        await apiPost("/settings", {
          security: {
            mfaRequiredForAdmins: toBoolean(payload.mfaRequiredForAdmins),
            productionHttpsRequired: toBoolean(payload.productionHttpsRequired),
          },
          sla: {
            apiAvailability: payload.apiAvailability,
            cdrDelayMinutes: Number(payload.cdrDelayMinutes),
          },
          retention: {
            cdrDays: Number(payload.cdrDays),
            auditDays: Number(payload.auditDays),
          },
        });
        showToast("配置已保存");
        await loadBackendData();
        render();
      } catch (error) {
        showToast(`配置保存失败：${error.message}`);
      }
    });
  }
  const auditForm = main.querySelector("#auditExportForm");
  if (auditForm) {
    auditForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = formPayload(auditForm);
        const result = await apiPost("/audit-logs/export", payload);
        lastTaskResult = {
          title: "审计导出已完成",
          message: `${result.recordCount} 条记录，下载地址：${result.downloadUrl}`,
        };
        showToast(`审计导出完成：${result.recordCount} 条`);
        await loadBackendData();
        render();
      } catch (error) {
        showToast(`审计导出失败：${error.message}`);
      }
    });
  }
}

async function runApiTask(task) {
  try {
    lastTaskResult = null;
    showToast("操作提交中...");
    if (task === "cdr-import") {
      const suffix = Date.now();
      const result = await apiPost("/cdrs/import", {
        records: [
          {
            supplierRecordId: `ui-cdr-${suffix}`,
            supplierCode: "GLOBAL-ROAM",
            iccid: sims[0]?.[0] || "8986041020250001842",
            country: "DE",
            operatorName: "Telefonica",
            totalBytes: 2097152,
            amount: 18,
            currency: "CNY",
            startTime: new Date().toISOString(),
          },
        ],
      });
      showToast(`CDR 导入完成：标准化 ${result.normalizedCount} 条，重复 ${result.duplicateCount} 条。`);
    }
    if (task === "invoice-run") {
      const result = await apiPost("/invoice-runs", {});
      showToast(`账单预览已创建：${result.runId}`);
    }
    if (task === "invoice-send") {
      const invoice = remoteData.invoices[0];
      if (!invoice) throw new Error("暂无可发送账单");
      const result = await apiPost(`/invoices/${encodeURIComponent(invoice.id)}/send`, {});
      showToast(`账单发送已入队：${result.delivery.status}`);
    }
    if (task === "batch-create") {
      const result = await apiPost("/batch-jobs", {
        jobType: "sim_suspend",
        requiresApproval: false,
        items: [{ iccid: sims[0]?.[0] || "8986041020250001842", reason: "customer_request" }],
      });
      showToast(`批量任务已创建：${result.id}`);
    }
    if (task === "batch-run") {
      const job = remoteData.batchJobs.find((item) => ["validated", "waiting_approval"].includes(item.status)) || remoteData.batchJobs[0];
      if (!job) throw new Error("暂无可执行批量任务");
      const result = await apiPost(`/batch-jobs/${encodeURIComponent(job.id)}/run`, {});
      showToast(`批量任务已执行：成功 ${result.successCount} 行。`);
    }
    if (task === "esim-enable") {
      const profile = remoteData.esimProfiles[0];
      if (!profile) throw new Error("暂无 eSIM Profile");
      const result = await apiPost(`/esim-profiles/${encodeURIComponent(profile.id)}/enable`, {});
      showToast(`eSIM 启用已受理：${result.operationId}`);
    }
    if (task === "esim-release") {
      const profile = remoteData.esimProfiles.find((item) => item.profileState !== "enabled") || remoteData.esimProfiles[0];
      if (!profile) throw new Error("暂无 eSIM Profile");
      const result = await apiPost(`/esim-profiles/${encodeURIComponent(profile.id)}/release`, {});
      showToast(`eSIM 释放已受理：${result.operationId}`);
    }
    if (task === "api-client-create") {
      const account = remoteData.accounts.find((item) => item.accountStatus === "active" && item.accountType !== "platform") || remoteData.accounts[0];
      if (!account) throw new Error("暂无可绑定账户");
      const result = await apiPost("/api-clients", {
        accountId: account.id,
        clientName: `sandbox-${Date.now()}`,
        scopes: ["sim.read", "usage.read"],
      });
      lastTaskResult = {
        title: "API Client 已创建",
        message: "Client Secret 只显示一次，请在真实环境立即保存到密钥管理器。",
        secret: result.clientSecret,
      };
      showToast(`API Client 已创建：${result.clientName}`);
    }
    if (task === "api-client-rotate") {
      const client = remoteData.apiClients.find((item) => item.status === "active") || remoteData.apiClients[0];
      if (!client) throw new Error("暂无 API Client");
      const result = await apiPost(`/api-clients/${encodeURIComponent(client.id)}/rotate`, {});
      lastTaskResult = {
        title: "Client Secret 已轮换",
        message: "新密钥只显示一次，旧密钥应在生产环境按策略失效。",
        secret: result.clientSecret,
      };
      showToast(`密钥已轮换：${result.clientName}`);
    }
    if (task === "webhook-test") {
      const webhook = remoteData.webhookSubscriptions.find((item) => item.status === "active") || remoteData.webhookSubscriptions[0];
      if (!webhook) throw new Error("暂无 Webhook 订阅");
      const result = await apiPost(`/webhook-subscriptions/${encodeURIComponent(webhook.id)}/test`, {});
      lastTaskResult = {
        title: "Webhook 测试已入队",
        message: `Delivery ${result.id} 已进入通知队列，目标：${result.targetUrl}`,
      };
      showToast(`Webhook 测试已入队：${result.status}`);
    }
    if (task === "supplier-sync") {
      const supplier = selectedSupplier();
      if (!supplier) throw new Error("暂无可同步资源方");
      const result = await apiPost(`/suppliers/${encodeURIComponent(supplier.id)}/sync-products`, {});
      selectedSupplierId = result.id;
      showToast(`资源方已同步：${result.supplierName}`);
    }
    await loadBackendData();
    render();
  } catch (error) {
    showToast(`操作未完成：${error.message}`);
  }
}

navList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  switchView(button.dataset.view);
});

document.querySelector(".mobile-menu").addEventListener("click", () => {
  const sidebar = document.querySelector(".sidebar");
  sidebar.classList.toggle("open");
  document.querySelector(".mobile-menu").setAttribute("aria-expanded", String(sidebar.classList.contains("open")));
});

if (accountScopeSearch) {
  accountScopeSearch.addEventListener("change", () => {
    const value = accountScopeSearch.value.trim().toLowerCase();
    const account = remoteData.accounts.find((item) => accountLabel(item).toLowerCase() === value || item.accountName.toLowerCase() === value || item.accountCode?.toLowerCase() === value);
    if (!account) {
      refreshAccountScopePicker();
      showToast("未找到匹配账户，请从自动补全列表选择。");
      return;
    }
    setScopeAccount(account.id);
    selectedAccountId = account.id;
    selectedAccountDetailId = account.id;
    render();
    showToast(`已切换账户作用域：${account.accountName}`);
  });
  accountScopeSearch.addEventListener("input", () => {
    const value = accountScopeSearch.value.trim().toLowerCase();
    const exact = remoteData.accounts.find((item) => accountLabel(item).toLowerCase() === value);
    if (exact) {
      setScopeAccount(exact.id);
      render();
    }
  });
}

confirmDialog.addEventListener("close", () => {
  if (confirmDialog.returnValue !== "confirm") return;
  if (pendingAction === "terminate" && typedConfirm.value !== "TERMINATE") {
    typedConfirmError.textContent = "请输入 TERMINATE 才能终止服务。";
    confirmDialog.showModal();
    return;
  }
  const action = pendingAction;
  const simId = pendingSimId;
  showToast("操作提交中...");
  apiPost(`/sims/${encodeURIComponent(simId)}/${encodeURIComponent(action)}`, {})
    .then(async (result) => {
      showToast(`操作已受理，Operation ID：${result.operationId}`);
      await loadBackendData();
      render();
    })
    .catch((error) => showToast(`操作未提交：${error.message}`));
});

document.querySelector("#acceptCookies").addEventListener("click", () => {
  document.querySelector("#cookieBanner").classList.add("hidden");
  showToast("Cookie 偏好已保存：同意体验指标。");
});

document.querySelector("#rejectCookies").addEventListener("click", () => {
  document.querySelector("#cookieBanner").classList.add("hidden");
  showToast("Cookie 偏好已保存：仅必要 Cookie。");
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginError.textContent = "";
  login(document.querySelector("#loginEmail").value, document.querySelector("#loginPassword").value).catch((error) => {
    loginError.textContent = error.message;
  });
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  localStorage.removeItem("localcmp_token");
  showLogin("已退出登录。");
});

if (authToken()) {
  hideLogin();
  loadBackendData().finally(render);
} else {
  showLogin();
  render();
}
