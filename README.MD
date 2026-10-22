# ComTool

串口、TCP/UDP 与 SSH 通信调试工作台，提供收发、交互终端、协议与图表插件。

**Rust 预览版**：新的 Windows 通信工作台已合入 `main` 分支，代码位于 [`rust-app/`](https://github.com/leon-2050/ComTool/tree/main/rust-app)。支持串口、TCP/UDP、多会话与 SSH；Python 版继续保留。构建和功能说明见 [Rust 说明](rust-app/README.md)，实际验证与性能边界见 [测试报告](rust-app/VALIDATION.md)。协议、图表和外部 Python 插件仍由 Python 版提供。

**直接使用软件：请先看下面的[下载与安装](#windows-install)。安装版和绿色版都不需要安装 Python、Node.js 或 Rust 工具链。** 开发与自动发布步骤见 [Rust 说明](rust-app/README.md) 和 [发布说明](rust-app/RELEASING.md)。

> **来源与许可**：本项目是在 [Neutree/COMTool](https://github.com/Neutree/COMTool) 基础上修改的独立维护版本，原作者为 **Neucrack**。保留上游 Git 历史和版权通知，项目源码与本次修改沿用 **LGPLv3**。修改基准为 [`8dbf97d`](https://github.com/Neutree/COMTool/commit/8dbf97d6502f33e51be60401f738c7ff6442eb9e)，上游版本 3.4.1；Python 版初始界面修改日期为 **2026-10-12 至 2026-10-13**。后续 Rust 进展见 [Rust 测试报告](rust-app/VALIDATION.md)。详见 [来源声明](NOTICE.md)、[修改记录](MODIFICATIONS.md) 和 [原许可证](LICENSE)。

<a id="windows-install"></a>

## 下载与安装（Windows x64）

当前提供 **ComTool Rust 0.1.1 预览版**：[完整发布页](https://github.com/leon-2050/ComTool/releases/tag/rust-v0.1.1-preview.1)。后续版本请从本仓库 [Releases](https://github.com/leon-2050/ComTool/releases) 获取。

目标平台为 Windows 10/11 x64，已完成本机 Windows 11 和云端 Windows Server 2022 的相关自动化验证；Windows 10 实机仍待验收。应用界面依赖 **Microsoft Edge WebView2 Runtime**。

| 下载文件 | 用途 | WebView2 要求 |
|---|---|---|
| [ComTool-0.1.1-Windows-x64-setup.exe](https://github.com/leon-2050/ComTool/releases/download/rust-v0.1.1-preview.1/ComTool-0.1.1-Windows-x64-setup.exe) | 安装版，日常固定在电脑上使用 | 缺失时尝试联网安装，安装包不包含完整运行库 |
| [ComTool-0.1.1-Windows-x64-portable.zip](https://github.com/leon-2050/ComTool/releases/download/rust-v0.1.1-preview.1/ComTool-0.1.1-Windows-x64-portable.zip) | 绿色版，解压后运行 | 需要系统已安装运行库 |
| [ComTool-0.1.1-source.zip](https://github.com/leon-2050/ComTool/releases/download/rust-v0.1.1-preview.1/ComTool-0.1.1-source.zip) | 对应版本的完整源码，用于查看或自行构建 | 不是可以直接运行的软件包 |

**签名状态：当前版本未签名。** SignPath Foundation 免费开源签名申请已提交，尚未获批，Windows 可能显示未知发布者。请确认下载来自本仓库并核对校验值；校验值用于确认文件一致性，不代表已获得数字签名。

### 安装版步骤

1. 下载上表中的 `ComTool-0.1.1-Windows-x64-setup.exe`。
2. 运行安装程序，选择安装向导语言，按提示完成安装。安装范围为当前 Windows 用户。
3. 如果提示缺少 WebView2，保持联网，让安装程序下载并安装运行库。如果单位网络不允许下载，请先由管理员部署 [Microsoft WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/#download-section)。
4. 安装完成后，从桌面或开始菜单打开 **ComTool Rust Preview**。首次启动按需要选择是否导入旧版配置。

离线电脑可先在有网络的电脑上下载官方 **Evergreen Standalone Installer（x64）**，复制到目标电脑安装运行库，再运行 ComTool。无运行库环境的端到端安装仍待验收。

### 绿色版步骤

1. 确认系统已安装 WebView2 Runtime；没有时先安装上述官方运行库。
2. 下载 `ComTool-0.1.1-Windows-x64-portable.zip`，右键选择“全部解压缩”。
3. 进入解压后的 `ComTool` 文件夹，双击 `ComTool.exe`。请保留同目录的许可和说明文件，不要直接在压缩包中运行。

“绿色版”表示免安装程序；**配置仍保存在当前用户的 AppData 中，不会随 U 盘或程序文件夹一起移动。** 两个版本功能相同，也会使用同一份 Rust 配置。

### 首次连接与日常操作

1. 在左侧点击 **＋** 创建会话，选择串口、TCP、UDP 或 SSH。
2. 在右侧常驻的“连接配置”区填写参数，再点击顶部“连接”。串口应从自动枚举的下拉列表选择设备，并按设备要求设置波特率等参数；不要仅凭端口编号猜测设备。
3. 串口、TCP、UDP 使用文本/HEX 收发界面；SSH 固定使用交互终端。首次 SSH 连接应核对主机指纹。
4. 连接中修改参数会进入草稿，点击“应用并重连”后才生效；“撤销修改”恢复当前参数。重连保留收发历史并重新初始化终端，定时发送和文件发送不会自动恢复。

| 功能 | 操作 |
|---|---|
| 发送文本或 HEX | 在“发送编辑”区选择格式，输入内容后点击“发送”；收发界面可用 `Ctrl+Enter` |
| 保存通信数据 | 连接前展开“收发与显示”中的“通信记录”，选择“原始记录文件”；SSH 对应折叠区为“终端与记录” |
| 发送文件 | 串口/TCP/UDP 连接后点击发送区的文件夹按钮；发送的是原始文件字节，需要对端配合接收，不是 X/Y/ZMODEM 或 SSH 文件传输 |
| 定位连接配置 | `Ctrl+,` |
| 新建串口会话 | `Ctrl+N` |
| 导入或导出配置 | 右上角“应用菜单”中的“导入配置”或“导出配置” |

接收记录保存原始字节，旁边的 `.index.jsonl` 保存时间、来源和报文边界；启用发送记录时另存 `.tx.bin` 和 `.tx.index.jsonl`。清空接收显示不会删除记录文件。UDP 文件发送不保证可靠到达。

### 升级、配置备份与卸载

- Rust 配置路径：`%APPDATA%\ComToolRust\config.json`；Python 版使用 `%APPDATA%\COMTool`，两者分开。
- 升级前从应用菜单导出配置，停止发送任务并关闭程序，再运行新版安装包；绿色版建议解压到新目录后运行。当前没有自动更新，需要手动下载。
- 安装版与绿色版不要同时运行并修改同一份配置。未应用的连接参数草稿不会在退出后保留；导出的配置不含密码或私钥口令，迁移电脑后需重新提供凭据。
- 安装版可在 Windows“设置 → 应用”中找到 **ComTool Rust Preview** 并卸载；希望保留配置时，不要选择删除应用数据。
- 绿色版关闭后可删除解压目录，AppData 配置和自行选择位置的通信记录仍会保留。删除配置或记录前请自行备份。

### 校验下载文件

从同一发布页下载 [SHA256SUMS.txt](https://github.com/leon-2050/ComTool/releases/download/rust-v0.1.1-preview.1/SHA256SUMS.txt)，在下载目录打开 PowerShell，例如：

```powershell
Get-FileHash .\ComTool-0.1.1-Windows-x64-setup.exe -Algorithm SHA256
Get-FileHash .\ComTool-0.1.1-Windows-x64-portable.zip -Algorithm SHA256
```

将输出与 `SHA256SUMS.txt` 中对应文件的值逐字对比，字母大小写可忽略；不一致时不要使用该文件，重新下载并核对来源。`build-manifest.json` 记录版本、源码提交和云端构建地址。

### 常见问题

| 情况 | 处理方法 |
|---|---|
| 绿色版无法启动或提示缺少 WebView2 | 安装官方 Evergreen Runtime 后重试；已有 Edge 浏览器不应作为运行库已安装的唯一判断依据 |
| 安装时无法下载运行库 | 检查网络、代理或单位网络限制；可由管理员预先部署运行库。缺少运行库的安装流程仍待独立环境验收 |
| 串口列表为空 | 检查设备连接和厂商驱动，在设备管理器确认端口后点击刷新；不要把手工输入的编号当作已检测到的设备 |
| 串口连接失败 | 核对设备、波特率及其他串口参数，确认端口没有被其他程序占用 |
| 收发乱码 | 核对双方波特率、数据位、校验、停止位及字符编码；需要查看原始字节时使用 HEX |
| 没找到 Python 协议、图表或外部插件 | 这些功能继续由下方的 Python 版提供，Rust 预览版未全部迁移 |

真实串口、Win10 实机、无 WebView2 环境、中文输入法/剪贴板、真实跨屏缩放、完整 SSH 远端程序和磁盘满仍有待验收。完整记录见 [Rust 测试报告](rust-app/VALIDATION.md)。

## Python 版界面与功能

以下截图及本节说明对应保留的 Python 版；Rust 版使用方法见上面的安装与操作说明。

![ComTool 浅色通信工作台](docs/images/workbench-light.png)

### 功能

- 串口调试：文本/HEX 收发、发送历史、文件发送、自定义发送与通信记录。
- 网络调试：保留上游 TCP/UDP 客户端及服务端实现。
- SSH 终端：ANSI 亮色、256 色、RGB、字体样式与可关闭的关键词高亮。
- 多会话工作台：会话列表、搜索、分离/恢复、浅色/深色主题和统一连接入口。

本次修改重做了界面、图标与启动流程，并修复终端高 DPI、颜色和选区等问题。主要操作与验证说明见 [使用说明](README_UI_ZH.md)。

<details>
<summary>深色主题</summary>

![ComTool 深色通信工作台](docs/images/workbench-dark.png)

</details>

## Python 版：从源码运行

当前 Windows 构建环境：Python 3.12.14 x64、PyQt5 5.15.11、PyInstaller 6.22.3。依赖版本见 [requirements-windows-build.txt](requirements-windows-build.txt)。

```powershell
git clone https://github.com/leon-2050/ComTool.git
cd ComTool
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-windows-build.txt
.\.venv\Scripts\python.exe COMTool\Main.py
```

生成 Windows 可执行文件：

```powershell
.\tool\build_windows.ps1 -Python (Resolve-Path .\.venv\Scripts\python.exe).Path
```

输出为 `dist/ComTool/ComTool.exe`。分发时保留同目录 `_internal` 文件夹。现有个人配置继续使用 `%APPDATA%\COMTool`。

## Python 版验证范围

已检查 Windows Qt 离屏界面、会话恢复、100%/150%/200% 终端颜色、中文与复制选区、本机 SSH PTY 请求及打包程序启动。硬件串口、用户远端 SSH 和实际设备协议未做现场验证。详细范围见 [README_UI_ZH.md](README_UI_ZH.md)。

## 来源与许可证

- 上游源码：[Neutree/COMTool](https://github.com/Neutree/COMTool)，原作者 Neucrack。
- 项目许可：[原 LICENSE](LICENSE)、[LGPLv3 全文](COPYING.LESSER)、[GNU GPLv3 全文](COPYING)。
- 本次修改：[MODIFICATIONS.md](MODIFICATIONS.md)；归属与来源：[NOTICE.md](NOTICE.md)。
- 第三方依赖保留各自许可证，尤其 PyQt5 的 GPLv3／商业许可与 Qt 的许可应分别核对，参见 [第三方说明](THIRD_PARTY_NOTICES.md)。
- Rust 预览版通过 Releases 提供程序包、对应完整源码及校验值，依赖许可随包提供；WebView2 Runtime 不包含在程序包内。Python 版的源码构建方式见上文。

原项目文档的完整保留副本见 [英文](docs/upstream/README.MD) 与 [中文](docs/upstream/README_ZH.MD)，文件内容及其版权声明保留。上游文档里的发行、安装及升级链接指向上游项目。

## Code signing policy

免费开源签名申请已于 2026-10-22 提交，尚未获批；当前发布包仍未签名。来源、拟定审批角色及隐私行为见 [Code signing policy](CODE_SIGNING_POLICY.md)。
