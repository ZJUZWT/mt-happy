# mt-happy Server 自部署指南

本文档描述如何将 Happy Server 部署到自己的服务器，实现 CLI ↔ Server ↔ Web 的完整数据闭环。

## 架构概览

```
┌──────────────┐     WebSocket/HTTPS      ┌───────────────────┐
│  mt-happy    │◄────────────────────────► │   Your Server     │
│  CLI (本地)  │                           │   (nginx + node)  │
└──────────────┘                           └────────┬──────────┘
                                                    │
                                                    │ reverse proxy
                                                    ▼
┌──────────────┐     HTTPS                 ┌───────────────────┐
│  浏览器/手机  │◄────────────────────────► │  Official CDN     │
│  (Web App)   │                           │  (app.happy.eng)  │
└──────────────┘                           └───────────────────┘
```

- **API 请求** (`/v1/`, `/v2/`, `/v3/`) → 转发到本地 Happy Server (port 3000)
- **Web App 静态资源** (`/`) → 反代官方 CDN，注入 `serverUrl` 配置
- **WebSocket** (`/v1/updates`) → 通过 nginx 升级连接，支持实时通信

## 前置条件

- Linux 服务器（已测试 OpenCloudOS / CentOS 系列）
- Node.js >= 20（`crypto.subtle` 需要 Node 20+）
- nginx
- 域名 + SSL 证书（需要 HTTPS，WebSocket 和加密依赖它）
- >= 2GB RAM（pnpm install 较吃内存，建议加 swap）

## 步骤

### 1. 服务器环境准备

```bash
# 安装 Node.js 20+
curl -fsSL https://raw.githubusercontent.com/tj/n/master/bin/n | bash -s lts
n 20

# 安装 pnpm
npm install -g pnpm

# 如果内存不够（1GB 的机器），加 swap
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 2. 部署 Happy Server 代码

```bash
# 克隆仓库（只需要 happy-server 包，但 monorepo 需要完整拉取）
cd /opt
git clone https://github.com/slopus/happy.git mt-happy
cd mt-happy

# 安装依赖
pnpm install --frozen-lockfile
```

### 3. 配置环境变量

```bash
cat > /opt/mt-happy/packages/happy-server/.env << 'EOF'
# 必须：32字节hex随机密钥，用于签发 auth token
HANDY_MASTER_SECRET=<生成方法: openssl rand -hex 32>

# 服务端口
PORT=3000

# 生产模式
NODE_ENV=production

# Web App 配置注入（让前端知道 API 地址）
HAPPY_INJECT_HTML_CONFIG={"serverUrl":"https://your-domain.com"}
EOF
```

生成 MASTER_SECRET：
```bash
openssl rand -hex 32
```

### 4. 初始化数据库（PGlite，无需外部 Postgres）

```bash
cd /opt/mt-happy/packages/happy-server

# 运行 migration 建表
node /opt/mt-happy/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs \
  sources/standalone.ts migrate
```

数据存储在 `./data/pglite/` 目录下。

### 5. 创建启动脚本

```bash
cat > /opt/mt-happy/start.sh << 'EOF'
#!/bin/bash
cd /opt/mt-happy/packages/happy-server
set -a
source .env
set +a
exec node $(find /opt/mt-happy/node_modules/.pnpm -path '*/tsx@*/dist/cli.mjs' | head -1) \
  /opt/mt-happy/packages/happy-server/sources/standalone.ts serve
EOF
chmod +x /opt/mt-happy/start.sh
```

### 6. 配置 nginx

创建 `/etc/nginx/conf.d/your-domain.conf`：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    "" close;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/your/cert.crt;
    ssl_certificate_key /path/to/your/cert.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    ssl_prefer_server_ciphers on;

    # API 路由 - 转发到 Happy Server
    location /v1/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket 长连接需要长超时
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
        proxy_cache off;
    }

    location /v2/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /v3/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Web App - 反代官方 CDN，注入 serverUrl 配置
    location / {
        proxy_pass https://app.happy.engineering;
        proxy_set_header Host app.happy.engineering;
        proxy_ssl_server_name on;
        # 注入配置，让 Web App 连接你的 server 而非官方
        sub_filter '</head>' '<script>window.__HAPPY_CONFIG__={serverUrl:"https://your-domain.com"};</script></head>';
        sub_filter_once on;
        sub_filter_types text/html;
        # 必须关闭压缩才能 sub_filter 生效
        proxy_set_header Accept-Encoding "";
    }
}
```

**关键点：**
- `/v1/` 必须支持 WebSocket（`Upgrade` + `Connection` headers）
- `sub_filter` 注入让 Web App 知道连接你的 server
- `proxy_set_header Accept-Encoding ""` 禁止上游压缩，否则 sub_filter 无法替换

```bash
nginx -t && nginx -s reload
```

### 7. 启动服务

```bash
# 前台运行（调试用）
bash /opt/mt-happy/start.sh

# 后台运行
nohup bash /opt/mt-happy/start.sh > /tmp/mt-happy.log 2>&1 &

# 或者用 systemd（推荐生产环境）
cat > /etc/systemd/system/mt-happy.service << 'EOF'
[Unit]
Description=mt-happy Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/mt-happy/packages/happy-server
EnvironmentFile=/opt/mt-happy/packages/happy-server/.env
ExecStart=/usr/local/bin/node /opt/mt-happy/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs /opt/mt-happy/packages/happy-server/sources/standalone.ts serve
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mt-happy
systemctl start mt-happy
```

### 8. 验证

```bash
# 检查 API
curl https://your-domain.com/v1/auth/request \
  -X POST -H "Content-Type: application/json" \
  -d '{"publicKey":"dGVzdHRlc3R0ZXN0dGVzdHRlc3R0ZXN0dGVzdHQ=","supportsV2":true}'
# 应返回: {"state":"requested"} 或 {"error":"Invalid public key"}

# 检查 Web App
curl -s https://your-domain.com/ | grep "__HAPPY_CONFIG__"
# 应包含你注入的 serverUrl
```

## 客户端配置

### CLI 端

在 `Settings.json`（workspace 根目录）中设置：

```json
{
  "MtHappy": {
    "ServerUrl": "https://your-domain.com",
    "DefaultEngine": "claude-internal"
  }
}
```

然后通过 `RunMTHappy.bat` 启动，它会自动读取 `ServerUrl`。

或者手动设置环境变量：

```bash
export HAPPY_SERVER_URL="https://your-domain.com"
mt-happy
```

### Web 端

直接访问 `https://your-domain.com`，注册账号即可。

### 多设备共享

1. 第一台设备在 Web 注册账号，记住 **Secret Key**
2. 第二台设备访问 Web，用 Secret Key 恢复账号
3. CLI 通过 `mt-happy auth login` → 浏览器授权 → 获取共享加密密钥
4. 所有设备共享同一把加密密钥，数据互通

## 运维

### 清空数据库（重置）

```bash
systemctl stop mt-happy  # 或 kill 进程
rm -rf /opt/mt-happy/packages/happy-server/data/pglite
rm -rf /opt/mt-happy/packages/happy-server/data/files

# 重新建表
cd /opt/mt-happy/packages/happy-server
node $(find /opt/mt-happy/node_modules/.pnpm -path '*/tsx@*/dist/cli.mjs' | head -1) \
  sources/standalone.ts migrate

systemctl start mt-happy
```

### 查看日志

```bash
# systemd
journalctl -u mt-happy -f

# nohup 模式
tail -f /tmp/mt-happy.log
```

### 更新代码

```bash
cd /opt/mt-happy
git pull
pnpm install --frozen-lockfile

# 运行新的 migration（如果有）
cd packages/happy-server
node $(find /opt/mt-happy/node_modules/.pnpm -path '*/tsx@*/dist/cli.mjs' | head -1) \
  sources/standalone.ts migrate

systemctl restart mt-happy
```

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| CLI 报 "Failed to create authentication request" | Server URL 没设对或服务器未启动 | 检查 `HAPPY_SERVER_URL` 和服务状态 |
| Web App "Failed to decrypt" | 加密密钥不匹配（手动创建了 token） | 删除 `~/.mt-happy/access.key`，重新走 auth 流程 |
| WebSocket 502 | nginx 未配置 WebSocket upgrade | 确认 `map` + `Upgrade`/`Connection` headers |
| pnpm install OOM | 内存不足 | 加 swap（至少 2G） |
| "Table does not exist" | 数据库未初始化 | 运行 `standalone.ts migrate` |
| 设备离线 | daemon 未运行或数据库被清空后未重启 daemon | 停止 daemon → 重启 daemon |
