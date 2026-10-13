# 修改记录

修改日期：**2026-10-12 至 2026-10-13**。维护账号：**leon-2050**。

本修改版基于 [Neutree/COMTool](https://github.com/Neutree/COMTool) 的 `8dbf97d6502f33e51be60401f738c7ff6442eb9e`。修改保留原作者版权、LGPLv3 许可及上游历史。

## 通信工作台

- 重做浅色与深色主题，增加左侧会话列表、顶部连接状态和右侧配置抽屉。
- 整理接收、发送、历史、文本/HEX 切换及连接操作。
- 标签关闭按钮默认隐藏、悬停显示，平衡标签留白与文字位置。
- 增加会话分离/恢复、布局与控件生命周期的修复。

主要文件：`main2.py`、`pluginItems.py`、`parameters.py`、`widgets.py`、`utils_ui.py`、`plugins/dbg.py`、`assets/qss/`、`workbench_shell.py`、`session_tabs.py` 与语言资源。

## 终端与 SSH

- 修正高 DPI 位图缓存，将绘制留在 GUI 线程。
- 补全 ANSI 亮色、256 色、RGB 前景/背景和字体样式。
- 加入可关闭的 IP、命令参数、错误与状态关键词高亮；保留原始文本和命令自带颜色。
- 文字、光标及选区使用终端字符网格；选区保留 ANSI 背景。
- SSH PTY 声明改为 `xterm-256color`，保留尺寸设置和调整。

主要文件：`plugins/terminal.py`、`plugins/terminal_colors.py`、`conn/conn_ssh.py`。

## 启动与名称

- 移除启动闪屏、关闭正常运行的调试输出，错误诊断保留。
- 插件按需加载，更新检查在主窗口显示后进行。
- 显示名称及 Windows 可执行文件改为 **ComTool**，原配置目录保留。
- 新增会话连接矢量图标、多尺寸 Windows 图标和统一的界面线稿图标。
- 将断开连接图标改为分开的插头与插座，统一线宽并去掉零散装饰线。

主要文件：`Main.py`、`logger.py`、`autoUpdate.py`、`plugins/__init__.py`、`ui_icons.py`、`assets/app-shell*.svg`、`assets/comtool.*`。

## 构建与验证

- 增加 Windows 构建脚本和锁定的依赖列表，文档说明构建、来源、许可证及验证范围。
- 已验证 Qt 离屏界面、100%/150%/200% 终端颜色、会话恢复、本机 SSH PTY 请求和 Windows 打包启动。
- 硬件串口、用户远端 SSH 和实际设备协议未做现场验证。
- 细节见 [README_UI_ZH.md](README_UI_ZH.md)。
