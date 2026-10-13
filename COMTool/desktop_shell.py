# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
"""Compact desktop workspace, inspired by traditional terminal clients."""
from PyQt5.QtCore import Qt, QSize
from PyQt5.QtWidgets import (QWidget, QHBoxLayout, QVBoxLayout, QLabel, QToolButton,
    QMenuBar, QMenu, QFrame, QSplitter, QTreeWidget, QTreeWidgetItem, QLineEdit,
    QStackedWidget, QSizePolicy)
import qtawesome as qta

try:
    from i18n import _
    import utils_ui, parameters
    from conn import ConnectionStatus
except ImportError:
    from COMTool.i18n import _
    from COMTool import utils_ui, parameters
    from COMTool.conn import ConnectionStatus


class WorkspaceShell:
    def buildWorkspace(self):
        self.contentLayout.setContentsMargins(0, 0, 0, 0)
        self.contentLayout.setSpacing(0)
        self.rootLayout.setSpacing(0)
        menu = QMenuBar()
        menu.setObjectName("workspaceMenu")
        menu.setNativeMenuBar(False)
        sessions = menu.addMenu(_("Sessions"))
        sessions.addAction(_("Serial session"), lambda: self.createSession("serial"))
        sessions.addAction(_("Network session"), lambda: self.createSession("tcp_udp"))
        sessions.addAction(_("SSH terminal"), lambda: self.createSession("ssh"))
        sessions.addSeparator()
        sessions.addAction(_("Close session"), lambda: self.closeTab(self.tabWidget.currentIndex()))
        sessions.addAction(_("Exit"), self.close)
        view = menu.addMenu(_("View"))
        view.addAction(_("Session sidebar"), self.toggleSessionSidebar)
        view.addAction(_("Connection settings"), self.toggleSettings)
        view.addAction(_("Tools"), self.toggleFunctional)
        view.addSeparator()
        for skin in utils_ui.get_skins():
            view.addAction(_(skin), lambda checked=False, s=skin: self.skinButton.setCurrentIndex(utils_ui.get_skins().index(s)))
        plugins = menu.addMenu(_("Plugins"))
        plugins.aboutToShow.connect(lambda: self.populatePluginMenu(plugins))
        settings = menu.addMenu(_("Settings"))
        settings.addAction(_("Connection settings"), self.toggleSettings)
        language = settings.addMenu(_("Language"))
        for idx, label in enumerate(self.languages.values()):
            language.addAction(label, lambda checked=False, i=idx: self.languageCombobox.setCurrentIndex(i))
        help_menu = menu.addMenu(_("Help"))
        help_menu.addAction(_("Help"), self.showAbout)
        self.contentLayout.addWidget(menu)

        toolbar = QWidget()
        toolbar.setObjectName("workspaceToolbar")
        toolbar.setFixedHeight(66)
        row = QHBoxLayout(toolbar)
        row.setContentsMargins(8, 2, 8, 2)
        row.setSpacing(3)
        self.toolbarButtons = {}
        def action(key, label, icon, color, callback):
            button = QToolButton()
            button.setObjectName("workspaceAction")
            button.setText(label)
            button.setToolTip(label)
            button.setIcon(qta.icon(icon, color=color))
            button.setIconSize(QSize(25, 25))
            button.setToolButtonStyle(Qt.ToolButtonTextUnderIcon)
            button.setFixedSize(66, 58)
            button.clicked.connect(callback)
            row.addWidget(button)
            self.toolbarButtons[key] = button
            return button
        new = action("new", _("New session"), "fa.plus-square", "#668d33", lambda: None)
        new_menu = QMenu(new)
        new_menu.addAction(_("Serial session"), lambda: self.createSession("serial"))
        new_menu.addAction(_("Network session"), lambda: self.createSession("tcp_udp"))
        new_menu.addAction(_("SSH terminal"), lambda: self.createSession("ssh"))
        new.setMenu(new_menu)
        new.setPopupMode(QToolButton.InstantPopup)
        action("serial", _("Serial"), "fa.usb", "#3c779e", lambda: self.createSession("serial"))
        action("network", _("Network"), "fa.sitemap", "#4c8d7a", lambda: self.createSession("tcp_udp"))
        action("terminal", _("Terminal"), "fa.terminal", "#566473", lambda: self.createSession("ssh"))
        line = QFrame()
        line.setFrameShape(QFrame.VLine)
        row.addWidget(line)
        action("sessions", _("Sessions"), "fa.folder-open", "#b18d3e", self.toggleSessionSidebar)
        action("connection", _("Connection"), "fa.plug", "#648b36", self.toggleCurrentConnection)
        action("settings", _("Settings"), "fa.sliders", "#647783", self.toggleSettings)
        action("tools", _("Tools"), "fa.wrench", "#777585", self.toggleFunctional)
        action("clear", _("Clear"), "mdi.broom", "#8b745a", self.clearCurrentConsole)
        action("help", _("Help"), "fa.question-circle", "#5590aa", self.showAbout)
        row.addStretch(1)
        product = QLabel(parameters.appName)
        product.setObjectName("workspaceBrand")
        row.addWidget(product)
        self.contentLayout.addWidget(toolbar)

        body = QWidget()
        body_layout = QHBoxLayout(body)
        body_layout.setContentsMargins(0, 0, 0, 0)
        body_layout.setSpacing(0)
        rail = QWidget()
        rail.setObjectName("workspaceRail")
        rail.setFixedWidth(30)
        rail_layout = QVBoxLayout(rail)
        rail_layout.setContentsMargins(0, 8, 0, 0)
        for label, icon, callback in ((_("Sessions"), "fa.folder", self.toggleSessionSidebar),
                (_("Settings"), "fa.sliders", self.toggleSettings),
                (_("Tools"), "fa.wrench", self.toggleFunctional)):
            button = QToolButton()
            button.setIcon(qta.icon(icon, color="#536269"))
            button.setToolTip(label)
            button.setFixedSize(30, 32)
            button.clicked.connect(callback)
            rail_layout.addWidget(button)
        rail_layout.addStretch()
        body_layout.addWidget(rail)
        self.workspaceSplitter = QSplitter(Qt.Horizontal)
        self.workspaceSplitter.setHandleWidth(3)
        self.workspaceSplitter.setChildrenCollapsible(False)
        body_layout.addWidget(self.workspaceSplitter)
        self.sessionSidebar = QWidget()
        self.sessionSidebar.setObjectName("sessionSidebar")
        self.sessionSidebar.setMinimumWidth(230)
        left = QVBoxLayout(self.sessionSidebar)
        left.setContentsMargins(7, 6, 7, 0)
        left.setSpacing(5)
        heading = QLabel(_("Sessions"))
        heading.setObjectName("sidebarHeading")
        left.addWidget(heading)
        self.sessionSearch = QLineEdit()
        self.sessionSearch.setPlaceholderText(_("Find a session…"))
        self.sessionSearch.setClearButtonEnabled(True)
        left.addWidget(self.sessionSearch)
        self.sessionTree = QTreeWidget()
        self.sessionTree.setObjectName("sessionTree")
        self.sessionTree.setHeaderHidden(True)
        self.sessionTree.setUniformRowHeights(True)
        self.sessionTree.setIndentation(16)
        self.sessionTree.setFixedHeight(134)
        self.sessionTree.itemClicked.connect(self.selectSession)
        self.sessionSearch.textChanged.connect(self.filterSessions)
        left.addWidget(self.sessionTree)
        details = QLabel(_("Connection settings"))
        details.setObjectName("sidebarHeading")
        left.addWidget(details)
        self.sidebarStack = QStackedWidget()
        left.addWidget(self.sidebarStack, 1)
        self.workspaceSplitter.addWidget(self.sessionSidebar)
        work = QWidget()
        work.setObjectName("terminalWorkspace")
        work_layout = QVBoxLayout(work)
        work_layout.setContentsMargins(0, 0, 0, 0)
        work_layout.setSpacing(0)
        self.tabWidget.setCornerWidget(None, Qt.TopLeftCorner)
        corner = QWidget()
        corner_layout = QHBoxLayout(corner)
        corner_layout.setContentsMargins(4, 0, 4, 0)
        corner_layout.setSpacing(5)
        corner_layout.addWidget(self.pluginsSelector)
        corner_layout.addWidget(self.encodingCombobox)
        self.encodingCombobox.setMaximumWidth(110)
        self.tabWidget.setCornerWidget(corner, Qt.TopRightCorner)
        work_layout.addWidget(self.tabWidget)
        self.workspaceSplitter.addWidget(work)
        self.workspaceSplitter.setStretchFactor(0, 0)
        self.workspaceSplitter.setStretchFactor(1, 1)
        self.workspaceSplitter.setSizes([260, 920])
        self.contentLayout.addWidget(body, 1)

    def populatePluginMenu(self, menu):
        menu.clear()
        for plugin in self.pluginClasses:
            menu.addAction(plugin.name, lambda checked=False, p=plugin: self.addItem(p, setCurrent=True))

    def createSession(self, conn_id):
        plugin = self.getPluginClassById("terminal" if conn_id == "ssh" else "dbg")
        if plugin:
            self.addItem(plugin, setCurrent=True, connsConfigs={"currConn": conn_id})

    def refreshSessions(self):
        if not hasattr(self, "sessionTree"):
            return
        self.sessionTree.blockSignals(True)
        self.sessionTree.clear()
        folder = QTreeWidgetItem(self.sessionTree, [_("Workspace sessions")])
        folder.setIcon(0, qta.icon("fa.folder-open", color="#a98b3f"))
        folder.setExpanded(True)
        current = self.tabWidget.currentWidget()
        icons = {"dbg": "fa.exchange", "protocol": "fa.code", "terminal": "fa.terminal", "graph": "fa.line-chart"}
        for i in range(self.tabWidget.count()):
            widget = self.tabWidget.widget(i)
            item = next((it for it in self.items if it.widget == widget), None)
            if not item:
                continue
            node = QTreeWidgetItem(folder, [item.name])
            node.setData(0, Qt.UserRole, item.name)
            node.setIcon(0, qta.icon(icons.get(item.plugin.id, "fa.cube"), color="#547e5c"))
            if widget == current:
                self.sessionTree.setCurrentItem(node)
        self.sessionTree.blockSignals(False)
        self.filterSessions(self.sessionSearch.text())

    def filterSessions(self, query):
        folder = self.sessionTree.topLevelItem(0)
        if folder:
            for i in range(folder.childCount()):
                node = folder.child(i)
                node.setHidden(query.casefold() not in node.text(0).casefold())

    def selectSession(self, node, column):
        name = node.data(0, Qt.UserRole)
        for item in self.items:
            if item.name == name:
                self.tabWidget.setCurrentWidget(item.widget)
                break

    def syncWorkspace(self):
        item = self.getCurrentItem()
        if item and hasattr(self, "sidebarStack"):
            self.sidebarStack.setCurrentWidget(item.settingWidget)
            connected = item.plugin.getConnStatus() == ConnectionStatus.CONNECTED if item.isAddConn else False
            self.toolbarButtons["connection"].setText(_("Disconnect") if connected else _("Connection"))
            self.toolbarButtons["connection"].setEnabled(item.isAddConn)
            self.toolbarButtons["clear"].setEnabled(hasattr(item.plugin, "clearReceiveBuffer") or hasattr(item.plugin, "clearBtn"))
        self.refreshSessions()

    def toggleSessionSidebar(self):
        self.sessionSidebar.setVisible(not self.sessionSidebar.isVisible())

    def toggleCurrentConnection(self):
        item = self.getCurrentItem()
        if item and item.isAddConn:
            button = getattr(item.conns[item.currConnIdx], "serialOpenCloseButton", None)
            if button:
                button.click()

    def clearCurrentConsole(self):
        item = self.getCurrentItem()
        if item:
            plugin = item.plugin
            if hasattr(plugin, "clearReceiveBuffer"):
                plugin.clearReceiveBuffer()
            elif hasattr(plugin, "clearBtn"):
                plugin.clearBtn.click()
