# DEPLOYMENT.md

> 生产环境部署指南 — v9.0 起 native 部署（Docker 是 v9.1 待办）

## 1. 环境要求

| 组件 | 最低 | 推荐 |
|---|---|---|
| Node.js | 18.x | 22.x（LTS）|
| RAM | 512MB | 1GB+ |
| 磁盘 | 1GB | 10GB+（含 backup） |
| OS | Linux / macOS / Windows | Linux (Ubuntu 22.04 LTS) |

**不要用 `file://` 直接打开 HTML** — BFF 是同源架构，必须通过 `http://`。

## 2. 部署步骤

### 2.1 部署代码

```bash
# 1. 创建 deploy 用户
sudo useradd -m -s /bin/bash headhunter
sudo su - headhunter

# 2. 克隆代码
git clone https://github.com/qing3a/headhunter-api-hub.git
cd headhunter-api-hub/bff
npm ci --production   # 不要装 devDependencies

# 3. 配置环境变量
cp .env.example .env
nano .env   # 改以下关键变量 ↓
```

### 2.2 必改的环境变量

```bash
NODE_ENV=production                    # 必改 — 隐藏内部错误细节
PORT=3001                              # 可改
JWT_SECRET=<32+ 字符随机>              # 必改 — 必 ≥16 字符，强烈推荐 ≥32 字符
JWT_EXPIRES_IN=7d
DEMO_SEED=false                        # 必改 — 不 seed demo 数据
CORS_ORIGINS=https://yourdomain.com   # 必改 — 允许前端跨域
REMINDER_SCAN=true                     # 启动时扫描 overdue 推荐
AUDIT_RETENTION=true
AUDIT_RETENTION_DAYS=90                # 审计日志保留天数
DB_PATH=/var/lib/headhunter/erp.db     # 数据文件位置（建议非代码目录）
```

### 2.3 用 pm2 守护进程（推荐）

```bash
# 装 pm2
npm install -g pm2

# 启动
pm2 start src/index.js --name headhunter-api-hub \
  --cwd /home/headhunter/headhunter-api-hub/bff \
  --time

# 设开机自启
pm2 startup systemd
pm2 save

# 常用命令
pm2 status
pm2 logs headhunter-api-hub
pm2 restart headhunter-api-hub
pm2 stop headhunter-api-hub
```

### 2.4 用 systemd（不用 pm2）

```ini
# /etc/systemd/system/headhunter-api-hub.service
[Unit]
Description=headhunter-api-hub
After=network.target

[Service]
Type=simple
User=headhunter
WorkingDirectory=/home/headhunter/headhunter-api-hub/bff
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
EnvironmentFile=/home/headhunter/headhunter-api-hub/bff/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now headhunter-api-hub
sudo systemctl status headhunter-api-hub
sudo journalctl -u headhunter-api-hub -f
```

---

## 3. 反向代理（Nginx）

```nginx
# /etc/nginx/sites-available/headhunter-api-hub
server {
    listen 80;
    server_name api.yourdomain.com;

    # 重定向到 HTTPS（生产推荐）
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # 上传文件大小（BFF 默认 2MB JSON limit）
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket/SSE 留 v9.1
        # proxy_http_version 1.1;
        # proxy_set_header Upgrade $http_upgrade;
        # proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. HTTPS（Let's Encrypt）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

自动续期已默认配好。

---

## 5. 数据备份

DB 是单个 SQLite 文件 (`erp.db`)。备份最简单：

```bash
# 单文件备份（在线热备 thanks to WAL mode）
sudo cp /var/lib/headhunter/erp.db /backup/erp.db.$(date +%Y%m%d)

# 恢复
sudo systemctl stop headhunter-api-hub
sudo cp /backup/erp.db.YYYYMMDD /var/lib/headhunter/erp.db
sudo systemctl start headhunter-api-hub
```

### 自动备份（cron）

```cron
# /etc/cron.d/headhunter-backup
0 3 * * * headhunter cp /var/lib/headhunter/erp.db /backup/erp.db.$(date +\%Y\%m\%d) && find /backup -name 'erp.db.*' -mtime +30 -delete
```

**保留期** 30 天可调。

### 远程备份（可选）

```bash
# rclone 到 S3 / 阿里云 OSS / Google Drive
rclone copy /backup/erp.db.YYYYMMDD remote:bucket/headhunter/
```

---

## 6. 监控

### 6.1 健康检查

```bash
# Liveness (BFF 在跑吗)
curl -fsS http://localhost:3001/api/v1/health
# {"ok":true,"data":{"status":"running","time":"...","version":"..."}}

# 用 nginx
location /health {
    proxy_pass http://127.0.0.1:3001/api/v1/health;
}
```

### 6.2 进程监控

- **pm2 + Keymetrics**（免费 tier 够用）：`pm2 link <secret> <public>`
- **Prometheus**：用 `prom-client` 在 `/metrics`（v9.1 待加）
- **Uptime monitoring**：UptimeRobot / Healthchecks.io ping `/api/v1/health`

### 6.3 日志

- BFF 用 morgan + console.log → 默认 stdout
- pm2 自动收集到 `~/.pm2/logs/`
- journalctl (systemd)：`sudo journalctl -u headhunter-api-hub -f`

**已知**：morgan 写入 stdout，**必须 drain**（pm2 自动做）。如果用裸 `node` 启动，stdout pipe 满了会卡死。务必用 pm2/systemd。

---

## 7. 升级流程

```bash
# 1. 备份 DB
sudo cp /var/lib/headhunter/erp.db /backup/erp.db.before-upgrade

# 2. 拉新代码
cd /home/headhunter/headhunter-api-hub
git pull

# 3. 装依赖
cd bff && npm ci --production

# 4. 重启（优雅）
pm2 reload headhunter-api-hub
# 或
sudo systemctl restart headhunter-api-hub

# 5. 健康检查
sleep 3
curl -fsS http://localhost:3001/api/v1/health
```

DB schema 变更由 `db/init.js` 自动 migrate（`safeExec` + `CREATE IF NOT EXISTS`，**向后兼容**）。无需停机。

---

## 8. 故障排查

| 现象 | 原因 / 修复 |
|---|---|
| BFF 启动后立即退出 | 检查 stderr（一般是 `JWT_SECRET must be ≥16`）|
| `EADDRINUSE` 端口被占 | `lsof -i :3001` 找占用进程；改 `PORT` 环境变量 |
| DB 文件锁错误 | 检查是否多进程跑（必须是单进程！）；WAL 文件残留可手动删除 `.db-shm` / `.db-wal` |
| `UNHANDLED REJECTION` 多次 | BFF 默认不崩溃；查 `pm2 logs` 找 stack trace |
| Slow queries | BFF 单进程 + better-sqlite3 同步；1000 candidate insert ~86ms。SQLite 极限在 ~10K QPS |
| 启动慢 | 检查 `node_modules/better-sqlite3/build` 缓存（CI 用 actions/cache） |

---

## 9. 生产 checklist

部署前自检：

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` ≥ 32 字符随机（`openssl rand -hex 32`）
- [ ] `DEMO_SEED=false`
- [ ] `CORS_ORIGINS` 仅含真实域名
- [ ] HTTPS 配好
- [ ] DB 文件在独立目录（不要放代码库）
- [ ] 自动 backup 配好
- [ ] pm2 / systemd 守护
- [ ] 健康检查 / 监控 / log retention 配好
- [ ] 默认 admin/admin123 密码已改（admin 登录后调 `POST /api/v1/auth/change-password`）
- [ ] `.env` 不在 git 仓库（`.gitignore` 已含）
- [ ] OpenAPI spec (`/api/v1/openapi.json`) 给下游消费者拉走存档

---

## 10. 已知限制（生产部署需知）

- **单进程 + better-sqlite3**：WAL 允许多读单写，但**写仍是单连接**。高并发写需迁 Postgres（v9.1+）
- **rate limit**：login 10/15min，import 10/hour（per IP）；生产可能不够，DIY：调 `apiLimiter.max`
- **无 HSM**：JWT_SECRET 是单 secret，泄漏即全平台危险。生产考虑：rotate secret 脚本 + 多 secret 滚动
- **无审计日志外部 sink**：audit_log 写到 SQLite。生产可加 hook 转发到 ELK / Datadog

---

## 11. 灾备 / DR

- DB 每日本地备份 + 每周异地备份（建议 `rclone` 到云）
- 代码 release tag (`git tag v9.0.0` + GitHub Release) 存档
- `.env` **不存**代码仓库；用 1Password / Vault 管理
- 演练：每月一次恢复演练（备份 → 新机器 → 启动 → 健康检查）

---

## 12. Docker / K8s（v9.1）

`v9.0` 不带 Dockerfile（用户决策）。下一版会加 `Dockerfile` + `docker-compose.yml` + K8s manifests。

---

## 13. 进一步

- 看 [README.md](./README.md) 快速开始
- 看 [INTEGRATION.md](./INTEGRATION.md) 客户端接入
- 看 [API.md](./API.md) 完整 API 文档
- 出问题开 GitHub Issue