# CMP API 详细文档

## 1. 基础规范

基础路径：`/api/v1`

开发期认证 Header：

```text
X-User-Id: user_scott
X-Account-Id: acc_root
X-Correlation-Id: corr_xxx
Idempotency-Key: uuid
```

统一响应：

```json
{
  "request_id": "req_uuid",
  "correlation_id": "corr_uuid",
  "data": {},
  "error": null
}
```

## 2. 通用接口

- `GET /health`：服务健康检查。
- `GET /auth/context`：当前请求用户、账户和权限集合。
- `POST /auth/login`：使用邮箱和密码登录，返回 Bearer JWT。
- `GET /openapi`：当前阶段一的简化 OpenAPI 描述。

登录请求：

```json
{
  "email": "13911657767@139.com",
  "password": "LocalCMP@2026"
}
```

后续请求使用：

```text
Authorization: Bearer <token>
```

开发环境如需继续使用 `X-User-Id` 调试，必须显式设置 `ALLOW_HEADER_AUTH=true`。生产环境不要开启。

## 3. 账户与权限

- `GET /accounts`：账户列表，包含子账户数量和父级限制。
- `GET /accounts/tree`：账户树扁平结构。
- `POST /accounts/{accountId}/{action}`：支持 `submit-review`、`approve`、`suspend`、`resume`、`close`。
- `GET /users`：用户及其账户授权、角色绑定。
- `POST /users/{userId}/deactivate`：停用用户并写审计。
- `GET /roles`：角色及权限点。
- `GET /permissions`：权限点字典。

关闭账户前会校验是否仍存在 active 或 suspended SIM。

## 4. SIM/号码服务

- `GET /sims`：SIM/号码列表。
- `GET /sim-operations`：查询 SIM 操作记录。
- `GET /sim-operations/{operationId}`：查询单个 SIM 操作详情。
- `POST /sims/operation-preview`：预览 activate、suspend、resume、terminate。
- `POST /sims/{simId}/{action}`：提交 SIM 生命周期操作。

SIM 操作要求：

- 建议传 `Idempotency-Key`。
- SIM 库存状态必须为 `assigned` 或 `reserved`。
- 账户必须 active 且无阻断型风控/坏账状态。
- activate 时套餐必须 active 且账户有套餐授权。
- 同 SIM 不允许并发执行多个未完成操作。

## 5. 套餐、订阅、流量池

- `GET /packages`：套餐、配额 GB、订阅数和授权数。
- `POST /packages/{packageId}/{action}`：支持 `submit-review`、`publish`、`deprecate`、`restore`、`retire`、`archive`。
- `GET /package-entitlements`：账户套餐授权。
- `GET /subscriptions`：SIM 与套餐订阅关系。
- `GET /usage-pools`：共享流量池。

当 retire 影响 active 订阅时，接口返回 `approvalRequired: true` 并创建审批单。

## 5.1 eSIM Profile 最小操作

- `GET /esim-profiles`：查询 Profile 列表。
- `GET /esim-operations`：查询 eSIM 操作记录。
- `POST /esim-profiles/{profileId}/allocate`：分配 Profile 到账户/eID。
- `POST /esim-profiles/{profileId}/enable`：启用 Profile。
- `POST /esim-profiles/{profileId}/disable`：禁用 Profile。
- `POST /esim-profiles/{profileId}/release`：释放 Profile 回库存。

阶段一 eSIM 操作为模拟异步：接口立即返回 `operationId`，后台将操作置为 succeeded，并写入 outbox。真实 SM-DP+/eIM 调用后续通过 Supplier Adapter 补充。

## 6. CDR 与用量

- `GET /usage/summary`：用量 Dashboard 汇总。
- `GET /cdrs`：统一 CDR 列表。
- `POST /cdrs/import`：导入供应商 CDR 并标准化。

导入示例：

```json
{
  "records": [
    {
      "supplierRecordId": "sup-001",
      "supplierCode": "GLOBAL-ROAM",
      "iccid": "8986041020250001842",
      "country": "DE",
      "operatorName": "Telefonica",
      "totalBytes": 1048576,
      "amount": 12,
      "currency": "CNY",
      "startTime": "2026-06-14T10:00:00+08:00"
    }
  ]
}
```

## 7. Billing

- `GET /invoices`：账单列表。
- `POST /invoice-runs`：创建账单运行预览。
- `POST /invoices/{invoiceId}/send`：将账单邮件发送任务放入通知队列，并写审计日志。

## 8. 批量与审批

- `GET /batch-jobs`：批量任务及行级任务。
- `POST /batch-jobs`：创建批量任务。
- `POST /batch-jobs/{jobId}/run`：审批并执行阶段一批量任务。
- `GET /approval-requests`：审批单列表。
- `POST /approval-requests/{approvalId}/{decision}`：`decision` 为 `approve` 或 `reject`。

创建批量任务示例：

```json
{
  "jobType": "sim_suspend",
  "requiresApproval": true,
  "items": [
    { "iccid": "8986041020250001842", "reason": "customer_request" }
  ]
}
```

## 9. 运维与审计

- `GET /audit-logs`：审计日志。
- `GET /outbox-events`：领域事件。
- `GET /settings`：安全、SLA、保留周期等运行配置。

## 10. 客户集成 API

### GET `/api-clients`

查询客户 API Client。响应会返回 `secretPreview`，不会返回完整密钥。

### POST `/api-clients`

创建 API Client，并只在本次响应返回一次完整 `clientSecret`。

请求：

```json
{
  "accountId": "acc_fleetlink",
  "clientName": "fleetlink-prod",
  "scopes": ["sim.read", "sim.operate", "usage.read"]
}
```

安全要求：

- 密钥只展示一次。
- 服务端只保存 hash 和遮罩后的 preview。
- Scope 必须最小化授权。
- 生产环境必须绑定账户树范围、IP 白名单、限流策略和过期/轮换策略。

### POST `/api-clients/{clientId}/rotate`

轮换 API Client Secret。新密钥只返回一次，旧密钥应在宽限期后失效。

### POST `/api-clients/{clientId}/suspend`

暂停 API Client。暂停后不允许继续调用客户开放 API。

### GET `/webhook-subscriptions`

查询 Webhook 订阅。

### POST `/webhook-subscriptions`

创建 Webhook 订阅，并只在本次响应返回一次 `signingSecret`。

请求：

```json
{
  "accountId": "acc_fleetlink",
  "targetUrl": "https://api.example.com/cmp/webhooks",
  "eventTypes": ["sim.activated", "invoice.issued"],
  "retryPolicy": "exponential_24h"
}
```

### POST `/webhook-subscriptions/{subscriptionId}/test`

创建测试推送任务，不发送真实客户敏感数据。

### POST `/webhook-subscriptions/{subscriptionId}/delete`

逻辑删除 Webhook 订阅。

### GET `/notification-deliveries`

查询通知/Webhook 投递记录，用于排障和 SLA 统计。

Webhook 签名建议：

- Header：`X-CMP-Signature`、`X-CMP-Timestamp`、`X-CMP-Event-Id`。
- 签名内容：`timestamp + "." + raw_body`。
- 算法：HMAC-SHA256。
- 接收方必须校验时间窗口，防止重放攻击。
