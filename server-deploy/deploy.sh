#!/bin/bash
# 在服务器上执行这个脚本完成部署
# 用法: scp deploy.sh root@42.192.105.114:/opt/ && ssh root@42.192.105.114 "bash /opt/deploy.sh"

# 1. 复制启动脚本
cp /opt/start.sh /opt/mt-happy/start.sh
chmod +x /opt/mt-happy/start.sh

# 2. 复制 systemd 服务文件
cp /opt/mt-happy-server.service /etc/systemd/system/mt-happy-server.service

# 3. 启动服务
systemctl daemon-reload
systemctl restart mt-happy-server
sleep 3
systemctl status mt-happy-server

# 4. 验证
curl -s http://localhost:3000/ || echo "服务未响应，检查 journalctl -u mt-happy-server"
