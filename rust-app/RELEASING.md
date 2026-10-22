# Rust Windows 构建与预览发布

`.github/workflows/rust-windows.yml` 与旧 Python 工作流分开。PR 和 main 的相关变更自动构建；普通 main 提交不发布下载包。

## 手动发布

1. 将版本号、锁文件、`release-notes/<版本>.md` 和本次源码提交到 main。
2. 打开 GitHub Actions → **Rust Windows** → **Run workflow**，选择 main。
3. 只检查构建时保持 `publish` 为 false。发布时选 true，填写新的 `rust-v<版本>-preview.<序号>` 标签。
4. 等待 build 和 publish 都通过；在 Releases 检查安装版、绿色版、完整源码、SHA-256 和构建来源。

也可推送匹配的 Rust 预览标签触发发布。发布任务只接收同一次构建的产物，失败时不发布，已有同名 Release 不覆盖。手动发布限制 main，版本与标签必须一致。发布使用仓库的短期 GITHUB_TOKEN；不需要另存个人令牌。

构建锁定 Rust 版本和依赖，第三方 Actions 固定到提交 SHA。只有独立 publish job 有内容写权限，PR 构建无发布权限。当前流程始终发布**未签名预览版**，不会宣称已获 SignPath 支持。其 NSIS 安装、启动、卸载测试使用隔离配置；测试报告不含真实用户凭据。

安装包编译期间留存实际内嵌程序到 `release/distribution/ComTool.exe`。安装验收、签名检查和绿色版都使用这个文件，不使用 Tauri 在打包结束后恢复的原始程序；两种分发方式的程序 SHA-256 必须一致。

签名审批通过后，另行配置 SignPath 项目、来源验证、产品限制、签名产物和人工审批，再验收签名成功路径。当前本机证书签名脚本不代表 SignPath 集成已经完成。

现场验收仍见 [VALIDATION.md](VALIDATION.md)。Windows Server 2022 runner 不能替代 Windows 10 实机和真实串口。
