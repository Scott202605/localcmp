# CMP 平台设计文档目录

本目录用于沉淀物联网 CMP 连接管理平台的产品、前端、后端、数据和接口设计。

## 阅读顺序

1. [CMP平台中文总体设计.md](CMP平台中文总体设计.md)
   - 面向业务、产品、架构和研发的总体方案。
   - 覆盖 eSIM、SIM、资源方、套餐、账户、Billing、Dashboard、批量操作、Settings、API、云架构和 SLA。

2. [数据库ERD与核心表设计.md](数据库ERD与核心表设计.md)
   - 面向后端和数据库设计。
   - 包含 Mermaid ERD、账户、权限、供应商、SIM、eSIM、套餐、CDR、Rating、Billing、批量任务和审计核心表。

3. [OpenAPI接口清单.md](OpenAPI接口清单.md)
   - 面向前后端联调、客户集成和 API 产品化。
   - 包含 Account、User、SIM、eSIM、Package、Usage、CDR、Supplier、Billing、Batch、Dashboard、Webhook、Audit API。

4. [前端页面信息架构及模型.md](前端页面信息架构及模型.md)
   - 面向产品、设计和前端。
   - 包含导航结构、列表页、详情页、操作抽屉、配置向导、Dashboard、Billing、批量任务和前端状态模型。

5. [后端服务落地方案.md](后端服务落地方案.md)
   - 面向架构和后端落地。
   - 包含服务拆分、异步事件、eSIM 状态机、CDR 处理、Rating、Billing、批量任务、部署、安全和观测。

6. [账户用户权限套餐与号码状态深化设计.md](账户用户权限套餐与号码状态深化设计.md)
   - 面向产品、架构、后端、前端和测试。
   - 深化账户、用户、权限、套餐、订阅、流量池、SIM/号码激活、暂停、恢复、终止的状态与切换逻辑。

7. [CMP_Platform_Design.md](CMP_Platform_Design.md)
   - 英文版初始蓝图。
   - 可用于对外英文沟通或后续整理英文方案。

8. [设计补充与实施路线.md](设计补充与实施路线.md)
   - 对当前阶段一落地能力、横切架构、权限模型和下一步实现优先级进行补充。

9. [API详细文档.md](API详细文档.md)
   - 面向前后端联调、客户集成和测试，细化当前已实现 API 的请求、响应和业务规则。

10. [用户使用手册.md](用户使用手册.md)
    - 面向平台运营、Reseller、客户管理员和财务用户，说明日常使用流程。

11. [运维手册.md](运维手册.md)
    - 面向部署、监控、告警、备份恢复、发布和故障处理。

12. [openapi.localcmp.yaml](openapi.localcmp.yaml)
    - 当前阶段一 API 的 OpenAPI 3.1 初稿，便于客户集成和后续生成 SDK。

13. [前端云端部署说明.md](前端云端部署说明.md)
    - 面向前端部署和联调人员，说明同源部署、前后端分离部署、HTTPS、安全、缓存、回滚和常见问题。

## 后续建议补充

- PRD：按模块拆分用户故事和验收标准。
- OpenAPI YAML：从接口清单生成正式 OpenAPI 3.1 文件。
- 数据库迁移：将 `database/schema.sql` 拆分为可执行 migration 和 seed。
- 前端原型：基于页面信息架构制作可交互原型。
- 架构图：补充部署拓扑、事件流、CDR 流、Billing 流和 eSIM 操作流。
- 测试方案：补充 CDR、Rating、Billing、eSIM 状态机和权限模型测试用例。


## Current Implementation Addendum

- [??????-???????????.md](??????-???????????.md)
  - Covers the latest account scope search, account/user creation rules, backend Scope Guard, API additions, user workflow, and deployment validation checklist.
