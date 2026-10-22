function New-ComToolSigningConfig {
    param([string]$Thumbprint,[string]$TimestampUrl)
    $thumb = ($Thumbprint -replace '\s','').ToUpperInvariant()
    if ($thumb -notmatch '^[0-9A-F]{40}$') { throw '请提供代码签名证书的 40 位指纹。' }
    $uri = $null
    if (-not [Uri]::TryCreate($TimestampUrl,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -notin @('http','https') -or $uri.UserInfo -or -not $uri.Host) { throw '请提供证书服务商的 HTTP/HTTPS RFC 3161 时间戳地址。' }
    return @{ bundle=@{ windows=@{ certificateThumbprint=$thumb;digestAlgorithm='sha256';timestampUrl=$uri.AbsoluteUri;tsp=$true } } }
}
function Get-ComToolSigningCertificate {
    param([string]$Thumbprint)
    $certificate = Get-Item -LiteralPath "Cert:/CurrentUser/My/$Thumbprint" -ErrorAction SilentlyContinue
    if (-not $certificate) { throw '当前用户证书库中没有指定证书。请先申请正式代码签名证书并按服务商说明配置；不要把私钥或密码发到聊天中。' }
    if (-not $certificate.HasPrivateKey) { throw '证书没有可用私钥。请配置硬件令牌或签名服务提供程序。' }
    if ($certificate.NotBefore -gt (Get-Date) -or $certificate.NotAfter -le (Get-Date)) { throw '签名证书尚未生效或已经过期。' }
    if ($certificate.Issuer -eq $certificate.Subject) { throw '此流程不接受自签名证书，请配置正式代码签名证书。' }
    $usages = @($certificate.Extensions | Where-Object { $_ -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } | ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value })
    if ('1.3.6.1.5.5.7.3.3' -notin $usages) { throw '此证书不具备代码签名用途。' }
    $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
    try {
        $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::Online
        $chain.ChainPolicy.UrlRetrievalTimeout = [TimeSpan]::FromSeconds(15)
        $chain.ChainPolicy.ApplicationPolicy.Add((New-Object System.Security.Cryptography.Oid('1.3.6.1.5.5.7.3.3')))
        if (-not $chain.Build($certificate)) { throw '证书信任链或吊销检查未通过。请检查证书、系统信任及网络，不会降级为未签名构建。' }
    } finally { $chain.Dispose() }
    return $certificate
}
function Assert-ComToolSignature {
    param([string]$Path,[string]$Thumbprint)
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $Thumbprint -or -not $signature.TimeStamperCertificate) { throw "签名或可信时间戳验证失败：$Path" }
    return [pscustomobject]@{File=[IO.Path]::GetFileName($Path);Status=[string]$signature.Status;Publisher=$signature.SignerCertificate.Subject;Thumbprint=$signature.SignerCertificate.Thumbprint;TimestampAuthority=$signature.TimeStamperCertificate.Subject;SHA256=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLower()}
}
