# CMP OpenAPI 接口清单

## 1. API 总体规范

基础路径：

```text
/api/v1
```

认证方式：

- 管理后台：Session/OIDC。
- 客户开放 API：OAuth2 Client Credentials。
- 服务间调用：mTLS 或内部 JWT。

通用 Header：

- `Authorization: Bearer <token>`
- `Idempotency-Key: <uuid>`，用于写操作。
- `X-Correlation-Id: <uuid>`，调用方可传，不传则平台生成。
- `X-Account-Id: <account_id>`，当一个 API Client 有多个账户范围时使用。

通用响应：

```json
{
  "request_id": "req_123",
  "correlation_id": "corr_123",
  "data": {},
  "error": null
}
```

分页：

```text
?page=1&page_size=50&sort=-created_at
```

错误码分类：

- `AUTH_` 鉴权认证。
- `PERM_` 权限不足。
- `VALIDATION_` 参数或业务校验失败。
- `RESOURCE_` 资源不存在或状态不允许。
- `SUPPLIER_` 供应商调用失败。
- `BILLING_` 计费账单错误。
- `RATE_LIMIT_` 限流。

## 2. Account API

### GET /accounts

查询账户列表。

参数：

- parent_id
- account_type
- status
- keyword

### POST /accounts

创建账户。Reseller 可在授权范围内创建下级账户。

请求字段：

- parent_account_id
- account_name
- account_type
- currency
- timezone
- billing_profile
- credit_limit_amount

### GET /accounts/{account_id}

获取账户详情。

### PATCH /accounts/{account_id}

更新账户基础信息。

### GET /accounts/{account_id}/tree

获取账户树。

### POST /accounts/{account_id}/suspend

暂停账户。

### POST /accounts/{account_id}/resume

恢复账户。

### POST /accounts/{account_id}/submit-review

提交账户审核。

### POST /accounts/{account_id}/approve

审批账户，使账户进入 active 状态。

### POST /accounts/{account_id}/close

关闭账户。关闭前需要校验未完成账单、活跃 SIM、未完成批量任务和下级账户状态。

## 3. User And Permission API

### GET /users

查询用户。

### POST /users

创建用户。

### PATCH /users/{user_id}

更新用户。

### POST /users/{user_id}/roles

给用户分配角色。

### POST /users/invitations

邀请用户加入账户。

### POST /users/{user_id}/lock

锁定用户。

### POST /users/{user_id}/deactivate

停用用户并撤销登录 Session、Token 和审批权限。

### GET /roles

查询角色列表。

### POST /roles

创建自定义角色。

### GET /permissions

查询权限点。

## 4. SIM API

### GET /sims

查询 SIM/码号列表。

过滤参数：

- account_id
- iccid
- imsi
- msisdn
- eid
- status
- supplier_id
- country
- package_id
- sim_group_id

### POST /sims/import

导入 SIM 库存，通常返回 batch_job_id。

### GET /sims/{sim_id}

获取 SIM 详情。

### PATCH /sims/{sim_id}

更新 SIM 标签、分组、备注、策略等非关键属性。

### POST /sims/{sim_id}/activate

激活 SIM。

### POST /sims/{sim_id}/suspend

暂停 SIM。

### POST /sims/{sim_id}/resume

恢复 SIM。

### POST /sims/{sim_id}/terminate

销户 SIM。

### POST /sims/operation-preview

号码操作预览。用于激活、暂停、恢复、终止、批量操作前的影响评估。

请求字段：

- operation_type: activate, suspend, resume, terminate, change_package
- sim_ids
- package_id，可选
- effective_mode，可选

响应字段：

- eligible_count
- blocked_count
- blocked_reasons
- billing_impact
- approval_required
- status_distribution

### GET /sim-operations/{operation_id}

查询号码服务操作状态。

### POST /sims/{sim_id}/change-package

变更套餐。

### GET /sims/{sim_id}/usage

查询 SIM 用量。

### GET /sims/{sim_id}/cdrs

查询 SIM 标准 CDR。

### GET /sims/{sim_id}/diagnostics

查询网络诊断信息。

## 5. eSIM API

### GET /euiccs

查询 eUICC/eID。

### POST /euiccs

登记 eID。

### GET /esim-profiles

查询 eSIM Profile。

参数：

- account_id
- iccid
- imsi
- msisdn
- eid
- profile_state
- supplier_id

### POST /esim-profiles/import

导入 Profile 库存。

### GET /esim-profiles/{profile_id}

获取 Profile 详情。

### POST /esim-profiles/{profile_id}/allocate

分配 Profile 给账户、SIM 或 eID。

### POST /esim-profiles/{profile_id}/download

发起 Profile 下载。

### POST /esim-profiles/{profile_id}/enable

启用 Profile。

### POST /esim-profiles/{profile_id}/disable

禁用 Profile。

### POST /esim-profiles/{profile_id}/delete

删除 Profile。

### POST /esim-profiles/{profile_id}/release

释放 Profile。

### POST /esim-profiles/{profile_id}/refresh-status

刷新供应商/eUICC 状态。

### GET /esim-operations/{operation_id}

查询 eSIM 操作状态。

## 6. Package API

### GET /packages

查询套餐。

### POST /packages

创建套餐。

### GET /packages/{package_id}

获取套餐详情。

### PATCH /packages/{package_id}

更新套餐基础信息。

### POST /packages/{package_id}/rate-plans

创建价格版本。

### GET /packages/{package_id}/rate-plans

查询价格版本。

### POST /subscriptions

给 SIM 或账户开通套餐。

### GET /subscriptions

查询订阅。

### POST /subscriptions/{subscription_id}/cancel

关闭订阅。

### POST /subscriptions/{subscription_id}/change

变更订阅套餐。

### POST /packages/{package_id}/submit-review

提交套餐审核。

### POST /packages/{package_id}/publish

发布套餐。

### POST /packages/{package_id}/deprecate

标记套餐不推荐新购，存量可继续。

### POST /packages/{package_id}/retire

下架套餐，不允许新开通和续期。

### POST /subscriptions/operation-preview

订阅开通、变更、取消前的费用和状态影响预览。

### GET /usage-pools

查询流量池。

### GET /usage-pools/{pool_id}

查询流量池详情。

## 7. Usage And CDR API

### GET /usage/summary

查询用量汇总。

参数：

- account_id
- sim_group_id
- start_time
- end_time
- granularity: hour, day, month
- group_by: account, sim, country, package, supplier

### GET /cdrs

查询统一 CDR。

### POST /cdrs/export

创建 CDR 导出任务。

### GET /cdr-export-jobs/{job_id}

查询 CDR 导出任务。

## 8. Supplier API

### GET /suppliers

查询供应商。

### POST /suppliers

创建供应商。

### PATCH /suppliers/{supplier_id}

更新供应商。

### POST /suppliers/{supplier_id}/credentials

创建供应商鉴权配置。

### POST /suppliers/{supplier_id}/sync-products

同步供应商产品。

### GET /suppliers/{supplier_id}/api-logs

查询供应商调用日志。

### POST /suppliers/{supplier_id}/cdr-imports

手工触发 CDR 拉取或导入。

## 9. Billing API

### GET /billing-profiles/{account_id}

查询账户 Billing Profile。

### PATCH /billing-profiles/{account_id}

更新 Billing Profile。

### POST /invoice-runs

创建账单运行任务。

请求字段：

- account_id
- period_start
- period_end
- mode: preview, final

### GET /invoice-runs/{run_id}

查询账单运行状态。

### GET /invoices

查询账单。

### GET /invoices/{invoice_id}

获取账单详情。

### POST /invoices/{invoice_id}/approve

审批账单。

### POST /invoices/{invoice_id}/send

发送账单邮件。

### GET /invoices/{invoice_id}/download

下载账单 PDF。

### GET /invoices/{invoice_id}/lines

查询账单明细。

## 10. Batch Job API

### POST /batch-jobs

创建批量任务。

类型：

- sim_import
- esim_profile_import
- sim_activate
- sim_suspend
- package_change
- esim_operation
- cdr_reprocess
- account_import

### GET /batch-jobs

查询批量任务。

### GET /batch-jobs/{job_id}

获取任务详情。

### GET /batch-jobs/{job_id}/items

查询逐行结果。

### POST /batch-jobs/{job_id}/approve

审批并开始执行。

### POST /batch-jobs/{job_id}/cancel

取消任务。

### POST /batch-jobs/{job_id}/retry

重试失败项。

## 11. Dashboard API

### GET /dashboard/overview

平台或客户总览。

### GET /dashboard/usage

用量趋势。

### GET /dashboard/esim-operations

eSIM 操作统计。

### GET /dashboard/supplier-health

供应商健康状态。

### GET /dashboard/billing

收入、成本、毛利、待支付账单。

## 12. Webhook API

### GET /webhook-subscriptions

查询 Webhook 订阅。

### POST /webhook-subscriptions

创建订阅。

事件类型：

- `sim.activated`
- `sim.suspended`
- `sim.terminated`
- `esim.operation.succeeded`
- `esim.operation.failed`
- `usage.threshold_reached`
- `invoice.issued`
- `batch_job.completed`

### POST /webhook-subscriptions/{id}/test

发送测试事件。

### DELETE /webhook-subscriptions/{id}

删除订阅。

## 13. Audit API

### GET /audit-logs

查询审计日志。

参数：

- account_id
- actor_id
- action
- resource_type
- resource_id
- start_time
- end_time
