# 第三方组件说明

项目源码沿用上游 LGPLv3。下面是已验证构建环境中的主要依赖许可概览；依赖组件没有被重新授权为本项目许可证。完整版本清单见 [requirements-windows-build.txt](requirements-windows-build.txt)。

| 组件 | 构建版本 | 许可及归属 |
| --- | --- | --- |
| Python | 3.12.14 | Python Software Foundation 及其许可；参见 [Python 许可](https://docs.python.org/3/license.html)。 |
| PyQt5 | 5.15.11 | Riverbank Computing，GPLv3／商业双重许可；本地开源构建安装包标注 GPLv3。[官方说明](https://www.riverbankcomputing.com/software/pyqt)。 |
| Qt（PyQt5-Qt5） | 5.15.2 | The Qt Company 与贡献者；主要模块 LGPLv3，部分模块和第三方内容有不同许可，以具体组件材料为准。[Qt 许可](https://www.qt.io/licensing/open-source-lgpl-obligations)。 |
| PyQt5-sip | 12.20.0 | Riverbank Computing，BSD-2-Clause。 |
| Paramiko | 5.0.0 | Paramiko 项目与贡献者，LGPL-2.1。 |
| pyte | 0.8.2 | pyte 项目与贡献者，LGPLv3。 |
| pyqtgraph | 0.14.0 | pyqtgraph 项目与贡献者，MIT。 |
| pyserial | 3.5 | pySerial 项目与贡献者，BSD。 |
| QtAwesome | 1.3.1 | QtAwesome 项目与贡献者，代码为 MIT；其图标/字体另有各自许可。当前主要界面图标由本次修改独立绘制，自定义图标回退仍可使用 QtAwesome。 |
| NumPy | 2.5.4 | NumPy 贡献者；主要 BSD-3-Clause，安装包还包含其他许可的第三方内容，以 NumPy 的 LICENSE 与组件许可为准。 |
| Requests | 2.34.2 | Requests 项目与贡献者，Apache-2.0。 |
| PyInstaller | 6.22.3 | PyInstaller Development Team，GPLv2-or-later，附 bootloader 分发例外；例外不替代应用及其其他依赖的许可。 |
| pyperclip | 1.11.0 | pyperclip 项目与贡献者，BSD。 |
| Babel | 2.18.0 | Babel 项目与贡献者，BSD-3-Clause；语言数据另有 Unicode 通知。 |
| QtPy | 2.4.3 | QtPy 项目与贡献者，MIT。 |
| wcwidth | 0.9.2 | wcwidth 项目与贡献者，MIT。 |

此清单根据构建环境的包 metadata 与所附 LICENSE 整理，列出主要组件而非所有传递依赖的全部版权通知。本仓库不内置这些第三方库的源码或二进制。

## 打包程序分发

源码授权与包含第三方库的组合程序授权应分别核对。使用 GPLv3 版 PyQt5 构建并发布程序时，须满足 GPLv3 的对应源码等要求；Qt、Paramiko 及其他组件也需各自满足许可条件。不能仅凭本项目的 LGPLv3 声明，把整套运行库称为 LGPLv3。

公开发布二进制时，需要为同一版本提供可修改的项目源码、构建脚本、依赖版本及对应的组件源码获取方式，随包提供适用许可证和版权通知，并确保用户能依照许可修改与再构建。原项目及本次改动的来源见 [NOTICE.md](NOTICE.md)。

本次提交只发布项目源码、图标资源及构建文件，没有把本地 Windows 压缩包或第三方运行库上传为 Release。
