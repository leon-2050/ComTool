# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
param(
    [string]$Python = "python",
    [string]$OutputDirectory = "",
    [switch]$InstallDependencies
)
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repoRoot "dist" }
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
Push-Location $repoRoot
try {
    if ($InstallDependencies) {
        & $Python -m pip install -r requirements-windows-build.txt
        if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
    }
    & $Python -m COMTool.i18n finish
    if ($LASTEXITCODE -ne 0) { throw "Translation compilation failed" }
    & $Python -m PyInstaller --noconfirm --clean --onedir --windowed `
        --name ComTool --paths COMTool --icon COMTool/assets/comtool.ico `
        --distpath $OutputDirectory --workpath (Join-Path $repoRoot "build/windows") `
        --specpath $repoRoot `
        --add-data "COMTool/assets;assets" --add-data "COMTool/locales;locales" `
        --add-data "COMTool/protocols;protocols" --add-data "README.MD;." `
        --add-data "README_ZH.MD;." --add-data "LICENSE;." `
        --add-data "COPYING;." --add-data "COPYING.LESSER;." `
        --add-data "NOTICE.md;." --add-data "THIRD_PARTY_NOTICES.md;." `
        --hidden-import babel.numbers --hidden-import paramiko --hidden-import pyte `
        --hidden-import pyperclip `
        --hidden-import plugins.dbg --hidden-import plugins.protocol `
        --hidden-import plugins.terminal --hidden-import plugins.graph `
        --hidden-import COMTool.plugins.dbg --hidden-import COMTool.plugins.protocol `
        --hidden-import COMTool.plugins.terminal --hidden-import COMTool.plugins.graph COMTool/Main.py
    if ($LASTEXITCODE -ne 0) { throw "Windows build failed" }
    Write-Output (Join-Path $OutputDirectory "ComTool/ComTool.exe")
} finally {
    Pop-Location
}
