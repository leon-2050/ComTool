# 连接配置常驻与应用重连（2026-10-20）

## 行为

- 连接参数固定显示在右侧；收发与显示折叠在下部。800–1100px 窗口的会话侧栏以临时浮层展开。
- Ctrl+, 定位面板，顶部冗余配置按钮在后续界面修订中移除。应用与撤销操作固定在面板底部。
- 未连接参数沿用自动保存；连接中参数及凭据保存在每会话独立草稿中。顶部摘要保持当前连接参数。
- 手动恢复原值会清除无变化草稿，不会阻断随后断开状态下的自动保存。
- 应用流程：校验与准备凭据 → 保存 → 停止旧任务 → 等待资源释放（最多10秒）→ 启动新连接。以新连接代次的 connected 状态确认生效。
- 校验或保存失败不取消旧连接；关闭超时不启动新连接；新连接失败保留新参数并显示真实状态。
- 应用重连保留接收原始字节及文本历史，仍受原有8MiB/8192行限制；字符解码与终端回放按连接边界隔离。
- 定时及文件发送停止且不自动恢复；迟到的旧代状态、数据、进度和主机确认事件被过滤。
- SSH凭据只在同一目标/用户/私钥身份下复用。取消记住密码后移除持久副本，本次运行仍可复用当前凭据；密码不进入配置文件。

## 内部接口

新增 apply_connection_config(sessionId, config, secrets, onData)，返回 saved、generation、error。
生产独立程序必须启用 tauri/custom-protocol：cargo build --release --locked --features tauri/custom-protocol，或使用Tauri CLI构建。直接cargo build --release不保证使用内嵌页面。
config复用现有会话类型，后端只合并连接字段。配置文件格式仍为 version=1。
connect_session/disconnect_session/apply_connection_config 对同一会话互斥；断开等待 Runtime.finished。
file-progress 和 host-key 事件携带连接 generation。接收缓冲使用独立 epoch 隔离手动与自动重连边界。

## 本地验收

- npm run build：TypeScript检查和生产前端构建。
- npm test：9项通过，包括连接草稿隔离及跨连接解码/历史回放边界。
- cargo test --lib --release --locked：10项通过，包括等待实际收尾、关闭超时、连接字段合并及凭据身份判断。
- ui-check.mjs：9组通过；DPR 1/1.25/1.5/2、浅深色、1280×840、1100×840、900×640、850×640、800×560，以及草稿切换、撤销和手动恢复原值后的自动保存。
- native-apply-config.mjs：真实桌面与TCP/UDP；草稿隔离、撤销、无效参数、真实保存失败、双击只重连一次、接收历史及终端隔离、定时/文件取消、迟到事件、新连接失败和重新绑定。
- native-ssh.mjs：密码、私钥、加密私钥应用重连；空凭据字段复用、取消记住密码、PTY拒绝及主机密钥变化拒绝。
- native-server-udp.mjs 与 native-reconnect.mjs：定向/广播、来源索引、UDP空包边界、自动重连解码隔离和SSH握手取消。
- native-network.mjs：本轮8会话并行收发60秒，主会话约60MiB；记录SHA256、文件发送和定时停止检查。该短回归不替代此前600秒验收。

结果和截图保存在工作区 output/ComTool-connection-config-2026-10-20；summary.json关联本轮二进制SHA256和各报告。

生产包停用开发服务后独立启动通过：页面地址为 http://tauri.localhost/，开发调试入口不存在。所有本轮桌面用例在该生产包上重新执行。

## 尚待硬件验收

本机串口枚举为0；真实设备至少两档波特率切换、串口流控/端口释放及错误参数恢复尚未验证。
关闭超时路径通过受控Rust生命周期测试验证，未制造真实硬件驱动卡死。
本轮未补齐原验收清单中的Win10实机、真实IME/剪贴板、完整远端程序、真实跨屏DPI和磁盘满场景。
