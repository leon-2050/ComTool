# Code signing policy

## Status

The SignPath Foundation application was submitted on 2026-10-22. Approval is pending. Current ComTool Windows releases are unsigned. No certificate or signing service is currently provided to this project.

If approved and configured, intended acknowledgement: Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/). This conditional statement is not a claim of current sponsorship.

## Proposed roles (pending maintainer confirmation)

- Author and reviewer: [leon-2050](https://github.com/leon-2050).
- Release signing approver: [leon-2050](https://github.com/leon-2050).
- Outside contributions must be reviewed by a maintainer before signing; each release requires manual approval. MFA must be enabled for repository and signing access.

## Scope and provenance

Only verified builds of this project's Rust application are intended for signing. This repository retains code and history from [Neutree/COMTool](https://github.com/Neutree/COMTool); eligibility for this independently maintained variant must be reviewed by SignPath Foundation. Signing the upstream project's own releases is outside this request. Python bundles are outside the initial signing scope.

## Privacy and network behavior

The Rust workbench communicates with serial devices and network destinations configured by its operator. SSH authentication is sent to the configured SSH endpoint. Passwords may be retained in Windows Credential Manager only when requested by the user. Configuration and communication logs are stored locally. The Rust application has no application analytics or automatic update service configured. The installer may contact Microsoft to download WebView2 when it is missing. Microsoft WebView2 is a system runtime governed by Microsoft's applicable terms and privacy policy: https://privacy.microsoft.com/privacystatement .

## Release integrity

Signing must verify source repository and build origin, restrict product/version metadata, and require manual approval. Never publish a failed, test-signed or unsigned build as a Foundation-signed release. Preserve source and dependency license notices. Installation must provide an uninstall mechanism. These intended controls still require implementation and validation before production signing is enabled.
