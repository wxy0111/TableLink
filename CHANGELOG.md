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

- 新增 TableLink 品牌 logo，并写入 README 顶部展示。
- 店长后台看板 `/admin` 顶部加入 TableLink logo 品牌标识。
- logo 最终采用二维码科技风格：深色科技底、扫描角、二维码模块和青绿色连接元素。
- 新增员工 PIN 登录页 `/login`。
- 新增轻量 HMAC token 认证，支持 cookie 和 Bearer token。
- 新增角色权限：
  - 老板/店长可访问后台、菜单、桌台、备份、日结。
  - 收银/服务员可访问前厅收银相关接口。
  - 后厨可访问厨房接口。
  - 未登录访问受保护接口返回 401。
  - 角色不匹配返回 403。
- 新增日结对账页 `/admin/daily-closing`：
  - 营业额
  - 实收
  - 退款
  - 退菜
  - 未结订单
  - 支付方式汇总
  - 操作流水
  - 打印任务
- 新增日结对账接口 `GET /api/admin/reports/daily-closing`。
- 新增 `scripts/verify-auth-closing-flow.mjs`，用于验证登录、权限和日结接口。
- 新增前厅真实工作流：
  - 开台
  - 换桌
  - 并桌
  - 清台
  - 收银台加菜
  - 退菜
  - 催菜
  - 等叫/恢复制作
  - 组合支付
  - 退款记录
- 新增 `audit_logs` 操作审计基础表。
- 新增 `print_jobs` 打印任务基础表。
- 新增 `held` 菜品等叫状态。
- 新增 `scripts/verify-frontdesk-flow.mjs`，用于验证前厅真实工作流。
- 新增后台菜品管理页 `/admin/menu`：
  - 管理菜品分类
  - 新增和编辑菜品
  - 设置价格、档口、上下架、推荐菜
  - 上传菜品图片
- 新增 API 静态上传目录 `/uploads`，用于展示后台上传的菜品图片。
- 新增桌台二维码管理页 `/admin/tables`：
  - 查看桌台列表
  - 生成桌台点餐二维码
  - 支持新增桌台
- 新增初始化向导 `/setup`：
  - 设置店名
  - 设置桌台数量
  - 初始化基础桌台数据
- 新增数据备份/恢复页 `/admin/backups`：
  - 导出门店、桌台、分类、菜品、规格数据
  - 从 JSON 文件恢复基础配置数据
- 新增 SQLite 可选模式调研文档 `docs/sqlite-mode-research.md`。
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
- `npm.cmd run verify:frontdesk-flow` 通过。
- `npm.cmd run verify:auth-closing-flow` 通过。
- `/login`、`/admin/daily-closing` 返回 HTTP 200。
- 收银台 `/staff` 支持开台、换桌、并桌、清台、加菜、退菜、催菜、等叫、收款和退款。
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
