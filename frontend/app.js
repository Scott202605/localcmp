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

const sims = [
  ["8986041020250001842", "FleetLink CN", "Global 5GB Monthly", "active", "4.2 GB", "Resume succeeded"],
  ["8986041020250001916", "Reseller East / EVBox", "APAC Pool 500GB", "suspended", "312 MB", "Suspend by credit hold"],
  ["8986041020250002068", "MedTrack Europe", "EU 1GB Activation Day", "failed", "0 MB", "Activation failed"],
  ["8986041020250002197", "ColdChain Global", "Global Shared Pool", "active", "8.9 GB", "Package changed"],
];

let currentView = "dashboard";
let selectedSim = sims[0];
let pendingAction = null;

const main = document.querySelector("#main");
const navList = document.querySelector("#navList");
const toastEl = document.querySelector("#toast");
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
    ${full ? page("SIM 与设备", "管理号码库存、服务状态、套餐订阅、诊断与生命周期操作。", `<button class="secondary-button" data-toast="SIM 导出任务已创建">导出</button><button class="primary-button" data-action="activate">批量激活</button>`) : ""}
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

function renderSimDetail() {
  return `
    <aside class="panel detail-panel">
      <div class="detail-top">${status(selectedSim[3])}<h2>SIM 详情</h2><p class="mono">${selectedSim[0]}</p></div>
      <dl class="detail-list">
        <div><dt>账户</dt><dd>${selectedSim[1]}</dd></div>
        <div><dt>套餐</dt><dd>${selectedSim[2]}</dd></div>
        <div><dt>eID</dt><dd>890490320000000000${selectedSim[0].slice(-4)}</dd></div>
        <div><dt>账单影响</dt><dd>${selectedSim[3] === "active" ? "本周期继续计费" : "需重新校验信用与套餐"}</dd></div>
      </dl>
      <div class="action-stack">
        <button class="primary-button" data-action="activate">激活</button>
        <button class="secondary-button" data-action="suspend">暂停服务</button>
        <button class="secondary-button" data-action="resume">恢复服务</button>
        <button class="danger-button" data-action="terminate">终止服务</button>
      </div>
      <p class="helper-text">危险操作会展示影响预览，并要求二次确认。</p>
    </aside>
  `;
}

function renderGenericView(config) {
  return `
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
      </aside>
    </section>
  `;
}

const views = {
  dashboard: renderDashboard,
  sims: () => renderSimsCore(true),
  esim: () => renderGenericView({
    title: "eSIM Profiles", subtitle: "管理 Profile 库存、eID 绑定、RSP 操作和供应商交易。", primary: "导入 Profile", primaryToast: "Profile 导入任务已创建",
    metrics: [["可用 Profile", "18,240", "库存充足"], ["已启用", "31,806", "成功率 98.7%"], ["失败操作", "19", "需重试", "warning"]],
    tableTitle: "Profile 列表", tableNote: "支持分配、下载、启用、禁用、删除和状态刷新。",
    headers: ["ICCID", "eID", "Profile 状态", "账户", "供应商", "最近操作"],
    rows: [["89883070000012345678", "890490...5678", status("active"), "FleetLink CN", "Asia eSIM Bridge", "Enable succeeded"], ["89883070000012345679", "未绑定", status("pending"), "库存", "Global Roam Hub", "Ready"]],
    sideTitle: "操作抽屉", sideNote: "高风险操作先预览影响。", sideItems: [["下载 Profile", "校验 eID、套餐、SM-DP+ 通道"], ["禁用 Profile", "需要记录供应商交易 ID"], ["删除 Profile", "删除前必须二次确认"]],
  }),
  packages: () => renderGenericView({
    title: "套餐与流量池", subtitle: "配置套餐模板、价格版本、账户授权、订阅和共享流量池。", primary: "新建套餐",
    metrics: [["Active 套餐", "46", "可售"], ["Deprecated", "8", "存量续期"], ["流量池", "132", "平均使用率 74%"]],
    tableTitle: "套餐列表", tableNote: "区分 active、deprecated、retired，价格版本不可直接覆盖。",
    headers: ["套餐", "区域", "流量", "周期", "状态", "授权账户"],
    rows: [["Global 5GB Monthly", "Global", "5 GB", "自然月", status("active"), "128"], ["EU 1GB Activation Day", "Europe", "1 GB", "开通日", status("active"), "42"], ["Legacy APAC 500MB", "APAC", "500 MB", "自然月", status("retired"), "存量"]],
    sideTitle: "套餐向导", sideNote: "基础信息 -> 区域 -> 流量 -> 周期 -> 价格 -> 发布。", sideItems: [["流量池规则", "单 SIM、账户池、Reseller 池"], ["超额策略", "断网、限速、按量、自动加购"], ["发布审批", "影响存量订阅时需要审批"]],
  }),
  usage: () => renderGenericView({
    title: "用量与 CDR", subtitle: "统一查看用量趋势、标准 CDR、导出和 Rating 重跑。", primary: "导出 CDR",
    metrics: [["今日用量", "3.8 TB", "同比 +4.2%"], ["CDR 延迟", "9m", "SLA 内"], ["异常流量", "12", "待处理", "warning"]],
    tableTitle: "标准 CDR", tableNote: "供应商原始话单已统一映射为平台格式。",
    headers: ["时间", "ICCID", "国家", "运营商", "总量", "金额"],
    rows: [["2026-06-14 09:21", "898604...1842", "DE", "Telefónica", "82 MB", "¥0.42"], ["2026-06-14 09:18", "898604...2197", "CN", "China Mobile", "128 MB", "¥0.31"]],
    sideTitle: "分析维度", sideNote: "按账户、SIM、国家、套餐、供应商聚合。", sideItems: [["地区排行", "欧洲区增长最快"], ["Top SIM", "前 10 占 18% 用量"], ["Rating 重跑", "需要审批并保留版本"]],
  }),
  accounts: () => renderGenericView({
    title: "账户与客户", subtitle: "管理平台、Reseller、客户和子账户的状态、权限与套餐授权。", primary: "创建下级账户",
    metrics: [["客户账户", "312", "Active 298"], ["Reseller", "26", "最大 3 级"], ["信用冻结", "7", "限制新开通", "warning"]],
    tableTitle: "账户树", tableNote: "同时展示业务状态、风控状态和财务状态。",
    headers: ["账户", "类型", "业务状态", "风控", "账务", "下级"],
    rows: [["Reseller East", "reseller", status("active"), "normal", "current", "38"], ["FleetLink CN", "customer", status("active"), "normal", "current", "4"], ["EVBox Trial", "customer", status("suspended"), "credit_hold", "overdue", "0"]],
    sideTitle: "状态与限制", sideNote: "上级限制可继承到下级。", sideItems: [["套餐权限", "只能分配已授权套餐"], ["API Scope", "绑定账户树范围"], ["恢复条件", "清除冻结、补齐账务、重新审核"]],
  }),
  billing: () => renderGenericView({
    title: "Billing 账单", subtitle: "自动生成、审批、发布和发送客户账单，支持明细和 CDR 下载。", primary: "创建账单运行",
    metrics: [["本月收入", "¥3.86M", "毛利率 31.5%"], ["待审批账单", "24", "Preview"], ["逾期账单", "9", "需催收", "warning"]],
    tableTitle: "账单中心", tableNote: "Draft、Preview、Issued、Sent、Paid 全流程跟踪。",
    headers: ["账单号", "账户", "周期", "状态", "金额", "到期日"],
    rows: [["INV-202606-0012", "FleetLink CN", "2026-06", status("pending"), "¥128,400", "2026-07-15"], ["INV-202606-0013", "EVBox", "2026-06", status("failed"), "¥9,820", "逾期"]],
    sideTitle: "账单操作", sideNote: "发布后不可改金额，使用调整单修正。", sideItems: [["审批发布", "需要 Finance 权限"], ["邮件发送", "附 PDF、CSV、CDR 链接"], ["供应商对账", "成本与内部 Rating 差异"]],
  }),
  batch: () => renderGenericView({
    title: "批量任务", subtitle: "上传、校验、预览、审批、执行和下载逐行结果。", primary: "上传批量文件",
    metrics: [["运行中", "12", "队列正常"], ["待审批", "5", "高风险操作"], ["失败行", "37", "可重试", "warning"]],
    tableTitle: "任务列表", tableNote: "每行独立状态，支持失败重试。",
    headers: ["任务", "类型", "状态", "总数", "成功", "失败"],
    rows: [["JOB-9021", "套餐变更", status("pending"), "86", "0", "0"], ["JOB-9018", "eSIM 启用", status("active"), "420", "401", "19"]],
    sideTitle: "执行阶段", sideNote: "上传 -> 校验 -> 审批 -> 执行 -> 结果。", sideItems: [["影响预览", "展示不可执行对象和原因"], ["审批", "批量终止必须审批"], ["幂等", "每行记录 operation_id"]],
  }),
  suppliers: () => renderGenericView({
    title: "资源方", subtitle: "管理供应商 API、产品目录、CDR 文件、对账和 SLA。", primary: "同步产品",
    metrics: [["供应商", "18", "在线 16"], ["API 成功率", "98.9%", "24h"], ["CDR 积压", "3 files", "需关注", "warning"]],
    tableTitle: "供应商列表", tableNote: "一个供应商异常不应影响其他供应商。",
    headers: ["供应商", "类型", "状态", "成功率", "CDR 延迟", "最后同步"],
    rows: [["Global Roam Hub", "aggregator", status("active"), "99.3%", "8m", "09:10"], ["EU Data Pool", "mvno", status("failed"), "82.0%", "41m", "08:48"]],
    sideTitle: "鉴权配置", sideNote: "密钥必须加密存储并支持轮换。", sideItems: [["Token 轮换", "到期前 7 天提醒"], ["API 日志", "记录 latency 和 hash"], ["熔断", "连续失败后降级"]],
  }),
  api: () => renderGenericView({
    title: "API 与 Webhook", subtitle: "为客户提供 OAuth Client、API Scope、Webhook 订阅和调用统计。", primary: "创建 API Client",
    metrics: [["API Clients", "64", "Active"], ["Webhook 订阅", "142", "成功率 99.1%"], ["限流命中", "28", "24h", "warning"]],
    tableTitle: "API Clients", tableNote: "密钥创建后只展示一次，之后必须遮罩。",
    headers: ["Client", "账户范围", "Scopes", "状态", "最后调用"],
    rows: [["fleetlink-prod", "FleetLink CN", "sim.read sim.operate", status("active"), "2m ago"], ["evbox-test", "EVBox Trial", "usage.read", status("suspended"), "3d ago"]],
    sideTitle: "Webhook", sideNote: "签名、重放保护和失败重试。", sideItems: [["事件", "sim.activated, invoice.issued"], ["签名", "HMAC SHA-256"], ["测试推送", "不发送真实客户数据"]],
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
    rows: [["09:42", "scott", "sim.terminate.preview", "898604...1842", "10.0.2.18", "corr_8f21"], ["09:31", "api:fleetlink", "cdr.export", "account", "10.0.8.11", "corr_72aa"]],
    sideTitle: "合规导出", sideNote: "导出需要权限并记录原因。", sideItems: [["不可篡改", "审计不允许普通管理员删除"], ["字段脱敏", "Token、手机号按策略遮罩"], ["保留策略", "按租户和司法辖区配置"]],
  }),
};

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

function openConfirm(action) {
  pendingAction = action;
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
    button.addEventListener("click", () => openConfirm(button.dataset.action));
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
  const filterForm = main.querySelector("#simFilterForm");
  if (filterForm) {
    filterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      showToast("筛选已应用。");
    });
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

confirmDialog.addEventListener("close", () => {
  if (confirmDialog.returnValue !== "confirm") return;
  if (pendingAction === "terminate" && typedConfirm.value !== "TERMINATE") {
    typedConfirmError.textContent = "请输入 TERMINATE 才能终止服务。";
    confirmDialog.showModal();
    return;
  }
  showToast(`操作已受理，Operation ID：op_${Math.random().toString(16).slice(2, 10)}`);
});

document.querySelector("#acceptCookies").addEventListener("click", () => {
  document.querySelector("#cookieBanner").classList.add("hidden");
  showToast("Cookie 偏好已保存：同意体验指标。");
});

document.querySelector("#rejectCookies").addEventListener("click", () => {
  document.querySelector("#cookieBanner").classList.add("hidden");
  showToast("Cookie 偏好已保存：仅必要 Cookie。");
});

render();
