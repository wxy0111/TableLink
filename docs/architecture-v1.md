# 第一版系统架构

## 产品目标

第一版面向中小型饭店的本地部署堂食扫码点餐闭环：

```txt
本地 PC 服务器 -> 顾客扫码点菜 -> 厨房接单 -> 出餐 -> 收银结账 -> 店长查看经营信息
```

系统默认运行在店内局域网。顾客、后厨平板、收银平板和店长电脑都访问同一台本地 PC 提供的 Web 和 API 服务。

## 部署拓扑

```txt
本地 PC
  - Next.js Web
  - NestJS API
  - PostgreSQL
  - Docker Desktop / Docker Compose

顾客手机
  - 扫桌台二维码
  - 访问 http://本地PC局域网IP:3000/table/:tableCode

后厨平板
  - 访问 http://本地PC局域网IP:3000/kitchen

收银/服务员平板
  - 访问 http://本地PC局域网IP:3000/staff

店长/老板
  - 访问 http://本地PC局域网IP:3000/admin
```

## 端设计

### 顾客点餐端

路由建议：

```txt
/table/:tableCode
/table/:tableCode/order/:orderId
```

核心能力：

- 通过桌台二维码进入菜单
- 浏览分类和菜品
- 选择规格、口味、加料和数量
- 提交订单
- 加菜
- 查看订单状态

### 厨房出餐端

路由建议：

```txt
/kitchen
```

核心能力：

- 实时显示新订单
- 按档口过滤：热菜、凉菜、饮品、主食、其他
- 标记接单、制作中、已完成
- 查看桌号、备注和菜品规格

### 服务员/收银端

路由建议：

```txt
/staff
/staff/tables/:tableId
```

核心能力：

- 查看桌台状态
- 查看桌台当前订单
- 帮客人加菜
- 退菜、取消菜品
- 结账、标记已支付
- 清台
- 微信/支付宝/现金支付记录

### 后台管理端

路由建议：

```txt
/admin
/admin/menu
/admin/categories
/admin/tables
/admin/orders
/admin/users
```

核心能力：

- 菜品分类管理
- 菜品管理、上下架、售罄
- 桌台管理和二维码
- 员工账号管理
- 订单查询和基础统计
- 支付记录查询
- 日/周/月/季度/年经营报表

## 后端模块

NestJS 模块建议：

```txt
src/
  auth/
  users/
  restaurants/
  tables/
  menu/
  orders/
  payments/
  kitchen/
  realtime/
  reports/
  prisma/
```

其中 `orders` 是核心模块。菜单、厨房、支付、打印、库存、会员后续都会围绕订单扩展。

## 状态设计

订单履约状态：

```txt
submitted -> accepted -> cooking -> ready -> served
submitted -> cancelled
accepted  -> cancelled
```

支付状态：

```txt
unpaid
partially_paid
paid
refunded
```

支付方式：

```txt
cash
wechat
alipay
card
other
```

桌台状态：

```txt
idle
occupied
dining
paying
closed
```

状态流转由后端统一校验，避免各端直接写入任意状态。当前覆盖：

```txt
订单：submitted / accepted / cooking / ready / served / paid / cancelled / refunded
菜品：submitted / accepted / held / cooking / ready / served / refunded / cancelled
支付：unpaid / partially_paid / paid / refunded
桌台：idle / occupied / dining / paying / closed
```

## 账本模型

报表和日结对账以账本为准，而不是从订单当前状态临时倒推。订单、订单菜品和支付记录仍然保留业务快照，用来展示现场流程；金额统计则写入不可覆盖的账本流水。

```txt
ledger_entries
  item_sale          下单/加菜产生的销售额
  item_void          退菜/作废抵减销售额
  payment_received   收款
  payment_refund     退款
  discount           折扣预留
  adjustment         人工调整预留
```

统一口径：

```txt
营业额 = item_sale - item_void
实收 = payment_received
退款 = payment_refund
净收款 = payment_received - payment_refund
未收款 = max(营业额 - 净收款, 0)
```

这能支撑后续微信/支付宝异步回调、部分退款、反结账、跨日统计和审计追踪。

## 关键设计原则

- 历史订单必须使用菜品名称、价格和规格快照。
- 加菜、退菜、改价、支付都要写订单事件流水；涉及金额的变化还要写账本流水。
- 打印任务失败不能影响下单成功。
- 支付状态和订单履约状态分离。
- 厨房实时推送只负责通知，最终状态以数据库为准。
- 本地局域网优先可用，不依赖公网才能完成点餐和出餐。
- 微信/支付宝支付应和订单解耦，支付失败不能破坏订单数据。
- 报表先做确定性数据统计，统一从账本模型取数，暂不做智能总结。

## 报表范围

第一版店长只需要结构化经营信息：

```txt
今日营业额
订单数量
已支付金额
未支付金额
退款/退菜金额
热销菜品
桌台翻台次数
客单价
按支付方式统计
```

周期支持：

```txt
daily
weekly
monthly
quarterly
yearly
```
