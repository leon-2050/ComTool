; Compile-time only: preserve the exact executable embedded in this installer.
; Tauri restores release/ComTool.exe after bundling; that file can differ in its
; bundle-type marker and signature. No extra command runs during installation.
!macro NSIS_HOOK_PREINSTALL
  !if "$%COMTOOL_BUNDLE_BINARY%" != ""
    !system 'cmd.exe /d /c copy /b /y "${MAINBINARYSRCPATH}" "$%COMTOOL_BUNDLE_BINARY%" >nul' = 0
  !endif
!macroend
