#!/bin/bash
# 在服务器上执行：bash /opt/setup-https.sh

# 1. 安装 nginx 和 openssl
yum install -y nginx openssl

# 2. 生成自签证书
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/server.key -out /etc/nginx/server.crt -subj "/CN=43.161.220.202"

# 3. 写 nginx 配置
cat > /etc/nginx/conf.d/mt-happy.conf << 'ENDOFFILE'
server {
    listen 443 ssl;
    server_name 43.161.220.202;
    ssl_certificate /etc/nginx/server.crt;
    ssl_certificate_key /etc/nginx/server.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
ENDOFFILE

# 4. 启动 nginx
systemctl start nginx
systemctl enable nginx

# 5. 验证
echo ""
echo "===== 验证 ====="
curl -sk https://localhost/ && echo "" && echo "HTTPS OK!"
echo ""
echo "记得去腾讯云安全组开放 443 端口！"
echo "然后浏览器访问 https://43.161.220.202 接受证书"
echo "app 里填 https://43.161.220.202"
