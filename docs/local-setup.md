# 本地环境和启动

## 当前环境

```txt
Node.js：v24.16.0
npm：11.13.0
Git：2.54.0
Docker Desktop：29.5.3
Docker Compose：v5.1.4
```

确认命令：

```powershell
node --version
npm.cmd --version
git --version
docker --version
docker compose version
```

如果直接运行 `npm` 提示 `npm.ps1 cannot be loaded because running scripts is disabled`，在 PowerShell 里改用 `npm.cmd` 即可。

## 首次启动

复制环境变量：

```powershell
Copy-Item .env.example .env
```

如果要让桌台二维码给手机扫码使用，把 `.env` 里的 `PUBLIC_WEB_BASE_URL` 改成本机局域网地址，例如：

```txt
PUBLIC_WEB_BASE_URL="http://192.168.1.20:3000"
```

安装依赖：

```powershell
npm.cmd install
```

启动 PostgreSQL：

```powershell
docker compose up -d
```

生成 Prisma Client：

```powershell
npm.cmd run db:generate
```

创建数据库表：

```powershell
npm.cmd run db:migrate
```

写入系岛食堂测试数据：

```powershell
npm.cmd run db:seed
```

启动后端：

```powershell
npm.cmd run dev:api
```

另开一个 PowerShell，启动前端：

```powershell
npm.cmd run dev:web
```

打开：

```txt
http://localhost:3000
```

测试桌台入口：

```txt
http://localhost:3000/table/TABLE-01
```

验证点餐主链路：

```powershell
npm.cmd run verify:order-flow
```

该脚本会用 `TABLE-02` 创建一笔测试订单，并确认厨房接口能看到该订单。

## Seed 数据

当前 seed 包含：

- 店名：系岛食堂
- 桌台：A01 到 A11
- 桌台二维码 code：TABLE-01 到 TABLE-11
- 菜品分类：11 个
- 菜品：33 个常见川菜和饮品/主食

## 局域网访问

开发服务默认监听 `0.0.0.0`。在本地 PC 上运行：

```powershell
ipconfig
```

找到 Wi-Fi 或以太网 IPv4 地址后，店内其他设备访问：

```txt
http://本机局域网IP:3000
http://本机局域网IP:3000/table/TABLE-01
http://本机局域网IP:3000/kitchen
http://本机局域网IP:3000/service
http://本机局域网IP:3000/staff
http://本机局域网IP:3000/admin
http://本机局域网IP:3000/admin/menu
http://本机局域网IP:3000/admin/tables
http://本机局域网IP:3000/admin/backups
http://本机局域网IP:3000/setup
```

如果手机或平板打不开，检查 Windows 防火墙是否允许 3000 和 3001 端口。
