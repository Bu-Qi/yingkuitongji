# QKI 每日盈亏账本

迁移目标为公开仓库 `Bu-Qi/yingkuitongji` 和 GitHub Pages。
公开范围包括盈亏、交易哈希、链上路径和相关钱包；不上传钱包私钥、机器人 API Token、Sites 凭据或 SSH 私钥。

## 网站

`npm ci && npm run build && npm test` 生成 `dist/index.html`。
默认快照内嵌在 HTML，页面无需脚本也能阅读明细。浏览器每分钟读取 `ledger-data` 分支的 `history.json`，失败时保留上次有效账本并显示同步状态。金额按整数精度计算，QKI（含 WQKI）和 USDT 分列，Gas 只扣一次；缺少收支时显示待核算。

首次发布需要在仓库 Settings → Pages 选择 Deploy from a branch，分支 main，目录 /docs。
页面预构建于 docs/，无需 GitHub Actions；更新网站源码后重新构建并提交 docs/。

## 数据自动更新

阿里云运行 `server-sync/collect-pnl.mjs`，只读机器人本地历史和 QKI 链回执；安装时放到 `/opt/qki-arbitrage/cloud/` 以复用现有的 RPC/ABI 模块和 ethers 依赖。
它生成 `/var/lib/qki-arbitrage/pnl-github-cache.json`，再由 `publish-github.mjs` 推送到 `ledger-data` 分支。
定时器约每五分钟触发一次，页面每分钟检查一次；网络和 GitHub 缓存可能带来额外延迟，不承诺逐笔即时刷新。

部署前需为本仓库配置一个专用的可写 Deploy Key。私钥留在服务器 `/var/lib/qki-ledger-github/id_ed25519`，权限 600；公钥添加到该仓库的 Deploy keys。该密钥有仓库写权限，不可复用钱包密钥或现有登录密钥。
SSH `known_hosts` 必须核对 GitHub 官方公布的主机密钥后配置；脚本不会自动接受未知主机密钥。
工作目录应由 qkiarb 所有且权限 700。将 service/timer 安装到 systemd，先运行一次并确认上传和公开回读一致，再启用 timer。

## 当前状态

源码与页面已整理；GitHub Pages 和服务器自动同步需在各自权限配置完成、实测成功后才算启用。
内嵌基线仍为 2026-11-14 17:07（北京时间）的 137 笔完整核对记录，不能当作当前实盘盈亏。
原私人站点及其同步任务保持现状。
