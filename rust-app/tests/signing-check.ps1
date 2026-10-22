param([Parameter(Mandatory=$true)][string]$UnsignedBinary)
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts/signing-common.ps1')
$checks = @()
$thumb = '0000000000000000000000000000000000000000'
$config = New-ComToolSigningConfig -Thumbprint (' '+$thumb+' ') -TimestampUrl 'https://timestamp.example.com'
if ($config.bundle.windows.certificateThumbprint -ne $thumb -or $config.bundle.windows.digestAlgorithm -ne 'sha256' -or -not $config.bundle.windows.tsp) { throw '签名配置错误。' }
$checks += 'SHA256/RFC3161 configuration'
foreach ($case in @(
    @{Name='invalid thumbprint';Thumb='not-a-certificate';Url='https://timestamp.example.com'},
    @{Name='invalid timestamp scheme';Thumb=$thumb;Url='file:///tmp/timestamp'},
    @{Name='credentials in URL';Thumb=$thumb;Url='https://user:password@example.com'}
)) {
    $blocked=$false
    try { $null=New-ComToolSigningConfig -Thumbprint $case.Thumb -TimestampUrl $case.Url } catch { $blocked=$true }
    if (-not $blocked) { throw "未拒绝：$($case.Name)" }
    $checks += $case.Name
}
$blocked=$false
try { $null=Get-ComToolSigningCertificate -Thumbprint $thumb } catch { $blocked=$true }
if (-not $blocked) { throw '缺少证书时未停止。' }
$checks += 'missing certificate blocks build'
$before=(Get-FileHash -LiteralPath $UnsignedBinary).Hash
$blocked=$false
try { $null=Assert-ComToolSignature -Path $UnsignedBinary -Thumbprint $thumb } catch { $blocked=$true }
if (-not $blocked) { throw '未签名程序被误判为已签名。' }
if ($before -ne (Get-FileHash -LiteralPath $UnsignedBinary).Hash) { throw '验证修改了原文件。' }
$checks += 'actual unsigned executable rejected without modification'
[pscustomobject]@{passed=$checks.Count;checks=$checks;boundary='No signing certificate available: successful signing and timestamp requests not exercised.'} | ConvertTo-Json -Depth 4
