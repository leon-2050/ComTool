param(
    [Parameter(Mandatory=$true)][string]$CertificateThumbprint,
    [Parameter(Mandatory=$true)][string]$TimestampUrl,
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [string]$CargoTargetDirectory=$env:CARGO_TARGET_DIR,
    [switch]$SkipInstall,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'signing-common.ps1')
$config = New-ComToolSigningConfig -Thumbprint $CertificateThumbprint -TimestampUrl $TimestampUrl
$thumb = $config.bundle.windows.certificateThumbprint
$certificate = Get-ComToolSigningCertificate -Thumbprint $thumb
if ($CheckOnly) { Write-Host "签名前检查通过：$($certificate.Subject)；尚未签署任何文件。"; return }
if (Test-Path -LiteralPath $OutputDirectory) { throw '输出目录已存在，请选择新目录。' }
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $CargoTargetDirectory) { $CargoTargetDirectory = Join-Path $projectRoot 'src-tauri/target' }
$CargoTargetDirectory = [IO.Path]::GetFullPath($CargoTargetDirectory)
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$configPath = Join-Path ([IO.Path]::GetTempPath()) ("ComTool-signing-"+[Guid]::NewGuid().ToString('N')+'.json')
$config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $configPath -Encoding utf8
$beforeTarget = $env:CARGO_TARGET_DIR
try {
    $env:CARGO_TARGET_DIR = $CargoTargetDirectory
    & (Join-Path $PSScriptRoot 'build-windows.ps1') -SkipInstall:$SkipInstall -SigningConfigPath $configPath
    $version = (Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
    $binary = Join-Path $CargoTargetDirectory 'release/distribution/ComTool.exe'
    $installer = Get-ChildItem (Join-Path $CargoTargetDirectory 'release/bundle/nsis') -Filter "*_${version}_x64-setup.exe" | Select-Object -First 1
    if (-not $installer) { throw '缺少本次安装包。' }
    $report = @((Assert-ComToolSignature -Path $binary -Thumbprint $thumb),(Assert-ComToolSignature -Path $installer.FullName -Thumbprint $thumb))
    & (Join-Path $PSScriptRoot 'package-windows.ps1') -OutputDirectory $OutputDirectory -CargoTargetDirectory $CargoTargetDirectory
    $report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'signatures.json') -Encoding utf8
    Write-Host "签名和打包验证通过：$OutputDirectory"
} finally {
    $env:CARGO_TARGET_DIR = $beforeTarget
    Remove-Item -LiteralPath $configPath -ErrorAction SilentlyContinue
}
