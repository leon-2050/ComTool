# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
"""Session tabs with a small close affordance revealed on hover."""
from PyQt5.QtCore import Qt, QTimer, QPointF
from PyQt5.QtGui import QColor, QCursor, QPainter, QPen
from PyQt5.QtWidgets import QAbstractButton, QTabBar, QWidget

try:
    import utils_ui
    from i18n import _
except ImportError:
    from . import utils_ui
    from .i18n import _


class _TabCloseButton(QAbstractButton):
    def __init__(self, tab_bar):
        super().__init__(tab_bar)
        self.tabBar = tab_bar
        self.revealed = False
        self.setFixedSize(18, 18)
        self.setFocusPolicy(Qt.NoFocus)
        self.setStyleSheet("background: transparent; border: none; padding: 0; margin: 0;")
        self.setToolTip(_("Close session"))
        self.setAccessibleName(_("Close session"))
        self.clicked.connect(lambda: tab_bar.requestClose(self))

    def setRevealed(self, revealed):
        if revealed != self.revealed:
            self.revealed = revealed
            self.update()

    def hitButton(self, point):
        return self.revealed and self.rect().contains(point)

    def enterEvent(self, event):
        self.tabBar.revealTab(self.tabBar.indexOfCloseButton(self))
        self.update()
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.update()
        QTimer.singleShot(0, self.tabBar.syncHover)
        super().leaveEvent(event)

    def paintEvent(self, event):
        if not self.revealed:
            return
        painter = QPainter(self)
        try:
            painter.setRenderHint(QPainter.Antialiasing)
            color = utils_ui.getStyleVar("brandIconColor" if self.underMouse() else "iconSelectorColor")
            painter.setPen(QPen(QColor(color), 1.2, Qt.SolidLine, Qt.RoundCap))
            center = self.rect().center()
            x, y = center.x() + .5, center.y() + .5
            painter.drawLine(QPointF(x - 4, y - 4), QPointF(x + 4, y + 4))
            painter.drawLine(QPointF(x + 4, y - 4), QPointF(x - 4, y + 4))
        finally:
            painter.end()


class SessionTabBar(QTabBar):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)
        self.hoveredTab = -1
        self.tabMoved.connect(lambda *args: QTimer.singleShot(0, self.syncHover))

    def tabInserted(self, index):
        super().tabInserted(index)
        for side in (QTabBar.LeftSide, QTabBar.RightSide):
            native_button = self.tabButton(index, side)
            if native_button is not None:
                self.setTabButton(index, side, None)
                native_button.deleteLater()
        # Balance the reserved close slot so the native label stays centered,
        # whether its close glyph is painted or hidden.
        spacer = QWidget(self)
        spacer.setFixedSize(18, 18)
        spacer.setAttribute(Qt.WA_TransparentForMouseEvents)
        spacer.setStyleSheet("background: transparent; border: none;")
        self.setTabButton(index, QTabBar.LeftSide, spacer)
        self.setTabButton(index, QTabBar.RightSide, _TabCloseButton(self))
        QTimer.singleShot(0, self.syncHover)

    def tabRemoved(self, index):
        super().tabRemoved(index)
        QTimer.singleShot(0, self.syncHover)

    def indexOfCloseButton(self, button):
        for index in range(self.count()):
            if self.tabButton(index, QTabBar.RightSide) is button:
                return index
        return -1

    def requestClose(self, button):
        index = self.indexOfCloseButton(button)
        if index >= 0:
            self.tabCloseRequested.emit(index)

    def revealTab(self, index):
        self.hoveredTab = index if 0 <= index < self.count() else -1
        for tab in range(self.count()):
            button = self.tabButton(tab, QTabBar.RightSide)
            if isinstance(button, _TabCloseButton):
                button.setRevealed(self.count() > 1 and tab == self.hoveredTab)

    def syncHover(self):
        point = self.mapFromGlobal(QCursor.pos())
        self.revealTab(self.tabAt(point) if self.isVisible() and self.rect().contains(point) else -1)

    def mouseMoveEvent(self, event):
        super().mouseMoveEvent(event)
        self.revealTab(self.tabAt(event.pos()))

    def leaveEvent(self, event):
        self.revealTab(-1)
        super().leaveEvent(event)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        QTimer.singleShot(0, self.syncHover)
