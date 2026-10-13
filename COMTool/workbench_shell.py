# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
"""A communication workbench with a single context-sensitive inspector drawer."""
from PyQt5.QtCore import Qt, QSize
from PyQt5.QtWidgets import (QWidget, QHBoxLayout, QVBoxLayout, QLabel, QToolButton,
    QMenu, QSplitter, QTreeWidget, QTreeWidgetItem, QLineEdit, QStackedWidget, QSizePolicy)
try:
    from desktop_shell import WorkspaceShell as SessionActions
    from i18n import _
    import utils_ui
    from conn import ConnectionStatus
except ImportError:
    from .desktop_shell import WorkspaceShell as SessionActions
    from .i18n import _
    from . import utils_ui
    from .conn import ConnectionStatus


class WorkspaceShell(SessionActions):
    def buildWorkspace(self):
        self.contentLayout.setContentsMargins(0, 0, 0, 0)
        self.contentLayout.setSpacing(0)
        self.rootLayout.setSpacing(0)
        self.toolbarButtons = {}
        self.shellIcons = []
        self._drawerRestoreSidebar = False
        header = QWidget()
        header.setObjectName("workspaceToolbar")
        header.setFixedHeight(62)
        row = QHBoxLayout(header)
        row.setContentsMargins(18, 8, 18, 8)
        row.setSpacing(10)
        side_toggle = self.shellButton("fa.columns", _("Session sidebar"), self.toggleSessionSidebar)
        side_toggle.setFixedWidth(34)
        row.addWidget(side_toggle)
        title = QVBoxLayout()
        title.setSpacing(1)
        self.workspaceTitle = QLabel(_("Debug workspace"))
        self.workspaceTitle.setObjectName("workspaceTitle")
        self.workspaceTitle.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
        self.connectionSummary = QLabel(_("Ready to connect"))
        self.connectionSummary.setObjectName("connectionSummary")
        self.connectionSummary.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
        title.addWidget(self.workspaceTitle)
        title.addWidget(self.connectionSummary)
        row.addLayout(title, 1)
        self.connectionBadge = QLabel()
        self.connectionBadge.setObjectName("connectionBadge")
        self.connectionBadge.setFixedHeight(26)
        row.addWidget(self.connectionBadge)
        settings = self.shellButton("mdi.tune", _("Connection settings"), self.toggleSettings, text=True)
        row.addWidget(settings)
        self.toolbarButtons["settings"] = settings
        tools = self.shellButton("mdi.toolbox-outline", _("Tools"), self.toggleFunctional, text=True)
        row.addWidget(tools)
        self.toolbarButtons["tools"] = tools
        connect = self.shellButton("fa.plug", _("Connection"), self.toggleCurrentConnection, text=True, primary=True)
        connect.setObjectName("connectAction")
        row.addWidget(connect)
        self.toolbarButtons["connection"] = connect
        # Preserve the existing action interface without a duplicate clear button.
        self.toolbarButtons["clear"] = QToolButton(self)
        self.toolbarButtons["clear"].hide()
        self.toolbarButtons["clear"].clicked.connect(self.clearCurrentConsole)
        self.contentLayout.addWidget(header)

        self.workspaceSplitter = QSplitter(Qt.Horizontal)
        self.workspaceSplitter.setHandleWidth(1)
        self.workspaceSplitter.setChildrenCollapsible(False)
        self.sessionSidebar = QWidget()
        self.sessionSidebar.setObjectName("sessionSidebar")
        self.sessionSidebar.setMinimumWidth(184)
        self.sessionSidebar.setMaximumWidth(320)
        left = QVBoxLayout(self.sessionSidebar)
        left.setContentsMargins(14, 18, 14, 14)
        left.setSpacing(12)
        session_header = QHBoxLayout()
        heading = QLabel(_("Sessions"))
        heading.setObjectName("sidebarHeading")
        session_header.addWidget(heading, 1)
        new = self.shellButton("fa.plus", _("New session"), lambda: None)
        new.setObjectName("newSessionButton")
        new.setFixedSize(28, 28)
        new_menu = QMenu(new)
        self.addConnectionActions(new_menu)
        new.setMenu(new_menu)
        new.setPopupMode(QToolButton.InstantPopup)
        session_header.addWidget(new)
        left.addLayout(session_header)
        self.sessionSearch = QLineEdit()
        self.sessionSearch.setObjectName("sessionSearch")
        self.sessionSearch.setPlaceholderText(_("Find a session…"))
        self.sessionSearch.setAccessibleName(_("Find a session…"))
        self.sessionSearch.setClearButtonEnabled(True)
        left.addWidget(self.sessionSearch)
        self.sessionTree = QTreeWidget()
        self.sessionTree.setObjectName("sessionTree")
        self.sessionTree.setHeaderHidden(True)
        self.sessionTree.setUniformRowHeights(True)
        self.sessionTree.setIndentation(10)
        self.sessionTree.setIconSize(QSize(18, 18))
        self.sessionTree.setAccessibleName(_("Sessions"))
        self.sessionTree.itemClicked.connect(self.selectSession)
        self.sessionSearch.textChanged.connect(self.filterSessions)
        left.addWidget(self.sessionTree, 1)
        self.sessionCount = QLabel()
        self.sessionCount.setProperty("class", "mutedText")
        left.addWidget(self.sessionCount)
        self.workspaceSplitter.addWidget(self.sessionSidebar)

        work = QWidget()
        work.setObjectName("terminalWorkspace")
        work_layout = QVBoxLayout(work)
        work_layout.setContentsMargins(18, 12, 18, 0)
        work_layout.setSpacing(0)
        self.tabWidget.setCornerWidget(None, Qt.TopLeftCorner)
        corner = QWidget()
        corner_layout = QHBoxLayout(corner)
        corner_layout.setContentsMargins(0, 0, 0, 0)
        corner_layout.setSpacing(6)
        self.encodingCombobox.setToolTip(_("Text encoding"))
        self.encodingCombobox.setAccessibleName(_("Text encoding"))
        corner_layout.addWidget(self.encodingCombobox)
        self.encodingCombobox.setMaximumWidth(98)
        self.tabWidget.setCornerWidget(corner, Qt.TopRightCorner)
        work_layout.addWidget(self.tabWidget)
        self.workspaceSplitter.addWidget(work)

        self.inspectorDrawer = QWidget()
        self.inspectorDrawer.setObjectName("inspectorDrawer")
        self.inspectorDrawer.setMinimumWidth(296)
        self.inspectorDrawer.setMaximumWidth(430)
        drawer = QVBoxLayout(self.inspectorDrawer)
        drawer.setContentsMargins(14, 16, 14, 12)
        drawer.setSpacing(10)
        drawer_header = QHBoxLayout()
        self.sidebarHeading = QLabel(_("Inspector"))
        self.sidebarHeading.setObjectName("sidebarHeading")
        drawer_header.addWidget(self.sidebarHeading, 1)
        close = self.shellButton("mdi.close", _("Close inspector"), self.closeInspector)
        close.setFixedSize(28, 28)
        drawer_header.addWidget(close)
        drawer.addLayout(drawer_header)
        self.drawerPages = QStackedWidget()
        self.sidebarStack = QStackedWidget()
        self.toolsStack = QStackedWidget()
        self.drawerPages.addWidget(self.sidebarStack)
        self.drawerPages.addWidget(self.toolsStack)
        drawer.addWidget(self.drawerPages, 1)
        self.workspaceSplitter.addWidget(self.inspectorDrawer)
        self.workspaceSplitter.setStretchFactor(0, 0)
        self.workspaceSplitter.setStretchFactor(1, 1)
        self.workspaceSplitter.setStretchFactor(2, 0)
        self.workspaceSplitter.setSizes([208, 880, 310])
        self.inspectorDrawer.hide()
        self.contentLayout.addWidget(self.workspaceSplitter, 1)

        self.themeAction = self.shellButton("mdi.theme-light-dark", _("Appearance"), self.toggleWorkspaceTheme)
        self.moreAction = self.shellButton("mdi.dots-horizontal", _("Workspace menu"), lambda: None)
        for button in (self.themeAction, self.moreAction):
            button.setFixedSize(30, 28)
            button.setIconSize(QSize(16, 16))
        menu = QMenu(self.moreAction)
        sessions = menu.addMenu(_("Sessions"))
        self.addConnectionActions(sessions)
        sessions.addSeparator()
        sessions.addAction(_("Close session"), lambda: self.closeTab(self.tabWidget.currentIndex()))
        sessions.addSeparator()
        sessions.addAction(_("Load config"), lambda: self.currentConfigAction(False))
        sessions.addAction(_("Share config"), lambda: self.currentConfigAction(True))
        view = menu.addMenu(_("View"))
        view.addAction(_("Session sidebar"), self.toggleSessionSidebar)
        view.addAction(_("Connection settings"), self.toggleSettings)
        view.addAction(_("Tools"), self.toggleFunctional)
        plugins = menu.addMenu(_("Plugins"))
        plugins.aboutToShow.connect(lambda: self.populatePluginMenu(plugins))
        language = menu.addMenu(_("Language"))
        for idx, label in enumerate(self.languages.values()):
            language.addAction(label, lambda checked=False, i=idx: self.languageCombobox.setCurrentIndex(i))
        menu.addAction(_("Help"), self.showAbout)
        menu.addSeparator()
        menu.addAction(_("Exit"), self.close)
        self.moreAction.setMenu(menu)
        self.moreAction.setPopupMode(QToolButton.InstantPopup)
        # Put global actions in the draggable title bar's right-hand group.
        title_layout = self.titleBar.layout()
        title_layout.insertWidget(title_layout.indexOf(self.titleBar.min), self.themeAction)
        title_layout.insertWidget(title_layout.indexOf(self.titleBar.min), self.moreAction)
        self.refreshWorkspaceIcons()

    def shellButton(self, icon, label, callback, text=False, primary=False):
        button = QToolButton()
        button.setObjectName("workspaceAction")
        button.setText(label)
        button.setToolTip(label)
        button.setAccessibleName(label)
        button.setIconSize(QSize(18, 18))
        button.setToolButtonStyle(Qt.ToolButtonTextBesideIcon if text else Qt.ToolButtonIconOnly)
        button.setFixedHeight(34)
        if not text:
            button.setFixedWidth(32)
            button.setProperty("iconOnly", True)
        button.clicked.connect(callback)
        self.shellIcons.append((button, icon, "primaryIconColor" if primary else "iconColor"))
        return button

    def addConnectionActions(self, menu):
        menu.addAction(_("Serial session"), lambda: self.createSession("serial"))
        menu.addAction(_("Network session"), lambda: self.createSession("tcp_udp"))
        menu.addAction(_("SSH terminal"), lambda: self.createSession("ssh"))

    def populatePluginMenu(self, menu):
        super().populatePluginMenu(menu)
        menu.addSeparator()
        menu.addAction(self.loadPluginStr, self.chooseExternalPlugin)

    def chooseExternalPlugin(self):
        index = self.pluginsSelector.findText(self.loadPluginStr)
        self.pluginsSelector.setCurrentIndex(index)
        self.onPluginSelectorChanged(index)

    def adoptItemPanels(self, item):
        if hasattr(item, "detachedToolbar"):
            item.detachedToolbar.hide()
        self.sidebarStack.addWidget(item.settingWidget)
        self.toolsStack.addWidget(item.functionalWidget)
        item.settingWidget.show()
        item.functionalWidget.show()
        for button in item.configButtons:
            button.hide()
        if item.isAddConn:
            for conn in item.conns:
                button = getattr(conn, "serialOpenCloseButton", None)
                if button:
                    button.hide()

    def releaseItemPanels(self, item):
        self.sidebarStack.removeWidget(item.settingWidget)
        self.toolsStack.removeWidget(item.functionalWidget)
        item.contentSplitter.insertWidget(0, item.settingWidget)
        item.contentSplitter.addWidget(item.functionalWidget)
        item.settingWidget.show()
        item.functionalWidget.hide()
        if not hasattr(item, "detachedToolbar"):
            item.detachedToolbar = QWidget()
            item.detachedToolbar.setObjectName("detachedToolbar")
            row = QHBoxLayout(item.detachedToolbar)
            row.setContentsMargins(10, 8, 10, 8)
            row.addWidget(QLabel(item.name), 1)
            for label, icon, panel in ((_("Connection settings"), "mdi.tune", item.settingWidget),
                                      (_("Tools"), "mdi.toolbox-outline", item.functionalWidget)):
                button = QToolButton()
                button.setObjectName("workspaceAction")
                button.setText(label)
                button.setToolTip(label)
                button.setAccessibleName(label)
                button.setToolButtonStyle(Qt.ToolButtonTextBesideIcon)
                utils_ui.setButtonIcon(button, icon)
                button.clicked.connect(lambda checked=False, target=panel: target.setVisible(not target.isVisible()))
                row.addWidget(button)
            item.widget.layout().insertWidget(0, item.detachedToolbar)
        item.detachedToolbar.show()
        for button in item.configButtons:
            button.show()
        if item.isAddConn:
            for conn in item.conns:
                button = getattr(conn, "serialOpenCloseButton", None)
                if button:
                    button.show()

    def refreshWorkspaceIcons(self):
        for button, icon, color in getattr(self, "shellIcons", []):
            if button in (getattr(self, "themeAction", None), getattr(self, "moreAction", None)):
                color = "titleIconColor"
            button.setIcon(utils_ui.makeIcon(icon, color=utils_ui.getStyleVar(color)))
        if self.titleBar.iconWidget is not None:
            self.titleBar.iconWidget.update()

    def toggleWorkspaceTheme(self):
        skin = "dark" if self.config["skin"] == "light" else "light"
        self.skinButton.setCurrentIndex(utils_ui.get_skins().index(skin))

    def refreshSessions(self):
        if not hasattr(self, "sessionTree"):
            return
        self.sessionTree.blockSignals(True)
        self.sessionTree.clear()
        folder = QTreeWidgetItem(self.sessionTree, [_("Open sessions")])
        folder.setExpanded(True)
        current = self.tabWidget.currentWidget()
        icons = {"dbg": "fa.exchange", "protocol": "fa.code", "terminal": "fa.terminal", "graph": "fa.line-chart"}
        for i in range(self.tabWidget.count()):
            widget = self.tabWidget.widget(i)
            item = next((it for it in self.items if it.widget == widget), None)
            if item:
                node = QTreeWidgetItem(folder, [item.name])
                node.setData(0, Qt.UserRole, item.name)
                connected = item.isAddConn and item.plugin.getConnStatus() == ConnectionStatus.CONNECTED
                color = ("#10b981" if connected else utils_ui.getStyleVar(
                    "brandIconColor" if widget == current else "iconSelectorColor"))
                node.setIcon(0, utils_ui.makeIcon(icons.get(item.plugin.id, "fa.cube"), color=color))
                node.setToolTip(0, item.name + " · " + (_("Connected") if connected else _("Disconnected")))
                if widget == current:
                    self.sessionTree.setCurrentItem(node)
        self.sessionCount.setText(str(self.tabWidget.count()) + " " + _("open sessions"))
        self.sessionTree.blockSignals(False)
        self.filterSessions(self.sessionSearch.text())

    def syncWorkspace(self):
        super().syncWorkspace()
        item = self.getCurrentItem()
        self.toolbarButtons["settings"].setEnabled(item is not None)
        self.toolbarButtons["tools"].setEnabled(item is not None)
        if item:
            self.toolsStack.setCurrentWidget(item.functionalWidget)
            self.workspaceTitle.setText(item.name)
            status = item.plugin.getConnStatus() if item.isAddConn else ConnectionStatus.CLOSED
            self.toolbarButtons["connection"].setIcon(utils_ui.makeIcon(
                "unplug" if status == ConnectionStatus.CONNECTED else "plug",
                color=utils_ui.getStyleVar("primaryIconColor")))
            summary = []
            if item.isAddConn:
                conn = item.conns[item.currConnIdx]
                summary.append(conn.name)
                if conn.id == "serial":
                    summary.extend([conn.config.get("port") or _("No port selected"), str(conn.config.get("baudrate", "")) + " baud"])
                elif conn.id == "tcp_udp":
                    summary.extend([conn.config["protocol"].upper(), conn.config["target"][0] if conn.config["mode"] == "client" else _("Server") + " :" + str(conn.config["port"])])
                elif conn.id == "ssh":
                    summary.append(str(conn.config.get("host", "")) + ":" + str(conn.config.get("port", 22)))
            label = "  /  ".join(summary) or _("Debug workspace")
            self.connectionSummary.setText(label)
            self.connectionSummary.setToolTip(label)
            states = {ConnectionStatus.CONNECTED: (_("Connected"), "connected"), ConnectionStatus.CONNECTING: (_("Connecting"), "pending"), ConnectionStatus.LOSE: (_("Connection lose"), "pending")}
            text, state = states.get(status, (_("Disconnected"), "idle"))
            self.connectionBadge.setText("●  " + text)
            self.connectionBadge.setProperty("state", state)
            self.connectionBadge.style().unpolish(self.connectionBadge)
            self.connectionBadge.style().polish(self.connectionBadge)
            for key, page in (("settings", 0), ("tools", 1)):
                button = self.toolbarButtons[key]
                button.setProperty("active", self.inspectorDrawer.isVisible() and self.drawerPages.currentIndex() == page)
                button.style().unpolish(button)
                button.style().polish(button)
        else:
            self.workspaceTitle.setText(_("No active session"))
            self.connectionSummary.setText(_("Select or create a session"))
            self.connectionSummary.setToolTip(self.connectionSummary.text())
            self.connectionBadge.setText("●  " + _("Disconnected"))
            self.connectionBadge.setProperty("state", "idle")
            self.connectionBadge.style().unpolish(self.connectionBadge)
            self.connectionBadge.style().polish(self.connectionBadge)
            self.toolbarButtons["connection"].setEnabled(False)
            self.toolbarButtons["clear"].setEnabled(False)
            self.inspectorDrawer.hide()
            if self._drawerRestoreSidebar:
                self.sessionSidebar.show()
            self._drawerRestoreSidebar = False

    def toggleSessionSidebar(self):
        self.sessionSidebar.setVisible(not self.sessionSidebar.isVisible())

    def openInspector(self, page):
        if self.getCurrentItem() is None:
            return
        if not self.inspectorDrawer.isVisible():
            self._drawerRestoreSidebar = self.width() < 1150 and self.sessionSidebar.isVisible()
            if self._drawerRestoreSidebar:
                self.sessionSidebar.hide()
        self.drawerPages.setCurrentIndex(page)
        self.sidebarHeading.setText(_("Connection settings") if page == 0 else _("Session tools"))
        self.inspectorDrawer.show()
        self.syncWorkspace()

    def closeInspector(self):
        self.inspectorDrawer.hide()
        if self._drawerRestoreSidebar:
            self.sessionSidebar.show()
        self._drawerRestoreSidebar = False
        self.syncWorkspace()

    def toggleInspector(self, page):
        if self.inspectorDrawer.isVisible() and self.drawerPages.currentIndex() == page:
            self.closeInspector()
        else:
            self.openInspector(page)

    def toggleCurrentConnection(self):
        item = self.getCurrentItem()
        if item and item.isAddConn:
            conn = item.conns[item.currConnIdx]
            if conn.id == "serial" and not conn.config.get("port"):
                self.openInspector(0)
                conn.serialPortCombobox.setFocus()
                item.plugin.statusBar.setMsg("warning", _("Select a port in connection settings"))
                return
        super().toggleCurrentConnection()

    def currentConfigAction(self, share):
        item = self.getCurrentItem()
        if item:
            item.selectSharefile() if share else item.selectLoadfile()
