param(
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [string]$CargoTargetDirectory = $env:CARGO_TARGET_DIR
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if (-not $CargoTargetDirectory) { $CargoTargetDirectory = Join-Path $projectRoot 'src-tauri/target' }
$releaseRoot = Join-Path $CargoTargetDirectory 'release'
$binary = Join-Path $releaseRoot 'distribution/ComTool.exe'
$installer = Get-ChildItem (Join-Path $releaseRoot 'bundle/nsis') -Filter "*_${version}_x64-setup.exe" | Select-Object -First 1
if (-not (Test-Path -LiteralPath $binary) -or -not $installer) { throw '请先完成 Windows NSIS 构建。' }
if (Test-Path -LiteralPath $OutputDirectory) { throw '输出目录已存在，请使用新的目录。' }
$outputRoot = (New-Item -ItemType Directory -Path $OutputDirectory).FullName
$portableRoot = Join-Path $outputRoot 'ComTool'
New-Item -ItemType Directory -Path $portableRoot | Out-Null
Copy-Item -LiteralPath $binary -Destination $portableRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'src-tauri/licenses') -Destination $portableRoot -Recurse
$installerTarget = Join-Path $outputRoot "ComTool-${version}-Windows-x64-setup.exe"
Copy-Item -LiteralPath $installer.FullName -Destination $installerTarget
$readme = @"
ComTool $version（Windows x64 预览版）

安装版：运行 ComTool-$version-Windows-x64-setup.exe，按提示完成安装。
绿色版：解压 ComTool-$version-Windows-x64-portable.zip，运行 ComTool/ComTool.exe。

安装版为当前用户安装，提供开始菜单入口及卸载项；缺少 WebView2 时尝试联网安装。
绿色版需要已安装 Microsoft Edge WebView2 Runtime。两者的通信功能相同。

两种版本共用 %APPDATA%\ComToolRust\config.json，配置不保存在程序目录。
升级前可从应用菜单导出配置；新版本无需手动迁移现有 Rust 配置。
卸载时不要勾选删除应用数据，除非确实需要清除本机数据。
不要同时运行安装版和绿色版编辑同一份配置。

串口/TCP/UDP 使用收发界面，SSH 使用交互终端。
真实串口、Win10 实机、中文输入法及磁盘满等场景仍待验收。
许可证文件位于 licenses/，源码：https://github.com/leon-2050/ComTool/tree/main/rust-app
此版本未配置自动更新，需要手动下载安装新版。
"@
Set-Content -LiteralPath (Join-Path $outputRoot '使用说明.txt') -Value $readme -Encoding utf8
Set-Content -LiteralPath (Join-Path $portableRoot '使用说明.txt') -Value $readme -Encoding utf8
$portableZip = Join-Path $outputRoot "ComTool-${version}-Windows-x64-portable.zip"
Compress-Archive -LiteralPath $portableRoot -DestinationPath $portableZip -CompressionLevel Optimal
$hashes = @($installerTarget, $portableZip) | ForEach-Object {
    $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
    "$($hash.Hash.ToLower())  $([System.IO.Path]::GetFileName($_))"
}
[IO.File]::WriteAllText((Join-Path $outputRoot 'SHA256SUMS.txt'), ($hashes -join "`n") + "`n", [Text.Encoding]::ASCII)
Write-Host "安装版和绿色版已生成：$outputRoot"
