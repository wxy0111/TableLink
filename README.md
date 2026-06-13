# TableLink

TableLink 是一个面向中小型饭店的本地部署扫码点餐系统。当前项目以“系岛食堂”为示例门店，目标是在店内用一台本地 PC 作为服务器，让顾客、后厨、收银和店长都通过局域网网页完成日常堂食流程。

```txt
本地 PC 服务器 -> 顾客扫码点菜 -> 后厨平板出餐 -> 收银平板结账 -> 店长查看经营信息
```

项目坚持开源免费优先。第一版刻意不做会员、库存、优惠券、外卖、多门店和智能总结，先把菜单、桌台、订单、厨房屏、收银台、基础财报这条主链路做稳。微信/支付宝支付会作为支付能力接入，但需要由实际门店配置商户号、密钥、证书和回调策略。

## 产品定位

```txt
部署方式：一台 Windows 本地 PC 作为店内服务器
访问方式：店内局域网访问网页
顾客设备：手机扫码进入桌台菜单
后厨设备：平板或厨房屏查看订单和更新出餐状态
收银设备：平板或电脑处理结账、支付、清台
管理设备：店长/服务器端查看全部订单、菜单、员工和经营数据
支付方向：支持微信支付、支付宝支付、现金等方式
报表方向：日/周/月/季度/年周期经营信息统计
智能总结：暂不做，只展示结构化经营数据
```

## 当前状态

已完成：

- Next.js 前端骨架
- NestJS 后端骨架
- PostgreSQL + Prisma 数据库模型
- Docker Compose 本地数据库
- 系岛食堂 seed 数据
- 顾客桌台菜单页
- 顾客购物车和提交订单
- 顾客呼叫服务员
- 厨房任务优先级列表
- 厨房开始制作和出餐确认
- 服务员面板
- 服务员处理顾客呼叫
- 服务员确认菜品已上桌
- 收银桌台状态页
- 前厅开台、换桌、并桌、清台
- 收银台加菜、退菜、催菜、等叫
- 收银台微信/支付宝/现金收款记录
- 组合支付和退款记录
- 操作流水和审计日志基础表
- 打印任务基础模型
- 店长后台经营信息页
- 后台菜品分类和菜品管理页
- 菜品图片上传
- 桌台二维码生成和查看
- 初始化向导
- 数据备份/恢复
- 局域网访问地址展示
- 点餐主链路验证脚本

规划中：

- 微信/支付宝正式商户支付网关
- SQLite 轻量安装模式试验

当前可访问页面：

```txt
http://localhost:3000
http://localhost:3000/table/TABLE-01
http://localhost:3000/kitchen
http://localhost:3000/service
http://localhost:3000/staff
http://localhost:3000/admin
http://localhost:3000/admin/menu
http://localhost:3000/admin/tables
http://localhost:3000/admin/backups
http://localhost:3000/setup
```

局域网部署时，顾客和平板访问本地 PC 的局域网 IP，例如：

```txt
http://192.168.1.20:3000/table/TABLE-01
http://192.168.1.20:3000/kitchen
http://192.168.1.20:3000/service
http://192.168.1.20:3000/staff
http://192.168.1.20:3000/admin
```

## 技术栈

```txt
前端：Next.js + React + TypeScript
后端：NestJS + TypeScript
数据库：PostgreSQL
ORM：Prisma
容器：Docker Compose
包管理：npm workspaces
前端 API 访问：Next.js rewrites 代理 /api 到本地 API 服务
```

## 端和角色

```txt
顾客端 /table/:code
  无需登录，只能基于桌台二维码点餐、加菜、查看订单状态。

厨房端 /kitchen
  后厨员工使用，按菜品等待时长和优先级制作，负责开始制作和出餐确认。

服务员端 /service
  服务员使用，负责查看顾客呼叫、已出餐菜品，并确认已响应、已处理、已上桌。

收银/服务员端 /staff
  服务员和收银使用，负责桌台状态、加菜、退菜、结账、清台。

店长后台 /admin
  店长/老板使用，负责菜单、桌台、员工、订单、支付、报表。
```

权限方向：

```txt
customer   顾客，无账号
kitchen    后厨
waiter     服务员
cashier    收银
manager    店长
owner      老板/最高权限
```

## 项目结构

```txt
apps/
  api/                 NestJS 后端 API
  web/                 Next.js 前端

prisma/
  schema.prisma        数据库模型
  seed.ts              系岛食堂测试数据
  migrations/          Prisma 迁移文件

scripts/
  dev-api.cmd          Windows 后端启动脚本
  dev-web.cmd          Windows 前端启动脚本
  verify-order-flow.mjs 点餐主链路验证脚本
  verify-service-flow.mjs 后厨/服务员协同验证脚本
  verify-frontdesk-flow.mjs 前厅开台/换桌/并桌/退菜/收退款验证脚本

docs/
  architecture-v1.md   第一版架构设计
  api-v1.md            第一版 API 设计
  development-plan-v1.md 开发计划
  local-setup.md       本地环境和启动说明
```

## 本机环境

当前开发机已安装并验证：

```txt
Node.js：v24.16.0
npm：11.13.0
Git：2.54.0
Docker Desktop：29.5.3
Docker Compose：v5.1.4
```

PowerShell 下建议使用 `npm.cmd`，避免系统执行策略拦截 `npm.ps1`。

## 环境变量

首次启动前复制环境变量：

```powershell
Copy-Item .env.example .env
```

当前 `.env.example`：

```txt
DATABASE_URL="postgresql://order_user:order_password@localhost:5432/order_system?schema=public"
API_PORT=3001
WEB_PORT=3000
API_PROXY_TARGET="http://localhost:3001"
PUBLIC_WEB_BASE_URL="http://localhost:3000"
```

`PUBLIC_WEB_BASE_URL` 用于生成桌台二维码。正式在店内局域网使用时，建议改成本机局域网地址，例如 `http://192.168.1.20:3000`。

## 启动方式

进入项目目录：

```powershell
cd C:\Users\90765\OneDrive\文档\order_system
```

启动 PostgreSQL：

```powershell
docker compose up -d
```

安装依赖：

```powershell
npm.cmd install
```

生成 Prisma Client：

```powershell
npm.cmd run db:generate
```

执行数据库迁移：

```powershell
npm.cmd run db:migrate
```

写入测试数据：

```powershell
npm.cmd run db:seed
```

启动后端：

```powershell
npm.cmd run dev:api
```

另开一个 PowerShell 启动前端：

```powershell
npm.cmd run dev:web
```

也可以使用 Windows 启动脚本：

```powershell
scripts\dev-api.cmd
scripts\dev-web.cmd
```

本地 PC 作为店内服务器时，需要确认：

```powershell
ipconfig
```

找到本机局域网 IPv4 地址后，让顾客和平板访问：

```txt
http://本机局域网IP:3000
```

如果其他设备无法访问，需要检查 Windows 防火墙是否放行 Node.js / 3000 / 3001 端口。

## 验证方式

类型检查：

```powershell
npm.cmd run typecheck
```

点餐主链路验证：

```powershell
npm.cmd run verify:order-flow
```

该脚本会使用 `TABLE-02` 创建一笔测试订单，并确认厨房接口能看到订单。

后厨/服务员协同验证：

```powershell
npm.cmd run verify:service-flow
```

该脚本会使用 `TABLE-04` 创建一笔测试订单，呼叫服务员，厨房开始制作并出餐，服务员确认已上桌并处理呼叫。

前厅真实工作流验证：

```powershell
npm.cmd run verify:frontdesk-flow
```

该脚本会验证开台、加菜、等叫、催菜、退菜、组合支付、退款、换桌、并桌、清台、审计日志和打印任务基础模型。

## 厨房优先级规则

厨房屏按菜品任务排序，而不是只按整单排序。每道菜都会计算等待时间和优先级：

```txt
0 - 5 分钟：绿色
5 - 10 分钟：黄色
10 - 20 分钟：橙色
20 分钟以上：红色
本桌最后一道未出菜：加分
该桌有未处理呼叫：加分
已开始制作：加分
```

后厨操作流：

```txt
submitted / accepted -> cooking -> ready
```

服务员操作流：

```txt
ready -> served
```

手动验证收银支付：

```txt
1. 打开 /table/TABLE-01 创建订单
2. 打开 /staff
3. 点击微信、支付宝或现金
4. 打开 /admin 查看已收款、支付方式统计
```

## Seed 数据

当前 seed 包含：

- 店名：系岛食堂
- 桌台：A01 到 A11
- 桌台二维码 code：TABLE-01 到 TABLE-11
- 菜品分类：11 个
- 菜品：33 个常见川菜、主食、饮品和套餐

## 支付设计方向

当前程序已支持记录微信、支付宝、现金等支付方式，并将订单标记为已支付：

```txt
cash
wechat
alipay
card
other
```

正式接入微信/支付宝商户支付网关时，需要补充：

```txt
商户号
应用 ID
API 密钥或证书
支付回调地址
退款权限
支付结果轮询或回调确认
```

对于纯本地部署，如果公网无法直接回调到店内 PC，需要选择：

```txt
方案 A：收银台扫码枪/收款码，系统手动标记已支付
方案 B：内网穿透或云端回调中转
方案 C：先记录支付方式和金额，后续再接正式支付网关
```

当前优先按开源免费、本地可用的方案推进。

## 报表设计方向

先做结构化经营信息，不做智能总结：

```txt
日报
周报
月报
季度报
年报
营业额
订单数
客单价
支付方式统计
热销菜品
退菜/取消金额
未支付订单
桌台翻台情况
```

## 文档

- [系统架构](docs/architecture-v1.md)
- [API 设计](docs/api-v1.md)
- [开发计划](docs/development-plan-v1.md)
- [本地环境和启动](docs/local-setup.md)
- [SQLite 可选模式调研](docs/sqlite-mode-research.md)
- [更新日志](CHANGELOG.md)
