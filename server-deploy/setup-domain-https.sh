#!/bin/bash
# 在服务器上执行：设置域名 HTTPS (Let's Encrypt)
# 前提：mt.hk.swannzh.icu 的 DNS A 记录已经指向 43.161.220.202

# 1. 安装 certbot
yum install -y epel-release || true
yum install -y certbot python3-certbot-nginx || yum install -y certbot

# 2. 先把 nginx 改成监听 80（certbot 需要 HTTP 验证）
cat > /etc/nginx/conf.d/mt-happy.conf << 'ENDOFFILE'
server {
    listen 80;
    server_name mt.hk.swannzh.icu;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
ENDOFFILE
nginx -s reload 2>/dev/null || systemctl restart nginx

# 3. 申请证书（会自动改 nginx 配置加 HTTPS）
certbot --nginx -d mt.hk.swannzh.icu --non-interactive --agree-tos --email admin@phlax.top --redirect

# 4. 如果 certbot --nginx 失败，手动申请 + 配置
if [ $? -ne 0 ]; then
    echo "certbot --nginx failed, trying standalone..."
    systemctl stop nginx
    certbot certonly --standalone -d mt.hk.swannzh.icu --non-interactive --agree-tos --email admin@phlax.top

    cat > /etc/nginx/conf.d/mt-happy.conf << 'ENDOFFILE'
server {
    listen 80;
    server_name mt.hk.swannzh.icu;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name mt.hk.swannzh.icu;
    ssl_certificate /etc/letsencrypt/live/mt.hk.swannzh.icu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mt.hk.swannzh.icu/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
ENDOFFILE
    systemctl start nginx
fi

# 5. 设置自动续期
echo "0 3 * * * certbot renew --quiet --post-hook 'nginx -s reload'" | crontab -

# 6. 验证
echo ""
echo "===== 验证 ====="
curl -s https://mt.hk.swannzh.icu/ && echo "" && echo "HTTPS OK!"
echo ""
echo "域名配置完成！"
echo "CLI 用: HAPPY_SERVER_URL=https://mt.hk.swannzh.icu"
echo "手机 App 填: https://mt.hk.swannzh.icu"
