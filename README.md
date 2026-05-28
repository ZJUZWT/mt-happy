# mt-happy (Fork)

本仓库是 [happy-coder](https://github.com/slopus/happy) 的 fork，`mt-happy` 分支包含以下定制：

- 多引擎支持（claude-internal / codebuddy / codex / claude）
- 自建服务器支持（数据不经过第三方）
- 重命名为 mt-happy，数据目录 `~/.mt-happy`

## 链接

| 资源 | 地址 |
|------|------|
| 我们的服务器 (API + Web) | https://mt.hk.swannzh.icu |
| 上游仓库 | https://github.com/slopus/happy |
| 官方 Web App (CDN) | https://app.happy.engineering |
| 官方文档 | https://happy.engineering/docs/ |

## 分支

- `main` — 同步上游原始代码
- `mt-happy` — 我们的定制分支（日常使用）

## 快速上手

```bash
# 安装
cd packages/happy-cli
npm run build && npm link

# 启动 session
HAPPY_SERVER_URL=https://mt.hk.swannzh.icu mt-happy --engine claude-internal

# 启动 daemon（设备保持在线）
HAPPY_SERVER_URL=https://mt.hk.swannzh.icu mt-happy daemon start
```

## 服务器部署

见 [docs/self-hosting.md](docs/self-hosting.md)

## 同步上游

```bash
git fetch upstream
git checkout mt-happy
git merge upstream/main
git push origin mt-happy
```
# MARKER
