# mt-happy (Fork)

本仓库是 [happy-coder](https://github.com/slopus/happy) 的 fork，`mt-hk-happy` 分支包含以下定制：

- 多引擎支持（claude-internal / codebuddy / codex / claude）
- 自建服务器支持（数据不经过第三方）
- 重命名为 mt-happy，数据目录 `~/.mt-happy`

## 链接

| 资源 | 地址 | 说明 |
|------|------|------|
| Server (API) | https://mt.swannzh.icu | CLI/App 连接此地址 |
| Web App | https://mt.hk.swannzh.icu | 浏览器访问，auth 审批 |
| 上游仓库 | https://github.com/slopus/happy | |
| 官方 Web App | https://app.happy.engineering | 原版 CDN |

## 分支

- `main` — 同步上游原始代码
- `mt-happy` — 国内服定制分支
- `mt-hk-happy` — HK 服定制分支（当前活跃）

## 快速上手

```bash
# 安装
cd packages/happy-cli
pnpm install && pnpm build && npm link

# 启动（首次会自动打开浏览器做 auth）
mt-happy --engine claude-internal

# 启动 daemon（设备保持在线）
mt-happy daemon start
```

> **注意：** auth 完成后，`serverUrl` 和 `webappUrl` 会自动写入 `~/.mt-happy/settings.json`。
> 如果需要切换服务器，编辑该文件或设置环境变量：
> ```bash
> HAPPY_SERVER_URL=https://mt.swannzh.icu mt-happy
> ```

## 服务器部署

见 [docs/self-hosting.md](docs/self-hosting.md)

## 部署验证（Smoke Test）

内置自动化测试脚本，验证服务器全链路：Auth → 加密 Session → 发送消息 → 取回解密 → WebSocket。

```bash
# 人类友好输出
tsx scripts/smoke-test.ts

# 指定服务器
tsx scripts/smoke-test.ts https://mt.swannzh.icu

# JSON 输出（供 AI agent / CI 解析）
tsx scripts/smoke-test.ts --json

# 跳过 WebSocket 测试
tsx scripts/smoke-test.ts --no-ws

# 固定 seed（可复现，适合 CI）
tsx scripts/smoke-test.ts --seed <64位hex>
```

**无需浏览器** — 使用 Ed25519 直接签名认证，AI agent 可以独立完成部署后验证。

输出示例：
```
🔍 MT-Happy Smoke Test
   Server: https://mt.swannzh.icu

✅ auth                 269ms   token_length=279
✅ create_session       121ms   session_id=cmpq...
✅ send_message          59ms   local_id=smoke-...
✅ retrieve_message      40ms   decrypted=true
✅ websocket            129ms   connected=true transport=websocket
✅ cleanup                0ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All 6/6 checks passed in 618ms
```

## 同步上游

```bash
git fetch upstream
git checkout mt-hk-happy
git merge upstream/main
git push origin mt-hk-happy
```
