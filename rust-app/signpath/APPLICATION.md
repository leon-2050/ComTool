# SignPath Foundation 申请材料（已提交，待审核）

状态：2026-10-22 已提交，官方页面显示 Form submitted；尚未获批，当前发行包仍未签名。

官方入口：https://signpath.org/apply
资格条款：https://signpath.org/terms

## 可直接填写的项目信息

- Project name: ComTool (independently maintained variant, Rust workbench)
- Repository: https://github.com/leon-2050/ComTool
- Project documentation: https://github.com/leon-2050/ComTool/tree/main/rust-app
- Existing release: https://github.com/leon-2050/ComTool/releases/tag/rust-v0.1.0-preview.1
- License: LGPL-3.0; original notices and history retained; dependency notices distributed.
- Maintainer / proposed signing approver: GitHub @leon-2050 (roles pending confirmation; maintainer confirmed GitHub 2FA is enabled on 2026-10-21).
- Contact email: supplied separately by the maintainer; intentionally omitted from this repository document.
- Requested artifacts: Windows x64 Rust executable and NSIS installer/uninstaller, with the same executable also distributed in a portable ZIP.

## Project description

ComTool is a Windows communication workbench for serial-port communication, TCP/UDP debugging, and SSH terminals. The Rust application provides multiple sessions, persistent connection settings, text/hex sending and receiving, raw communication logs, raw file sending, and SSH authentication and host-key verification. Connections are initiated to endpoints specified by the operator. It is not a vulnerability scanner or exploitation tool.

## Provenance and eligibility question

This repository is an independently maintained variant based on Neutree/COMTool, with upstream history, authorship and license notices retained. GitHub currently reports fork=false, so it is not represented as a GitHub fork. The Rust workbench in rust-app/ is a newly implemented application; the repository also retains the original Python application. We request an eligibility assessment for the Rust workbench and its bundled dependencies. We do not claim to maintain the upstream project or request signing of upstream releases under our identity.

The repository was created on 2026-10-13 and had 0 stars when checked on 2026-10-21. We cannot claim established public reputation or that upstream publishes signed releases. Please advise whether this independently maintained Rust application is eligible given the Foundation's provenance, fork and reputation conditions.

## Build and validation

At submission time, source and dependency locks were public. Windows build and packaging scripts are in rust-app/scripts/. Existing local validation covers desktop startup, installation/uninstallation, TCP/UDP, SSH authentication and host-key checks, and connection configuration regressions. Real serial hardware, Win10, IME and other documented scenarios remain pending; see VALIDATION.md. At submission time, version 0.1.1 packages existed locally and the public preview remained 0.1.0. Subsequent Windows CI and preview publication use the separate Rust Windows workflow; see RELEASING.md for the current process.

There is not yet a verified Rust GitHub Actions signing pipeline. After eligibility approval, configure repository-origin verification, exact product/version restrictions, signed executable and NSIS artifacts, and manual release approval. No SignPath credentials or project identifiers exist in this repository yet.

## Post-submission work

- Contact email and mandatory consent were supplied for the submitted form; no marketing opt-in. Maintainer roles still require configuration in SignPath.
- GitHub 2FA confirmed enabled by the maintainer; subsequent SignPath MFA still required.
- Foundation eligibility decision about project provenance and reputation.
- Keep the signing policy published on project/release pages before activation.
- SignPath account access, application terms acceptance, project configuration and signing permissions, followed by verified automated builds.

Application is not approval; unsigned packages must not be labeled as signed.
