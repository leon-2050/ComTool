# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
"""Studio layout built on the existing session and connection actions."""
from PyQt5.QtCore import Qt, QSize
from PyQt5.QtWidgets import (QWidget, QHBoxLayout, QVBoxLayout, QLabel, QToolButton,
    QMenu, QSplitter, QTreeWidget, QLineEdit, QStackedWidget)
import qtawesome as qta
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
        header = QWidget()
        header.setObjectName("workspaceToolbar")
        header.setFixedHeight(72)
        row = QHBoxLayout(header)
        row.setContentsMargins(20, 8, 20, 8)
        row.setSpacing(10)
        title = QVBoxLayout()
        title.setSpacing(3)
        self.workspaceTitle = QLabel(_("Debug workspace"))
        self.workspaceTitle.setObjectName("workspaceTitle")
        self.connectionSummary = QLabel(_("Ready to connect"))
        self.connectionSummary.setObjectName("connectionSummary")
        title.addWidget(self.workspaceTitle)
        title.addWidget(self.connectionSummary)
        row.addLayout(title, 1)
        self.connectionBadge = QLabel(_("Disconnected"))
        self.connectionBadge.setObjectName("connectionBadge")
        self.connectionBadge.setFixedHeight(28)
        row.addWidget(self.connectionBadge)

        def action(key, label, icon, callback, primary=False, icon_only=False):
            button = QToolButton()
            button.setObjectName("connectAction" if primary else "workspaceAction")
            button.setText(label)
            button.setToolTip(label)
            button.setIconSize(QSize(17, 17))
            button.setToolButtonStyle(Qt.ToolButtonIconOnly if icon_only else Qt.ToolButtonTextBesideIcon)
            button.setFixedHeight(36)
            if icon_only:
                button.setFixedWidth(36)
            button.clicked.connect(callback)
            row.addWidget(button)
            self.toolbarButtons[key] = button
            self.shellIcons.append((button, icon, "primaryIconColor" if primary else "iconColor"))
            return button

        new = action("new", _("New session"), "fa.plus", lambda: None)
        new_menu = QMenu(new)
        self.addConnectionActions(new_menu)
        new.setMenu(new_menu)
        new.setPopupMode(QToolButton.InstantPopup)
        action("tools", _("Tools"), "fa.sliders", self.toggleFunctional, icon_only=True)
        action("appearance", _("Appearance"), "mdi.theme-light-dark", self.toggleWorkspaceTheme, icon_only=True)
        more = action("menu", _("Workspace menu"), "mdi.dots-horizontal", lambda: None, icon_only=True)
        menu = QMenu(more)
        sessions = menu.addMenu(_("Sessions"))
        self.addConnectionActions(sessions)
        sessions.addSeparator()
        sessions.addAction(_("Close session"), lambda: self.closeTab(self.tabWidget.currentIndex()))
        sessions.addAction(_("Exit"), self.close)
        view = menu.addMenu(_("View"))
        view.addAction(_("Session sidebar"), self.toggleSessionSidebar)
        view.addAction(_("Connection settings"), self.toggleSettings)
        view.addAction(_("Tools"), self.toggleFunctional)
        for skin in utils_ui.get_skins():
            view.addAction(_(skin), lambda checked=False, s=skin: self.skinButton.setCurrentIndex(utils_ui.get_skins().index(s)))
        plugins = menu.addMenu(_("Plugins"))
        plugins.aboutToShow.connect(lambda: self.populatePluginMenu(plugins))
        language = menu.addMenu(_("Language"))
        for idx, label in enumerate(self.languages.values()):
            language.addAction(label, lambda checked=False, i=idx: self.languageCombobox.setCurrentIndex(i))
        menu.addAction(_("Help"), self.showAbout)
        more.setMenu(menu)
        more.setPopupMode(QToolButton.InstantPopup)
        action("connection", _("Connection"), "fa.plug", self.toggleCurrentConnection, primary=True)
        self.toolbarButtons["clear"] = QToolButton(self)
        self.toolbarButtons["clear"].hide()
        self.toolbarButtons["clear"].clicked.connect(self.clearCurrentConsole)
        self.contentLayout.addWidget(header)

        body = QWidget()
        body_layout = QHBoxLayout(body)
        body_layout.setContentsMargins(0, 0, 0, 0)
        body_layout.setSpacing(0)
        rail = QWidget()
        rail.setObjectName("workspaceRail")
        rail.setFixedWidth(52)
        rail_layout = QVBoxLayout(rail)
        rail_layout.setContentsMargins(6, 16, 6, 12)
        rail_layout.setSpacing(10)
        logo = QLabel("C")
        logo.setObjectName("railLogo")
        logo.setAlignment(Qt.AlignCenter)
        rail_layout.addWidget(logo)
        rail_layout.addSpacing(12)
        self.railButtons = {}
        for key, label, icon, callback in (
            ("settings", _("Connection settings"), "mdi.tune", self.toggleSettings),
            ("sessions", _("Sessions"), "mdi.view-grid-outline", self.toggleSessionSidebar),
            ("tools", _("Tools"), "mdi.toolbox-outline", self.toggleFunctional),
        ):
            button = QToolButton()
            button.setObjectName("railAction")
            button.setToolTip(label)
            button.setIconSize(QSize(21, 21))
            button.setFixedSize(40, 40)
            button.clicked.connect(callback)
            rail_layout.addWidget(button)
            self.railButtons[key] = button
            self.shellIcons.append((button, icon, "titleIconColor"))
        rail_layout.addStretch()
        help_button = QToolButton()
        help_button.setObjectName("railAction")
        help_button.setIconSize(QSize(20, 20))
        help_button.setFixedSize(40, 40)
        help_button.setToolTip(_("Help"))
        help_button.clicked.connect(self.showAbout)
        self.shellIcons.append((help_button, "fa.question-circle-o", "titleIconColor"))
        rail_layout.addWidget(help_button)
        body_layout.addWidget(rail)
        self.workspaceSplitter = QSplitter(Qt.Horizontal)
        self.workspaceSplitter.setHandleWidth(1)
        self.workspaceSplitter.setChildrenCollapsible(False)
        body_layout.addWidget(self.workspaceSplitter)
        self.sessionSidebar = QWidget()
        self.sessionSidebar.setObjectName("sessionSidebar")
        self.sessionSidebar.setMinimumWidth(250)
        self.sessionSidebar.setMaximumWidth(380)
        left = QVBoxLayout(self.sessionSidebar)
        left.setContentsMargins(14, 18, 14, 12)
        left.setSpacing(12)
        self.sidebarHeading = QLabel(_("Inspector"))
        self.sidebarHeading.setObjectName("sidebarHeading")
        left.addWidget(self.sidebarHeading)
        self.sidebarPages = QStackedWidget()
        left.addWidget(self.sidebarPages, 1)
        self.sidebarStack = QStackedWidget()
        self.sidebarPages.addWidget(self.sidebarStack)
        sessions_page = QWidget()
        sessions_layout = QVBoxLayout(sessions_page)
        sessions_layout.setContentsMargins(0, 0, 0, 0)
        sessions_layout.setSpacing(12)
        self.sessionSearch = QLineEdit()
        self.sessionSearch.setPlaceholderText(_("Find a session…"))
        self.sessionSearch.setClearButtonEnabled(True)
        sessions_layout.addWidget(self.sessionSearch)
        self.sessionTree = QTreeWidget()
        self.sessionTree.setObjectName("sessionTree")
        self.sessionTree.setHeaderHidden(True)
        self.sessionTree.setUniformRowHeights(True)
        self.sessionTree.setIndentation(14)
        self.sessionTree.itemClicked.connect(self.selectSession)
        self.sessionSearch.textChanged.connect(self.filterSessions)
        sessions_layout.addWidget(self.sessionTree, 1)
        self.sidebarPages.addWidget(sessions_page)
        self.workspaceSplitter.addWidget(self.sessionSidebar)
        work = QWidget()
        work.setObjectName("terminalWorkspace")
        work_layout = QVBoxLayout(work)
        work_layout.setContentsMargins(18, 14, 18, 0)
        work_layout.setSpacing(0)
        corner = QWidget()
        corner_layout = QHBoxLayout(corner)
        corner_layout.setContentsMargins(4, 0, 0, 0)
        corner_layout.setSpacing(8)
        corner_layout.addWidget(self.pluginsSelector)
        corner_layout.addWidget(self.encodingCombobox)
        self.encodingCombobox.setMaximumWidth(100)
        self.tabWidget.setCornerWidget(corner, Qt.TopRightCorner)
        work_layout.addWidget(self.tabWidget)
        self.workspaceSplitter.addWidget(work)
        self.workspaceSplitter.setStretchFactor(0, 0)
        self.workspaceSplitter.setStretchFactor(1, 1)
        self.workspaceSplitter.setSizes([278, 950])
        self.contentLayout.addWidget(body, 1)
        self.refreshWorkspaceIcons()

    def addConnectionActions(self, menu):
        menu.addAction(_("Serial session"), lambda: self.createSession("serial"))
        menu.addAction(_("Network session"), lambda: self.createSession("tcp_udp"))
        menu.addAction(_("SSH terminal"), lambda: self.createSession("ssh"))

    def refreshWorkspaceIcons(self):
        for button, icon, color in getattr(self, "shellIcons", []):
            button.setIcon(qta.icon(icon, color=utils_ui.getStyleVar(color)))

    def toggleWorkspaceTheme(self):
        skin = "dark" if self.config["skin"] == "light" else "light"
        self.skinButton.setCurrentIndex(utils_ui.get_skins().index(skin))

    def syncWorkspace(self):
        super().syncWorkspace()
        item = self.getCurrentItem()
        if item:
            self.workspaceTitle.setText(item.name)
            status = item.plugin.getConnStatus() if item.isAddConn else ConnectionStatus.CLOSED
            summary = []
            if item.isAddConn:
                conn = item.conns[item.currConnIdx]
                summary.append(conn.name)
                if conn.id == "serial":
                    summary.extend([conn.config.get("port") or _("No port selected"), str(conn.config.get("baudrate", "")) + " baud"])
                elif conn.id == "tcp_udp":
                    summary.append(conn.config["target"][0] if conn.config["mode"] == "client" else _("Server") + " :" + str(conn.config["port"]))
                elif conn.id == "ssh":
                    summary.append(str(conn.config.get("host", "")))
            self.connectionSummary.setText("  ·  ".join(summary) or _("Debug workspace"))
            states = {ConnectionStatus.CONNECTED: (_("Connected"), "connected"),
                      ConnectionStatus.CONNECTING: (_("Connecting"), "pending"),
                      ConnectionStatus.LOSE: (_("Connection lose"), "pending")}
            text, state = states.get(status, (_("Disconnected"), "idle"))
            self.connectionBadge.setText("●  " + text)
            self.connectionBadge.setProperty("state", state)
            self.connectionBadge.style().unpolish(self.connectionBadge)
            self.connectionBadge.style().polish(self.connectionBadge)
        for key, button in getattr(self, "railButtons", {}).items():
            active = self.sessionSidebar.isVisible() and self.sidebarPages.currentIndex() == (1 if key == "sessions" else 0)
            if key == "tools":
                active = bool(item and item.functionalWidget.isVisible())
            button.setProperty("active", active)
            button.style().unpolish(button)
            button.style().polish(button)

    def toggleSessionSidebar(self):
        visible = self.sessionSidebar.isVisible() and self.sidebarPages.currentIndex() == 1
        self.sidebarPages.setCurrentIndex(1)
        self.sidebarHeading.setText(_("Sessions"))
        self.sessionSidebar.setVisible(not visible)
        self.syncWorkspace()
