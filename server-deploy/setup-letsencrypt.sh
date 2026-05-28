#!/bin/bash
# 安装 certbot 并申请 Let's Encrypt 证书

# 先确保 DNS 已生效
echo "检查 DNS..."
host swann.phlax.top || nslookup swann.phlax.top || echo "DNS查不到，确认A记录已配置！"

# 安装 certbot（OpenCloudOS/CentOS）
yum install -y epel-release 2>/dev/null
yum install -y certbot 2>/dev/null || pip3 install certbot

# 停掉 nginx（certbot standalone 需要 80 端口）
systemctl stop nginx

# 申请证书
certbot certonly --standalone -d swann.phlax.top --non-interactive --agree-tos --email admin@phlax.top

# 检查证书是否成功
if [ -f /etc/letsencrypt/live/swann.phlax.top/fullchain.pem ]; then
    echo "证书申请成功！"
else
    echo "证书申请失败！请确认："
    echo "1. swann.phlax.top 的 A 记录指向 42.192.105.114"
    echo "2. 安全组 80 和 443 端口已开放"
    echo "3. 域名能从外网解析"
    systemctl start nginx
    exit 1
fi

# 写入 nginx 配置
cat > /etc/nginx/conf.d/mt-happy.conf << 'ENDOFFILE'
server {
    listen 80;
    server_name swann.phlax.top;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name swann.phlax.top;
    ssl_certificate /etc/letsencrypt/live/swann.phlax.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/swann.phlax.top/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
        proxy_cache off;
    }
}
ENDOFFILE

# 删掉可能冲突的默认配置
rm -f /etc/nginx/conf.d/default.conf

# 启动 nginx
nginx -t && systemctl start nginx

# 验证
echo ""
curl -s https://swann.phlax.top/ && echo " - HTTPS OK!" || echo "HTTPS 验证失败"
