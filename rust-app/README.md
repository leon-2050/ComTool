# ComTool Rust 预览版

串口、TCP/UDP 与 SSH 调试工作台。Windows 10/11 x64 优先，Rust + Tauri 2 + React，终端使用 xterm.js。Python 版本仍保留在仓库原目录。

来源：[Neutree/COMTool](https://github.com/Neutree/COMTool)。本仓库保留上游历史、作者声明与 LGPL-3.0 许可。重写实现、沿用的图标和显示高亮规则以 LGPL-3.0-only 提供；依赖各自的许可见 `src-tauri/licenses/`。预览版不能视为全部硬件与性能验收已完成。

## 使用

NSIS 安装包为当前用户安装，检测并处理 WebView2 缺失。免安装版需要已安装 Microsoft Edge WebView2 Runtime。普通启动没有闪屏和控制台日志。

左侧管理会话，中央收发或终端，右侧连接配置。新建及恢复会话默认断开；只有勾选自动重连才会重试。会话标签关闭按钮在悬停和键盘聚焦时显示。

配置默认存于 `%APPDATA%\ComToolRust\config.json`，与 Python 版本分开。首次启动可选择导入旧版配置，也可从菜单导入。导入前复制原文件；不支持的插件列入报告。配置损坏时禁止覆盖，提供备份恢复。密码及私钥口令在认证成功后按用户选择写入 Windows 凭据管理器，导出不包含凭据。首次 SSH 主机必须确认指纹，已保存密钥变化时拒绝连接。

通信记录是原始接收字节，旁边的 `.index.jsonl` 保存时间、来源和报文边界；启用发送记录时另写 `.tx.bin` 和 `.tx.index.jsonl`。显示区清理旧数据不删除记录。接收显示最多保留 8 MiB 原始字节及 8192 个块，终端保留 10000 行。队列或磁盘异常会显示提示。UDP 文件发送不能保证可靠到达；“已排队”不代表远端已经接收。

## 构建

安装 Node.js 22、Rust（工具链版本见 `rust-toolchain.toml`）、Visual Studio C++ Build Tools 和 Windows SDK。在此目录运行：

```powershell
./scripts/build-windows.ps1
```

构建后可运行 `./scripts/package-windows.ps1 -OutputDirectory <新输出目录>` 同时整理安装版、绿色版及校验值；使用自定义 Cargo 输出目录时设置 `CARGO_TARGET_DIR` 或传入 `-CargoTargetDirectory`。

绿色版从 NSIS 编译时留存的 `release/distribution/ComTool.exe` 取程序，确保与安装包内的程序字节一致。不要用 Tauri 打包后恢复的 `release/ComTool.exe` 替代该分发文件。

`-NoBundle` 仅生成内嵌界面的独立程序；`-SkipInstall` 复用已有前端依赖。Cargo.lock 和 package-lock.json 锁定依赖，Windows 使用静态 MSVC CRT。

## 验证

GitHub Actions 的 **Rust Windows** 工作流自动检查 PR/main，并可手动发布未签名预览版。完整步骤和权限边界见 [RELEASING.md](RELEASING.md)。

`npm test` 验证显示缓冲和高亮；Rust release 单元测试使用真实 TCP/UDP 回环。启动开发服务器后 `node tests/ui-check.mjs` 检查浏览器中的主题、缩放及终端字节夹具。

`node tests/native-smoke.mjs`、`node tests/native-ssh.mjs`、`node tests/native-network.mjs` 运行真实 Release 桌面程序。SSH 测试需要 Python Paramiko，网络测试默认持续 600 秒。它们使用独立配置目录、本机临时端口与生成的测试密钥，绝不使用实际用户凭据。测试通过 WebView2 调试接口自动操作；正式应用默认不开启该接口。生成密钥、配置及日志不可提交。

真实串口拔插、特殊校验/停止位与流控必须用硬件另外验收。协议脚本、图表、外部 Python 插件及分离窗口继续使用 Python 版。

## Windows 代码签名

正式证书准备好后使用 `scripts/build-signed-windows.ps1`；先用 `-CheckOnly` 检查，再构建签名包。配置、命令与验收边界见 [SIGNING.md](SIGNING.md)。现有 0.1.1 下载包仍未签名。
