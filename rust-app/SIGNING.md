# Windows 正式代码签名

当前机器没有可用的代码签名证书；已有 0.1.1 分发包仍未签名。本机证书签名构建及校验脚本已准备，尚未验证成功签名路径。SignPath Foundation 免费开源签名申请已于 2026-10-22 提交，尚未获批；该服务的接入需要另行配置，不能直接使用本机证书脚本代替。未创建自签名证书或修改信任根。

## 先准备

以个人或公司身份向支持该身份及所在地的代码签名服务商申请正式证书，完成其身份审核。按服务商说明安装令牌驱动/密钥提供程序，并让证书可从当前用户的“个人”证书库访问。私钥可以保留在令牌/HSM 内，无需导出到代码仓库。

此入口支持 Windows 当前用户证书库 + SignTool。纯云端服务需要其专用工具/账号配置，不能仅填写云端证书指纹。不要把证书私钥、令牌 PIN、云凭据发到聊天中或写入 Git。

## 检查与构建

在 rust-app/ 目录运行，下例指纹与时间戳地址均需换成服务商提供的真实值：

```powershell
./scripts/build-signed-windows.ps1 `
  -CertificateThumbprint '证书的40位指纹' `
  -TimestampUrl 'https://你的服务商时间戳地址' `
  -OutputDirectory 'C:/ComTool-release/signed-0.1.1' `
  -CheckOnly
```

检查通过后去掉 `-CheckOnly` 即可构建、签名、生成安装版和绿色版。使用已有依赖时可加 `-SkipInstall`；自定义 Cargo 输出目录使用 `-CargoTargetDirectory`。

检查证书有效期、代码签名 EKU、私钥、证书链及在线吊销状态。不接受自签名证书；验证的是本机信任链，正式发布仍需确保证书来自公众信任的颁发机构。

构建通过 Tauri 的 Windows 签名配置签署主程序、NSIS 卸载程序及最终安装包，使用 SHA-256 和 RFC 3161 时间戳。分发前再次检查主程序和安装包的 Authenticode 状态、签名证书指纹及时间戳证书。任一阶段失败即停止，不自动降级为未签名构建。`signatures.json` 保存公开签名信息，`SHA256SUMS.txt` 保存最终分发文件校验值。

输出目录必须是新目录；中途失败的构建不得当作正式签名发布。需要验证安装包内部卸载程序时，使用隔离安装检查并对安装后的 uninstall.exe 执行 `Get-AuthenticodeSignature`；本次由于无证书，未验证成功签名路径。

签名不会自动保证免除 SmartScreen 提示；签名验证与 SmartScreen 信誉是不同检查。不要在签名后改动 EXE，重新打包/签名后需重新生成校验值。

## 本次验证边界

6 项定向检查通过：SHA-256/RFC3161 配置、无效指纹、不支持的时间戳协议、含凭据的 URL、缺失证书、真实未签名 EXE 拒绝。签名验证未修改原分发文件。`-CheckOnly` 缺少证书时在构建前退出已验证。成功签名、在线时间戳、签名卸载程序及受信任发布者展示仍待正式证书配置后验收。

参考：[Tauri Windows 签名](https://v2.tauri.app/distribute/sign/windows/)、[Microsoft SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool)。
