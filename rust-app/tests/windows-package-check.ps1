param(
    [Parameter(Mandatory=$true)][string]$Installer,
    [Parameter(Mandatory=$true)][string]$PortableBinary,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$PortableBinary = (Resolve-Path -LiteralPath $PortableBinary).Path
$projectRoot = Split-Path $PSScriptRoot -Parent
$product = 'ComTool Rust Preview'
$uninstallKey = "HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/$product"
$productKey = "HKCU:/Software/github/$product"
if (Test-Path -LiteralPath $uninstallKey) { throw '本机已有安装版，停止隔离安装测试，避免修改现有安装。' }
$previousProductValues = @()
if (Test-Path -LiteralPath $productKey) {
    $previousKey = Get-Item -LiteralPath $productKey
    if ($previousKey.SubKeyCount) { throw '安装设置含子项，停止测试以保留原设置。' }
    $previousProductValues = @($previousKey.GetValueNames() | ForEach-Object {
        [pscustomobject]@{ Name=$_; Value=$previousKey.GetValue($_); Kind=$previousKey.GetValueKind($_) }
    })
}
$desktopLink = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) "$product.lnk"
$startLink = Join-Path ([Environment]::GetFolderPath('Programs')) "$product.lnk"
if ((Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $startLink)) { throw '已有同名快捷方式，停止测试。' }
if (Test-Path -LiteralPath $OutputDirectory) { throw '测试目录已存在，请指定新的目录。' }
$outputRoot = (New-Item -ItemType Directory -Path $OutputDirectory).FullName
$installRoot = Join-Path $outputRoot 'installed'
$userConfig = Join-Path $env:APPDATA 'ComToolRust/config.json'
$originalConfigHash = if (Test-Path -LiteralPath $userConfig) { (Get-FileHash -LiteralPath $userConfig).Hash } else { '' }
$installerProcess = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$installRoot") -WindowStyle Hidden -PassThru -Wait
if ($installerProcess.ExitCode -ne 0) { throw "安装失败：$($installerProcess.ExitCode)" }
$installedBinary = Join-Path $installRoot 'ComTool.exe'
if (-not (Test-Path -LiteralPath $installedBinary)) { throw '安装完成但程序不存在。' }
$expectedHash = (Get-FileHash -LiteralPath $PortableBinary).Hash
if ((Get-FileHash -LiteralPath $installedBinary).Hash -ne $expectedHash) { throw '安装版和绿色版程序不一致。' }
$version = (Get-Item -LiteralPath $installedBinary).VersionInfo.ProductVersion
$entry = Get-ItemProperty -LiteralPath $uninstallKey
if ($entry.DisplayVersion -ne $version.TrimEnd('.0')) {
    if (-not $version.StartsWith($entry.DisplayVersion)) { throw '卸载信息版本不匹配。' }
}
$licenseCount = @(Get-ChildItem (Join-Path $installRoot 'licenses') -File).Count
if ($licenseCount -lt 23) { throw '许可文件不完整。' }
if (-not ((Test-Path -LiteralPath $desktopLink) -and (Test-Path -LiteralPath $startLink))) { throw '缺少快捷方式。' }
$shortcutShell = New-Object -ComObject WScript.Shell
foreach ($link in @($desktopLink,$startLink)) {
    if ($shortcutShell.CreateShortcut($link).TargetPath -ne $installedBinary) { throw '快捷方式目标错误。' }
}
& node (Join-Path $PSScriptRoot 'native-smoke.mjs') $installedBinary (Join-Path $outputRoot 'installed-smoke')
if ($LASTEXITCODE) { throw '安装后桌面启动检查失败。' }
& node (Join-Path $PSScriptRoot 'native-protocol-modes.mjs') $installedBinary (Join-Path $outputRoot 'installed-modes')
if ($LASTEXITCODE) { throw '安装后连接模式检查失败。' }
$uninstaller = Join-Path $installRoot 'uninstall.exe'
$uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList @('/S', "_?=$installRoot") -WindowStyle Hidden -PassThru -Wait
if ($uninstallProcess.ExitCode -ne 0) { throw "卸载失败：$($uninstallProcess.ExitCode)" }
if ((Test-Path -LiteralPath $installedBinary) -or (Test-Path -LiteralPath $uninstallKey)) { throw '程序或卸载注册项未清理。' }
if ((Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $startLink)) { throw '快捷方式未清理。' }
$afterConfigHash = if (Test-Path -LiteralPath $userConfig) { (Get-FileHash -LiteralPath $userConfig).Hash } else { '' }
if ($originalConfigHash -ne $afterConfigHash) { throw '实际用户配置被修改。' }
# Remove only the installation-location key created by this isolated test.
if (Test-Path -LiteralPath $productKey) {
    $leftover = Get-ItemProperty -LiteralPath $productKey
    if ($leftover.'(default)' -and $leftover.'(default)' -ne $installRoot) { throw '安装位置已变化，保留注册项。' }
    Remove-Item -LiteralPath $productKey -Recurse
}
if ($previousProductValues.Count) {
    New-Item -Path $productKey -Force | Out-Null
    $restoredKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\github\$product", $true)
    foreach ($value in $previousProductValues) { $restoredKey.SetValue($value.Name,$value.Value,$value.Kind) }
    $restoredKey.Dispose()
}
$report = [ordered]@{ version=$version; installExitCode=$installerProcess.ExitCode; installedMatchesPortable=$true; licenseFileCount=$licenseCount; desktopAndStartMenuShortcuts=$true; installedStartup=$true; protocolModes=$true; uninstallExitCode=$uninstallProcess.ExitCode; uninstallRegistrationRemoved=$true; shortcutsRemoved=$true; realUserConfigUntouched=$true; webviewAlreadyInstalled=$true; boundary='Current Windows host, existing WebView2; clean Win10 and missing-runtime installation remain unverified.' }
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputRoot 'installer-report.json') -Encoding utf8
$report | ConvertTo-Json -Compress
