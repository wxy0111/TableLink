# SQLite 可选模式调研

TableLink 当前默认使用 PostgreSQL，适合长期运行、多人同时访问、后续接入报表和支付流水。SQLite 可以作为“单机轻量安装模式”的备选，但不建议立刻替换默认数据库。

## 适合 SQLite 的场景

- 小店只用一台 Windows 本地 PC。
- 同时在线设备较少，例如 1 个收银端、1 个厨房端、少量顾客扫码点餐。
- 老板希望安装包更简单，不想先安装 Docker Desktop。
- 第一阶段只做菜单、桌台、订单、厨房、收银和基础报表。

## 不适合 SQLite 的场景

- 多门店、连锁总部、远程访问。
- 高并发点餐或大量平板同时操作。
- 需要复杂财务、库存、会员、外卖平台同步。
- 需要数据库级别的角色权限、审计、复制和在线备份。

## 技术差异

```txt
PostgreSQL：
  优点：并发能力强、类型系统完整、JSON/枚举/时间处理成熟、后续扩展空间大。
  缺点：需要 Docker 或独立数据库服务，安装包体感更重。

SQLite：
  优点：一个本地文件就是数据库，安装部署简单，备份也直观。
  缺点：写并发较弱，长期多端高频写入需要谨慎；Prisma schema 兼容性需要单独验证。
```

## Prisma 兼容性风险

当前项目的 `prisma/schema.prisma` 使用 PostgreSQL provider。SQLite 模式不能只改一行就直接上线，需要验证：

- enum 在 SQLite 下的迁移表现。
- `Json` 字段在 SQLite 下的读写和查询能力。
- `DateTime` 默认值、更新时间字段和排序行为。
- 金额字段 `Decimal` 的精度和序列化表现。
- 现有迁移文件是否要维护 PostgreSQL/SQLite 两套。
- 备份恢复文件是否能跨 PostgreSQL 和 SQLite 导入。

## 推荐落地方式

第一阶段保持 PostgreSQL 为默认生产模式，同时预留 SQLite 轻量模式：

```txt
默认模式：PostgreSQL + Docker Compose
轻量模式：SQLite + 本地 data/tablelink.sqlite
```

后续实现建议：

1. 新增独立 schema：`prisma/schema.sqlite.prisma`。
2. 新增环境变量：`DATABASE_PROVIDER=postgresql|sqlite`。
3. SQLite 数据文件放在 `data/tablelink.sqlite`。
4. 安装向导里让用户选择“标准模式”或“轻量模式”。
5. 备份恢复使用当前 JSON 格式，避免锁死数据库厂商。
6. 正式发布前用同一套点餐、厨房、服务员、收银验证脚本分别跑 PostgreSQL 和 SQLite。

## 当前结论

短期不切换默认数据库。SQLite 值得作为后续“一键安装包”的轻量选项调研和试验，但第一版先用 PostgreSQL 保证稳定性和扩展空间。
