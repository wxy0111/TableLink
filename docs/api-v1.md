# 第一版 API 设计

接口前缀建议：

```txt
/api
```

## 公共点餐接口

### 获取桌台信息

```http
GET /api/public/tables/:code
```

返回：

```json
{
  "id": "table_id",
  "name": "A01",
  "status": "idle",
  "restaurant": {
    "id": "restaurant_id",
    "name": "示例小店"
  }
}
```

### 获取菜单

```http
GET /api/public/restaurants/:restaurantId/menu
```

只返回 `active` 菜品，不返回已下架菜品。

### 提交订单

```http
POST /api/public/orders
```

请求：

```json
{
  "tableCode": "A01_RANDOM_CODE",
  "remark": "少油",
  "items": [
    {
      "menuItemId": "menu_item_id",
      "quantity": 2,
      "remark": "微辣",
      "options": [
        {
          "optionName": "辣度",
          "valueName": "微辣",
          "priceDelta": 0
        }
      ]
    }
  ]
}
```

服务端必须重新读取菜品价格和选项价格，不能信任前端传入的总价。

### 查看订单

```http
GET /api/public/orders/:orderId
```

### 顾客加菜

```http
POST /api/public/orders/:orderId/items
```

## 厨房接口

### 获取厨房订单

```http
GET /api/kitchen/orders?station=hot&status=submitted
```

### 更新菜品状态

```http
PATCH /api/kitchen/order-items/:orderItemId/status
```

请求：

```json
{
  "status": "cooking"
}
```

允许状态：

```txt
accepted
cooking
ready
```

### 厨房实时推送

```txt
WS /ws/kitchen
```

事件：

```txt
order.created
order.item_added
order.item_status_changed
order.cancelled
```

## 服务员/收银接口

### 获取桌台列表

```http
GET /api/staff/tables
```

### 获取桌台当前订单

```http
GET /api/staff/tables/:tableId/current-order
```

### 服务员加菜

```http
POST /api/staff/orders/:orderId/items
```

### 取消或退菜

```http
POST /api/staff/order-items/:orderItemId/cancel
```

请求：

```json
{
  "reason": "客人点错"
}
```

规则：

- 未制作菜品允许服务员取消。
- 已制作或已出餐菜品需要管理员权限。
- 所有取消和退菜必须写入 `order_events`。

### 结账

```http
POST /api/staff/orders/:orderId/payments
```

请求：

```json
{
  "method": "cash",
  "amount": 12800
}
```

金额单位建议使用分，避免浮点误差。

支付方式：

```txt
cash
wechat
alipay
card
other
```

微信/支付宝正式接入时，建议扩展为两步：

```http
POST /api/staff/orders/:orderId/payment-intents
POST /api/payments/:paymentId/confirm
```

其中 `payment-intents` 创建支付意图，`confirm` 由回调、轮询或收银台确认完成。

### 更新桌台状态

```http
PATCH /api/staff/tables/:tableId/status
```

## 后台接口

### 分类管理

```http
GET    /api/admin/categories
POST   /api/admin/categories
PATCH  /api/admin/categories/:categoryId
DELETE /api/admin/categories/:categoryId
```

### 菜品管理

```http
GET    /api/admin/menu-items
POST   /api/admin/menu-items
PATCH  /api/admin/menu-items/:menuItemId
```

菜品第一版不建议物理删除，使用上下架或归档状态。

### 桌台管理

```http
GET   /api/admin/tables
POST  /api/admin/tables
PATCH /api/admin/tables/:tableId
```

### 订单查询

```http
GET /api/admin/orders?from=2026-06-01&to=2026-06-13&status=paid
```

### 今日报表

```http
GET /api/admin/reports/daily
```

### 周期报表

```http
GET /api/admin/reports/summary?period=daily&date=2026-06-14
GET /api/admin/reports/summary?period=weekly&date=2026-06-14
GET /api/admin/reports/summary?period=monthly&date=2026-06-14
GET /api/admin/reports/summary?period=quarterly&date=2026-06-14
GET /api/admin/reports/summary?period=yearly&date=2026-06-14
```

返回方向：

```json
{
  "period": "daily",
  "grossAmount": 128000,
  "paidAmount": 120000,
  "unpaidAmount": 8000,
  "orderCount": 42,
  "averageOrderAmount": 3047,
  "refundAmount": 0,
  "topItems": [
    { "name": "麻婆豆腐", "quantity": 18, "amount": 50400 }
  ],
  "paymentMethods": [
    { "method": "wechat", "amount": 80000 },
    { "method": "alipay", "amount": 30000 },
    { "method": "cash", "amount": 10000 }
  ]
}
```

第一版只返回结构化信息，不生成智能总结。
