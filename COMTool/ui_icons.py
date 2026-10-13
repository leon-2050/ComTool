# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
"""One small, vector-drawn icon family for the communication workbench.

The built-in interface uses a 24-unit grid and the same rounded stroke for
every control.  The optional user icon catalogue remains available through
the lazy fallback in :func:`icon`.
"""

from PyQt5.QtCore import QByteArray, QRectF, QSize, Qt
from PyQt5.QtGui import QColor, QIcon, QIconEngine, QPainter, QPixmap
from PyQt5.QtSvg import QSvgRenderer


# Keep each silhouette within the same optical bounds rather than mixing
# font glyphs with differently padded SVGs.
_SHAPES = {
    "sidebar": '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9 4.5v15"/>',
    "settings": '<path d="M4 6h4m4 0h8M4 12h9m4 0h3M4 18h2m4 0h10"/><circle cx="10" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    "toolbox": '<rect x="3.5" y="8" width="17" height="12" rx="2"/><path d="M8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3.5 12.5h17M8 11v3m8-3v3"/>',
    "plug": '<path d="M9 3v4m6-4v4M6 7h12v3a6 6 0 0 1-12 0V7Zm6 9v5"/>',
    "unplug": ('<g transform="rotate(-45 12 12)"><path d="M1 12h1M8 7H5a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h3V7Z'
               'm0 2h3m-3 6h3M15 7h3a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-3V7Z'
               'm6 5h2"/></g>'),
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "minus": '<path d="M5 12h14"/>',
    "x": '<path d="m6 6 12 12M18 6 6 18"/>',
    "copy": '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3"/>',
    "clear": '<path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14M10 10v6m4-6v6"/>',
    "backspace": '<path d="M9 5h11v14H9l-6-7 6-7Zm3 4 6 6m0-6-6 6"/>',
    "send": '<path d="m3 10 18-7-7 18-3-8-8-3Zm8 3 10-10"/>',
    "exchange": '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
    "terminal": '<path d="m5 6 6 6-6 6m9 0h6"/>',
    "code": '<path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16"/>',
    "chart": '<path d="M4 3v17h17M7 15l4-5 4 3 6-8"/>',
    "cube": '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 10v8M3 8l9 5 9-5m-13.5-7 9 5"/>',
    "theme": '<path d="M12 4a8 8 0 1 0 8 8 6 6 0 0 1-8-8Z"/><path d="M18 3v3m3 2h-3m2-4-2 2"/>',
    "more": '<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></g>',
    "minimize": '<path d="M5 16h14"/>',
    "maximize": '<rect x="5" y="5" width="14" height="14" rx="1"/>',
    "restore": '<path d="M8 8h12v12H8V8ZM4 16V4h12"/>',
    "pin": '<path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6Zm3 12v6"/>',
    "pin-filled": '<path fill="currentColor" d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6Z"/><path d="M12 15v6"/>',
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18Z"/>',
    "help": '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 4"/><circle cx="12" cy="16" r=".85" fill="currentColor" stroke="none"/>',
    "edit": '<path d="m15 4 5 5L9 20l-6 1 1-6L15 4Zm-3 3 5 5"/>',
    "dot": '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
    "brand": ('<g transform="scale(.375)" stroke-width="4">'
              '<path d="M44 28h8q3 0 3 3v18q0 3-3 3H31q-3 0-3-3v-1"/>'
              '<rect x="9" y="12" width="33" height="31" rx="4"/>'
              '<path d="M16 22l6 6-6 6m12 0h7"/></g>'),
}

_ALIASES = {
    "sliders": "settings", "close": "x", "trash": "clear",
    "paperplane": "send", "arrows": "exchange", "language": "globe",
    "fa.columns": "sidebar", "mdi.view-column-outline": "sidebar",
    "mdi.tune": "settings", "mdi.tune-variant": "settings",
    "mdi.toolbox-outline": "toolbox", "mdi.toolbox": "toolbox",
    "fa.plug": "plug", "mdi.power-plug-outline": "plug",
    "mdi.power-plug-off-outline": "unplug", "mdi.lan-disconnect": "unplug",
    "fa.plus": "plus", "fa.minus": "minus", "fa.close": "x",
    "fa.times": "x", "mdi.close": "x", "fa.copy": "copy",
    "mdi6.broom": "clear", "mdi.broom": "clear", "fa.trash": "clear",
    "fa.trash-o": "clear", "mdi.backspace-outline": "backspace",
    "fa.send": "send", "fa.paper-plane": "send", "fa.exchange": "exchange",
    "fa.terminal": "terminal", "fa.code": "code", "fa.line-chart": "chart",
    "fa.cube": "cube", "mdi.theme-light-dark": "theme",
    "mdi.palette-outline": "theme", "mdi.dots-horizontal": "more",
    "mdi.window-minimize": "minimize", "mdi.window-maximize": "maximize",
    "mdi.window-restore": "restore", "mdi.window-close": "x",
    "ph.push-pin-bold": "pin", "ph.push-pin-fill": "pin-filled",
    "fa.language": "globe", "fa.question-circle-o": "help",
    "fa.question-circle": "help", "fa.edit": "edit", "ei.pencil": "edit",
    "fa.circle": "dot", "mdi.circle-small": "dot",
}


def supports(name):
    """Whether ``name`` is part of the built-in outline icon family."""
    return _ALIASES.get(name, name) in _SHAPES


def _svg(name, color):
    tint = QColor(color)
    if not tint.isValid():
        tint = QColor("#475569")
    body = _SHAPES[name].replace("currentColor", tint.name())
    return QByteArray((
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" '
        'viewBox="0 0 24 24"><g fill="none" stroke="{}" stroke-width="1.8" '
        'stroke-linecap="round" stroke-linejoin="round" opacity="{}">{}</g></svg>'
    ).format(tint.name(), tint.alphaF(), body).encode("utf-8"))


class _OutlineIconEngine(QIconEngine):
    def __init__(self, name, color):
        super().__init__()
        self.name = name
        self.color = color
        self.renderer = QSvgRenderer(_svg(name, color))
        tint = QColor(color)
        self.disabledRenderer = (QSvgRenderer(_svg(name, "#8b98ac"))
                                 if min(tint.red(), tint.green(), tint.blue()) > 235
                                 else None)

    def clone(self):
        return _OutlineIconEngine(self.name, self.color)

    def key(self):
        return "COMToolOutline"

    def iconName(self):
        return self.name

    def isNull(self):
        return not self.renderer.isValid()

    def actualSize(self, size, mode, state):
        extent = min(size.width(), size.height())
        return QSize(extent, extent)

    def availableSizes(self, mode=QIcon.Normal, state=QIcon.Off):
        # An empty list is the Qt convention for resolution-independent icons.
        return []

    def paint(self, painter, rect, mode, state):
        side = min(rect.width(), rect.height())
        target = QRectF(rect.x() + (rect.width() - side) / 2,
                        rect.y() + (rect.height() - side) / 2, side, side)
        painter.save()
        try:
            painter.setRenderHint(QPainter.Antialiasing)
            renderer = self.renderer
            if mode == QIcon.Disabled:
                if self.disabledRenderer is not None:
                    renderer = self.disabledRenderer
                    painter.setOpacity(painter.opacity() * .7)
                else:
                    painter.setOpacity(painter.opacity() * .45)
            renderer.render(painter, target)
        finally:
            painter.restore()

    def pixmap(self, size, mode, state):
        # With AA_UseHighDpiPixmaps Qt passes the physical pixel dimensions
        # here, then assigns the display DPR to the returned pixmap.
        image = QPixmap(size)
        image.fill(Qt.transparent)
        painter = QPainter(image)
        try:
            self.paint(painter, image.rect(), mode, state)
        finally:
            painter.end()
        return image

def icon(name, color="#475569"):
    """Create a scalable workbench icon, or a user-selected catalogue icon."""
    semantic = _ALIASES.get(name, name)
    if semantic in _SHAPES:
        return QIcon(_OutlineIconEngine(semantic, color))
    import qtawesome
    return qtawesome.icon(name, color=color)
