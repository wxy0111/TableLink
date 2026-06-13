# 更新日志

## 2026-06-14

### 产品定位

- 明确项目面向中小型饭店本地部署。
- 明确一台本地 PC 作为店内服务器。
- 明确顾客手机扫码访问局域网网页点餐。
- 明确后厨和收银使用平板访问订单信息。
- 明确店长/老板拥有全量信息和报表权限。
- 明确项目坚持开源免费优先。
- 明确支付方向支持微信/支付宝。
- 明确智能总结暂不做，优先提供日/周/月/季度/年结构化经营信息。

### 新增

- 新增本地 PC 局域网部署适配：
  - API 监听 `0.0.0.0`
  - Web 监听 `0.0.0.0`
  - Next.js rewrites 将同源 `/api` 代理到 NestJS API
  - 避免顾客手机访问 `localhost:3001`
- 新增系统局域网访问接口 `GET /api/system/local-access`。
- 新增店长后台 `/admin`：
  - 营业额
  - 已收款
  - 未收款
  - 订单数
  - 客单价
  - 营业桌台
  - 支付方式统计
  - 热销菜品
  - 未收款订单
  - 局域网访问地址
- 新增结构化周期报表接口 `GET /api/admin/reports/summary`。
- 新增收银支付接口 `POST /api/staff/orders/:orderId/payments`。
- 收银台支持记录 `微信`、`支付宝`、`现金` 收款。
- 新增顾客呼叫服务员：
  - `POST /api/public/tables/:code/service-calls`
  - `GET /api/public/tables/:code/service-calls/current`
- 新增服务员面板 `/service`：
  - 查看顾客呼叫和桌号
  - 响应呼叫
  - 处理呼叫
  - 查看后厨已出餐菜品
  - 确认菜品已上桌
- 新增厨房任务视图：
  - `GET /api/kitchen/orders/tasks`
  - 每道菜显示等待时长、颜色、优先级、本桌最后一道标记
  - 支持开始制作和出餐确认
- 新增 `service_calls` 数据表。
- 新增 `order_items` 时间字段：
  - `cooking_started_at`
  - `ready_at`
  - `served_at`
- 新增 `scripts/verify-service-flow.mjs`，用于验证顾客呼叫、厨房出餐、服务员上桌全链路。
- 初始化小店扫码点餐系统 monorepo。
- 新增 `apps/api` NestJS 后端。
- 新增 `apps/web` Next.js 前端。
- 新增 PostgreSQL Docker Compose 配置。
- 新增 Prisma 数据模型和首个数据库迁移。
- 新增系岛食堂 seed 数据：
  - 11 张桌台，code 为 `TABLE-01` 到 `TABLE-11`
  - 11 个菜品分类
  - 33 个常见川菜、主食、饮品和套餐
- 新增顾客桌台菜单页 `/table/TABLE-01`。
- 新增顾客购物车、数量加减、备注和提交订单能力。
- 新增厨房屏 `/kitchen`，可查看待处理订单和菜品明细。
- 新增收银台 `/staff`，可查看桌台状态和未结订单。
- 新增 `scripts/verify-order-flow.mjs`，用于验证点餐主链路。
- 新增 Windows 启动脚本：
  - `scripts/dev-api.cmd`
  - `scripts/dev-web.cmd`

### 验证

- `npm.cmd run typecheck` 通过。
- `npm.cmd run verify:order-flow` 通过。
- `npm.cmd run verify:service-flow` 通过。
- `/service` 服务员面板返回 HTTP 200。
- 厨房任务接口返回等待时长、优先级和颜色状态。
- Next 同源 `/api` 代理通过。
- 店长后台 `/admin` 返回 HTTP 200。
- 支付宝收款测试通过，订单状态更新为 `paid`，桌台状态返回 `paying`。
- 日报支付方式统计能统计微信和支付宝收款。
- PostgreSQL 容器运行状态为 `healthy`。
- 前端首页、桌台页、厨房屏、服务员面板、收银台、店长后台均返回 HTTP 200。
- 后端桌台接口能返回 `TABLE-01` / `A01` / `系岛食堂`。
- 创建测试订单后，厨房接口能看到对应订单。

### 环境

- Node.js：`v24.16.0`
- npm：`11.13.0`
- Git：`2.54.0`
- Docker Desktop：`29.5.3`
- Docker Compose：`v5.1.4`

### 注意事项

- PowerShell 下建议使用 `npm.cmd`，避免执行策略拦截 `npm.ps1`。
- `verify:order-flow` 会创建真实测试订单，并将对应桌台状态更新为 `dining`。
