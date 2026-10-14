param([switch]$SkipInstall, [switch]$NoBundle)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
# A standard rustup installation is preferred. The workspace toolchain is optional.
$localToolchain = Join-Path (Split-Path (Split-Path (Get-Location) -Parent) -Parent) 'work\toolchains'
if (-not (Get-Command cargo -ErrorAction SilentlyContinue) -and (Test-Path "$localToolchain\cargo\bin\cargo.exe")) {
    $env:CARGO_HOME = "$localToolchain\cargo"
    $env:RUSTUP_HOME = "$localToolchain\rustup"
    $env:Path = "$env:CARGO_HOME\bin;$env:Path"
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw '请安装 Rust MSVC 工具链：https://rustup.rs/' }
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) { throw '请安装 Visual Studio Build Tools 的“使用 C++ 的桌面开发”和 Windows SDK。' }
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $installation) { throw '未找到 MSVC x64 C++ 编译工具。' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
if (-not $SkipInstall) { & npm ci; if ($LASTEXITCODE) { throw '前端依赖安装失败' } }
& npm test; if ($LASTEXITCODE) { throw '前端测试失败' }
& cmd.exe /d /s /c "`"$vcvars`" >nul && cargo test --manifest-path src-tauri/Cargo.toml --release --lib --locked"
if ($LASTEXITCODE) { throw 'Rust 测试失败' }
if ($NoBundle) {
    & npm run build; if ($LASTEXITCODE) { throw '界面构建失败' }
    & cmd.exe /d /s /c "`"$vcvars`" >nul && cargo build --manifest-path src-tauri/Cargo.toml --release --locked"
} else {
    & cmd.exe /d /s /c "`"$vcvars`" >nul && node node_modules/@tauri-apps/cli/tauri.js build --ci"
}
if ($LASTEXITCODE) { throw 'Windows 构建失败' }
Write-Host '构建完成。安装包位于 Cargo 输出目录的 release/bundle/nsis。'
