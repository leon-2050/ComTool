# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
'''
    @author neucrack
    @license LGPL-3.0
    @update 2022-03-15 create
'''
from ast import arg
from PyQt5.QtCore import QObject, Qt, QRect, pyqtSignal, pyqtSlot
from PyQt5.QtWidgets import (QApplication, QWidget,QPushButton,QMessageBox,QDesktopWidget,QMainWindow,
                             QVBoxLayout,QHBoxLayout,QGridLayout,QTextEdit,QLabel,QRadioButton,QCheckBox,
                             QLineEdit,QGroupBox,QSplitter,QFileDialog, QScrollArea, QScrollBar)
from PyQt5.QtGui import (QColor, QPixmap, QFontMetrics, QFont, QFontDatabase, QBrush, QPen, QPainter,
                        QKeyEvent, QWheelEvent)

try:
    from .base import Plugin_Base
    from Combobox import ComboBox
    from i18n import _
    import utils, parameters
    from conn.base import ConnectionStatus
except ImportError:
    from COMTool.plugins.base import Plugin_Base
    from COMTool import utils, parameters
    from COMTool.i18n import _
    from COMTool.Combobox import ComboBox
    from COMTool.conn.base import  ConnectionStatus

import pyte
from wcwidth import wcswidth
import threading
import time
import pyperclip
import math
import re
from .terminal_colors import highlight_keywords

class Terminal_Backend:
    def __init__(self) -> None:
        self.screen = pyte.HistoryScreen(60, 20, history=9999, ratio = 0.05)
        self.screen.set_mode(pyte.modes.LNM)
        self.stream = pyte.ByteStream(self.screen)

    def feed(self, data:bytes):
        self.stream.feed(data)

    def resize(self, width, height):
        self.screen.resize(columns=width, lines=height)
        self.screen.history = self.screen.history._replace(ratio = 1.0/height)

class Terminal_Frontend(QWidget):
    repaintRequested = pyqtSignal()

    def __init__(self, send_func, resizeConnFunc, isConnectedFunc) -> None:
        super().__init__()
        self.send = send_func
        self.resizeConn = resizeConnFunc
        self.isConnected = isConnectedFunc
        self.theme = {
            "bg": QColor("#212121"),
            "color": QColor(255, 255, 255),
            "cursor": QColor(76, 175, 80),
            "colors": {
                'black': QColor("#212121"),
                'red': QColor("#f44336"),
                'green': QColor("#4caf50"),
                'blue': QColor("#2196f3"),
                'cyan': QColor("#26c6da"),
                'brown': QColor("#a1887f"),
                'yellow': QColor("#ffeb3b"),
                'magenta': QColor("#e85aad"),
                'white': QColor("#cacaca"),
                'brightblack': QColor("#8a94a6"),
                'brightred': QColor("#ff6b6b"),
                'brightgreen': QColor("#83d68a"),
                'brightbrown': QColor("#f6d06f"),
                'brightyellow': QColor("#f6d06f"),
                'brightblue': QColor("#6daaff"),
                'brightmagenta': QColor("#ef87d7"),
                'brightcyan': QColor("#74dfe8"),
                'brightwhite': QColor("#ffffff"),
                "selected": QColor(255, 255, 255, 80),
            }
        }
        self.keymap = {
            # Normal cursor-key mode shared by Linux and xterm terminals.
            Qt.Key_Backspace: b'\x7F', # use DEL, not 0x08(^H, Backspace)
            Qt.Key_Escape:    b'\x1B',
            Qt.Key_AsciiTilde: b'\x7E',
            Qt.Key_ScrollLock: b'\x1A',
            Qt.Key_Up:       b'\x1b[A',
            Qt.Key_Down:     b'\x1b[B',
            Qt.Key_Left:     b'\x1b[D',
            Qt.Key_Right:    b'\x1b[C',
            Qt.Key_PageUp:   b"\x1b[5~",
            Qt.Key_PageDown: b"\x1b[6~",
            Qt.Key_Home:     b'\x1b[1~',
            Qt.Key_End:      b'\x1b[4~',
            Qt.Key_Insert:   b"\x1b[2~",
            Qt.Key_Delete:   b"\x1b[3~",
            Qt.Key_F1:       b"\x1b[11~",
            Qt.Key_F2:       b"\x1b[12~",
            Qt.Key_F3:       b"\x1b[13~",
            Qt.Key_F4:       b"\x1b[14~",
            Qt.Key_F5:       b"\x1b[15~",
            Qt.Key_F6:       b"\x1b[17~",
            Qt.Key_F7:       b"\x1b[18~",
            Qt.Key_F8:       b"\x1b[19~",
            Qt.Key_F9:       b"\x1b[20~",
            Qt.Key_F10:      b"\x1b[21~",
            Qt.Key_F11:      b"\x1b[23~",
            Qt.Key_F12:      b"\x1b[24~",
            Qt.Key_F13:      b"\x1b[25~",
        }
        self.setAttribute(Qt.WA_InputMethodEnabled)
        self.resize(580, 380)
        self.setMinimumWidth(40)
        self.setMinimumHeight(40)
        self.backend = Terminal_Backend()
        self.setCursor(Qt.IBeamCursor)
        self.setFocusPolicy(Qt.StrongFocus)
        families = set(QFontDatabase().families())
        self.font_name = next((name for name in ("Consolas", "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", "Courier New")
                               if name in families), QFontDatabase.systemFont(QFontDatabase.FixedFont).family())
        self.font_p_size = 15
        self.font = self.new_font()
        self.fm = QFontMetrics(self.font, self)
        self._char_height = self.fm.height()
        self._char_width = self.fm.width("W")
        self._columns, self._rows = self._pixel2pos(self.width(), self.height())
        self.cursor_x = 0
        self.cursor_y = 0
        # Selection is a display overlay, so it never destroys ANSI backgrounds.
        self._selection = {}
        self.keywordHighlighting = True
        self._highlighting_active = None
        # cache
        self.pens = {}
        self.brushes = {}
        self.default_brush = QBrush(self.theme["bg"])
        self.default_pen = QPen(self.theme["color"])
        # The cache has physical pixels, while text/PTY/selection use logical coordinates.
        # QPixmap creation and drawing stay in the GUI thread.
        self.pixmap = self._new_pixmap()
        # scroll
        self.scrollBar = None
        self.scrollEventSet = False
        self.scrollStatus = (0, 0)
        # timer for check change
        self.startTimer(100)
        self.updatePixmapLock = threading.Lock()
        self.repaintRequested.connect(self._refresh_from_backend)
        # selection
        self.selectionStart = None
        self.lastSelection = None
        self.selectScroll = {     # for speed up scroll when select
            "speed": 0.1,
            "start_speed": 0.1,     # 0.5s
            "max_speed": 0.01,
            "ts": 0
        }

    def new_font(self):
        font = QFont()
        font.setFamily(self.font_name)
        font.setPixelSize(self.font_p_size)
        font.setStyleHint(QFont.Monospace)
        font.setFixedPitch(True)
        font.setStyleStrategy(QFont.PreferAntialias)
        return font

    def _new_pixmap(self):
        ratio = self.devicePixelRatioF()
        pixmap = QPixmap(max(1, math.ceil(self.width() * ratio)),
                         max(1, math.ceil(self.height() * ratio)))
        pixmap.setDevicePixelRatio(ratio)
        pixmap.fill(self.theme["bg"])
        return pixmap

    def _ensure_pixmap(self):
        ratio = self.devicePixelRatioF()
        if (abs(self.pixmap.devicePixelRatioF() - ratio) > 1e-6
                or self.pixmap.width() != max(1, math.ceil(self.width() * ratio))
                or self.pixmap.height() != max(1, math.ceil(self.height() * ratio))):
            self.pixmap = self._new_pixmap()
            self.paint_full_pixmap()

    @pyqtSlot()
    def _refresh_from_backend(self):
        with self.updatePixmapLock:
            self._ensure_pixmap()
            self.updatePixmap()

    def get_pen(self, color_name="white", keyword = None):
        key = (color_name, keyword)
        pen = self.pens.get(key)
        if not pen:
            if keyword:
                color = self.theme.get(keyword)
            else:
                color = self.resolve_color(color_name)
            pen = QPen(color) if color is not None else self.default_pen
            self.pens[key] = pen
        return pen

    def resolve_color(self, name, background=False, bold=False):
        # pyte's AIXTERM background table spells SGR 105 this way.
        if name == "bfightmagenta":
            name = "brightmagenta"
        if name == "default":
            return self.theme["bg" if background else "color"]
        if bold and not background and name in ("black", "red", "green", "brown", "yellow", "blue", "magenta", "cyan", "white"):
            name = "bright" + name
        color = self.theme["colors"].get(name)
        if color is not None:
            return color
        # pyte returns 256-colour and RGB SGR values as six hex digits.
        if isinstance(name, str) and re.fullmatch(r"#?[0-9a-fA-F]{6}", name):
            return QColor(name if name.startswith("#") else "#" + name)
        return self.theme["bg" if background else "color"]

    def get_brush(self, color_name):
        brush = self.brushes.get(color_name)
        if not brush:
            brush = QBrush(self.resolve_color(color_name, background=True))
            self.brushes[color_name] = brush
        return brush

    def setKeywordHighlighting(self, enabled):
        self.keywordHighlighting = bool(enabled)
        with self.updatePixmapLock:
            self.paint_full_pixmap()
        self.update()

    def _keywords_enabled(self, screen):
        return self.keywordHighlighting and not any((mode << 5) in screen.mode for mode in (47, 1047, 1049))

    def _pixel2pos(self, x, y):
        col = int(x / self._char_width)
        row = int(y / self._char_height)
        return col, row

    def _pos2pixel(self, col, row):
        x = col * self._char_width
        y = row * self._char_height
        return x, y

    def paint_full_pixmap(self):
        painter = QPainter(self.pixmap)
        try:
            painter.setRenderHint(QPainter.TextAntialiasing, True)
            screen = self.backend.screen
            self.paint_full_text(painter, screen)
            self.paint_cursor(painter, screen)
        finally:
            painter.end()

    def paint_part_pixmap(self):
        painter = QPainter(self.pixmap)
        try:
            painter.setRenderHint(QPainter.TextAntialiasing, True)
            screen = self.backend.screen
            self.paint_dirty_text(painter, screen)
            self.paint_cursor(painter, screen)
        finally:
            painter.end()

    def paint_full_text(self, painter, screen):
        self._highlighting_active = self._keywords_enabled(screen)
        painter.setFont(self.font)
        for line_num in range(self._rows):
            self.paint_line_text(painter, screen, line_num, clear=True)

    def paint_dirty_text(self, painter, screen):
        painter.setFont(self.font)
        # 重绘旧光标所在行
        screen.dirty.add(self.cursor_y)
        for line_num in screen.dirty:
            self.paint_line_text(painter, screen, line_num, clear=True)
        # clear paint dirty info mannually
        screen.dirty.clear()

    def paint_line_text(self, painter, screen, line_num, clear=False):
        start_x = 0
        start_y = line_num * self._char_height
        if clear:
            clear_rect = QRect(start_x, start_y, self.width(), self._char_height)
            painter.fillRect(clear_rect, self.default_brush)

        line = screen.buffer[line_num]

        colours = ()
        # Leave full-screen application colours and layout under application control.
        if self._keywords_enabled(screen):
            text = "".join(line[col].data for col in range(screen.columns))
            colours = highlight_keywords(text)
        offset = 0
        same_text = ""
        start_col = 0
        previous_style = None
        align = Qt.AlignTop | Qt.AlignLeft

        for col in range(screen.columns):
            char = line[col]
            fg = char.fg
            if (char.data and fg == "default" and char.bg == "default" and not char.reverse
                    and offset < len(colours) and colours[offset]):
                fg = colours[offset]
            style = (fg, char.bg, char.bold, char.italics, char.underscore,
                     char.strikethrough, char.reverse, (id(line), col) in self._selection)
            # Empty cells are the second column of a wide character, not new text.
            if not char.data and previous_style is not None:
                style = previous_style
            offset += len(char.data)
            if previous_style == style:
                same_text += char.data
            else:
                if previous_style is not None:
                    self.draw_text(same_text, start_col * self._char_width, start_y,
                                   (col - start_col) * self._char_width, previous_style, painter, align)
                previous_style = style
                same_text = char.data
                start_col = col

        if previous_style is not None:
            self.draw_text(same_text, start_col * self._char_width, start_y,
                           (screen.columns - start_col) * self._char_width, previous_style, painter, align)

    def draw_text(self, text, start_x, start_y, text_width, style, painter, align):
        fg, bg, bold, italics, underscore, strikethrough, reverse, selected = style
        rect = QRect(start_x, start_y, text_width, self._char_height)
        foreground = self.resolve_color(fg, bold=bold)
        background = self.resolve_color(bg, background=True)
        if reverse:
            foreground, background = background, foreground
        if reverse or bg != "default":
            painter.fillRect(rect, background)
        if selected:
            painter.fillRect(rect, self.theme["colors"]["selected"])
        font = QFont(self.font)
        font.setBold(bold)
        font.setItalic(italics)
        font.setUnderline(underscore)
        font.setStrikeOut(strikethrough)
        painter.setFont(font)
        painter.setPen(foreground)
        painter.drawText(rect, align, text)

    def paint_cursor(self, painter, screen):
        align = Qt.AlignTop | Qt.AlignLeft
        cursor = screen.cursor
        self.cursor_x = cursor.x
        self.cursor_y = cursor.y
        char = screen.buffer[self.cursor_y][self.cursor_x].data if self.cursor_x < screen.columns else ""
        cursor_x_pixel_width = self.cursor_x * self._char_width
        bcol = self.theme["cursor"]
        brush = QBrush(bcol)

        rect = QRect(cursor_x_pixel_width, self.cursor_y * self._char_height,
                    self._char_width, self._char_height)
        painter.setPen(Qt.NoPen)
        painter.setBrush(brush)
        painter.drawRect(rect)
        if char:
            painter.setFont(self.font)
            painter.setPen(self.get_pen(keyword="bg"))
            painter.drawText(rect, align, char)

    def wheelEvent(self, event: QWheelEvent):
        try:
            y = event.angleDelta().y()
            if y > 0:
                self.backend.screen.prev_page()
            else:
                self.backend.screen.next_page()
            self.update()
        except:
            import traceback
            traceback.print_exc()

    def onScrolled(self, curr):
        self.updatePixmapLock.acquire()
        top = len(self.backend.screen.history.top)
        bottom = len(self.backend.screen.history.bottom)
        maxlen = self.backend.screen.history.size
        if top + bottom + self._rows > maxlen:
            newBottom = maxlen - self._rows - curr
        else:
            newBottom = top + bottom - curr
        lastBottom = -1
        while 1:
            if newBottom > bottom:
                self.backend.screen.prev_page()
            elif newBottom < bottom:
                self.backend.screen.next_page()
            else:
                break
            # move up 1 line(ratio must set to move on line every prev_page)
            bottom = len(self.backend.screen.history.bottom)
            if bottom == lastBottom:
                break
            lastBottom = bottom
        self.updatePixmapLock.release()


    def paintEvent(self, event):
        '''
            paint pixmap to on widget
        '''
        with self.updatePixmapLock:
            self._ensure_pixmap()
            painter = QPainter(self)
            painter.drawPixmap(0, 0, self.pixmap)
            painter.end()
        # set scrollbar
        if self.scrollBar is None:
            return
        with self.updatePixmapLock:
            top = len(self.backend.screen.history.top)
            bottom = len(self.backend.screen.history.bottom)
            maxlen = self.backend.screen.history.size
        if top + bottom + self._rows > maxlen:
            barCount = maxlen - self._rows
            curr = maxlen - bottom - self._rows
        else:
            barCount = top + bottom
            curr = top
        # prevent scrollbar event
        if self.scrollStatus != (curr, barCount):
            if self.scrollEventSet:
                self.scrollBar.valueChanged.disconnect()
            self.scrollBar.setMaximum(barCount)
            self.scrollBar.setMinimum(0)
            self.scrollBar.setSliderPosition(curr)
            self.scrollBar.valueChanged.connect(self.onScrolled)
            self.scrollEventSet = True
            self.scrollStatus = (curr, barCount)

    def timerEvent(self, event):
        '''
            scheduled check change
        '''
        self._refresh_from_backend()

    def onReceived(self, data:bytes):
        '''
            in receive thread, not UI thread
            lock to make sure receive thread not change screen when check changes here
        '''
        with self.updatePixmapLock:
            self.backend.feed(data)
        self.repaintRequested.emit()

    def updatePixmap(self):
        screen = self.backend.screen
        active = self._keywords_enabled(screen)
        if active != self._highlighting_active:
            self._highlighting_active = active
            screen.dirty.update(range(screen.lines))
        cursor = self.backend.screen.cursor
        # display changed or cursor changed
        if self.backend.screen.dirty or (self.cursor_x != cursor.x or self.cursor_y != cursor.y):
            self.paint_part_pixmap()
            # trigger paintEvent
            self.update()

    def event(self, e):
        if type(e) == QKeyEvent and e.key() == Qt.Key_Tab:
            if e.type() == QKeyEvent.KeyPress:
                self.keyPressEvent(e)
            return True
        return super().event(e)

    def inputMethodEvent(self, e):
        text = e.commitString()
        if text:
            self.send(text.encode("utf-8"))

    def keyPressEvent(self, event):
        text = str(event.text())
        key = event.key()
        modifiers = event.modifiers()
        ctrl = (modifiers == Qt.ControlModifier | Qt.ShiftModifier) or (modifiers == Qt.ControlModifier)
        if ctrl and key == Qt.Key_V:
            content = pyperclip.paste()
            self.send(content.encode("utf-8"))
        elif text and not key in self.keymap:
            self.send(text.encode("utf-8"))
        else:
            s = self.keymap.get(key)
            if s:
                self.send(s)
        event.accept()

    def resizeEvent(self, event):
        try:
            if not hasattr(self, "updatePixmapLock"):
                return
            with self.updatePixmapLock:
                columns, rows = self._pixel2pos(self.width(), self.height())
                self._columns, self._rows = max(1, columns), max(1, rows)
                self.backend.resize(self._columns, self._rows)
                self.pixmap = self._new_pixmap()
                self.paint_full_pixmap()
            self.resizeConn(self._columns, self._rows)
        except:
            import traceback
            traceback.print_exc()

    def setScrollBar(self, scrollBar):
        self.scrollBar = scrollBar
        self.scrollBar.setMinimum(0)
        height = len(self.backend.screen.history.top) + len(self.backend.screen.history.bottom) - self._rows
        self.scrollBar.setMaximum(height if height > 0 else 0)
        self.scrollBar.setMinimum(0)
        if not self.scrollEventSet:
            self.scrollBar.valueChanged.connect(self.onScrolled)
            self.scrollEventSet = True

    def _pos_pix2colrow(self, x, y):
        '''
            @return x, y, scroll(-1: up, 0:not scroll, 1: down)
        '''
        scroll = 0
        row = y // self._char_height
        if row >= self._rows:
            row = self._rows - 1
            scroll = 1
        if row < 0:
            row = 0
            col = 0
            scroll = -1
        else:
            col = round(x / self._char_width)
            if col > self._columns:
                col = self._columns
            elif col < 0:
                col = 0
        return col, row, scroll

    def _pos_to_absolute(self, col, row):
        row = len(self.backend.screen.history.top) + row
        return col, row

    def _copy2clipboard(self, start, end):
        content = self._get_selected_data(start, end)
        pyperclip.copy(content)

    def _selection_lines(self, start, end):
        for row in range(start[3], end[3] + 1):
            first = start[2] if row == start[3] else 0
            last = end[2] if row == end[3] else self._columns
            line = self._get_line(row)
            first, last = max(0, first), min(self._columns, last)
            if first < last:
                if first > 0 and not line[first].data:
                    first -= 1
                if last < self._columns and not line[last].data:
                    last += 1
            yield line, range(first, last)

    def _get_selected_data(self, start, end):
        return "\n".join("".join(line[col].data for col in columns)
                         for line, columns in self._selection_lines(start, end))

    def mousePressEvent(self, e):
        self.mouseButton = e.button()
        x = e.x(); y = e.y()
        col, row, scroll = self._pos_pix2colrow(x, y)
        col, row = self._pos_to_absolute(col, row)
        self.selectionStart = (x, y, col, row)
        if self.lastSelection:
            if self.lastSelection[0] == self.lastSelection[1] and e.button() == Qt.RightButton: # no selection
                content = pyperclip.paste()
                self.send(content.encode("utf-8"))
            else:
                # mouse right button copy content to clipboard
                if e.button() == Qt.RightButton:
                    self._copy2clipboard(self.lastSelection[0], self.lastSelection[1])
                # unselect
                self.select(self.lastSelection[0], self.lastSelection[1], unselect=True)
        self.lastSelection = [self.selectionStart, self.selectionStart]
        self.selectScroll["speed"] =self.selectScroll["start_speed"]

    def toggleSelect(self, item):
        if item.bg == "selected":
            item = item._replace(bg="default")
        else:
            item = item._replace(bg="selected")
        return item

    def mouseMoveEvent(self, e):
        if self.mouseButton != Qt.LeftButton: # e.button() not work here, so use variable
            return
        self.updatePixmapLock.acquire()
        x = e.x(); y = e.y()
        col, row, scroll = self._pos_pix2colrow(x, y)
        col, row = self._pos_to_absolute(col, row)
        cursorPos = (x, y, col, row)
        # scroll
        if scroll != 0 and time.time() - self.selectScroll["ts"] > self.selectScroll["speed"]:
            if scroll < 0:
                self.backend.screen.prev_page()
            else:
                self.backend.screen.next_page()
            self.selectScroll["ts"] = time.time()
            if self.selectScroll["speed"] > self.selectScroll["max_speed"]:
                self.selectScroll["speed"] -= 0.005

        # get selection
        if col + row * self._columns > self.selectionStart[2] + self.selectionStart[3] * self._columns:
            front2rear = True
        else:
            front2rear = False
        if front2rear:
            newSelection = [self.selectionStart, cursorPos]
        else:
            newSelection = [cursorPos, self.selectionStart]
        # selection not change
        if newSelection[0][2:] == self.lastSelection[0][2:] and newSelection[1][2:] == self.lastSelection[1][2:]:
            self.updatePixmapLock.release()
            if scroll != 0:
                self.update()
            return
        # find need select range
        # find need erase election range
        needSlect = []; needErase = []
        newIdx = newSelection[0][2] + newSelection[0][3] * self._columns
        oldIdx = self.lastSelection[0][2] + self.lastSelection[0][3] * self._columns
        if newIdx < oldIdx:
            needSlect.append((newSelection[0], self.lastSelection[0]))
        elif newIdx > oldIdx:
            needErase.append((self.lastSelection[0], newSelection[0]))
        newIdx = newSelection[1][2] + newSelection[1][3] * self._columns
        oldIdx = self.lastSelection[1][2] + self.lastSelection[1][3] * self._columns
        if newIdx < oldIdx:
            needErase.append((newSelection[1], self.lastSelection[1]))
        elif newIdx > oldIdx:
            needSlect.append((self.lastSelection[1], newSelection[1]))
        # select
        for start, end in needSlect:
            self.select(start, end)
        for start, end in needErase:
            self.select(start, end, unselect = True)
        self.updatePixmapLock.release()
        # unselect
        # update last selection
        self.lastSelection = newSelection
        self.update()

    def mouseReleaseEvent(self, e):
        self.mouseButton = None

    def _get_line(self, row):
        if row < len(self.backend.screen.history.top):
            line = self.backend.screen.history.top[row]
        elif row < len(self.backend.screen.history.top) + self._rows:
            line = self.backend.screen.buffer[row - len(self.backend.screen.history.top)]
            self.backend.screen.dirty.add(row - len(self.backend.screen.history.top))
        else:
            line = self.backend.screen.history.bottom[row - len(self.backend.screen.history.top) - self._rows]
        return line

    def select(self, start, end, unselect = False):
        for line, columns in self._selection_lines(start, end):
            for col in columns:
                key = (id(line), col)
                if unselect:
                    self._selection.pop(key, None)
                else:
                    # Retain the line so an old dictionary id cannot be reused.
                    self._selection[key] = line



class Scroll_Terminal(QWidget):
    def __init__(self, sendFunc, resizeConnFunc, isConnectFunc) -> None:
        super().__init__()
        self.terminal = Terminal_Frontend(sendFunc, resizeConnFunc, isConnectFunc)
        self.scrollBar = QScrollBar(Qt.Vertical, self.terminal)
        self.terminal.setScrollBar(self.scrollBar)
        self.scrollBar.setProperty("class", "scrollbar2")
        layout = QHBoxLayout()
        self.setLayout(layout)
        layout.addWidget(self.terminal)
        layout.addWidget(self.scrollBar)
        self.resize(self.terminal.size())

    def onReceived(self, data):
        self.terminal.onReceived(data)

class Plugin(Plugin_Base):
    '''
        call sequence:
            set vars like hintSignal, hintSignal
            onInit
            onWidget
            onUiInitDone
                send
                onReceived
            onDel
    '''
    # vars set by caller
    isConnected = lambda : False
    send = lambda x,y:None          # send(data_bytes=None, file_path=None, callback=lambda ok,msg:None)
    hintSignal = None               # hintSignal.emit(type(error, warning, info), title, msg)
    reloadWindowSignal = None       # reloadWindowSignal.emit(title, msg, callback(close or not)), reload window to load new configs
    configGlobal = {}
    # other vars
    connParent = "main"      # parent id
    connChilds = []          # children ids
    id = "terminal"
    name = _("terminal")

    enabled = False          # user enabled this plugin
    active  = False          # using this plugin

    def __init__(self):
        super().__init__()
        if not self.id:
            raise ValueError(f"var id of Plugin {self} should be set")

    def onInit(self, config):
        '''
            init params, DO NOT take too long time in this func
            @config dict type, just change this var's content,
                               when program exit, this config will be auto save to config file
        '''
        self.config = config
        default = {
            "version": 1,
            "keywordHighlighting": True,
        }
        for k in default:
            if not k in self.config:
                self.config[k] = default[k]

    def onActive(self):
        pass

    def onDel(self):
        pass

    def onWidgetMain(self, parent):
        self.widget = Scroll_Terminal(self.send, self.resizeConnOutput, self.isConnected)
        self.widget.terminal.setKeywordHighlighting(self.config["keywordHighlighting"])
        return self.widget

    def onWidgetSettings(self, parent):
        widget = QWidget()
        layout = QVBoxLayout(widget)
        self.highlightCheckBox = QCheckBox(_("Keyword highlighting"))
        self.highlightCheckBox.setToolTip(_("Highlight addresses, command options and status keywords without overriding command colors."))
        self.highlightCheckBox.setChecked(self.config["keywordHighlighting"])
        self.highlightCheckBox.toggled.connect(self._highlightChanged)
        layout.addWidget(self.highlightCheckBox)
        return widget

    def _highlightChanged(self, enabled):
        self.config["keywordHighlighting"] = bool(enabled)
        if hasattr(self, "widget"):
            self.widget.terminal.setKeywordHighlighting(enabled)

    def resizeConnOutput(self, w, h):
        if self.isConnected:
            self.ctrlConn("resize", (w, h))

    def onReceived(self, data : bytes):
        self.widget.onReceived(data)
        for plugin in self.connChilds:
            plugin.onReceived(data)

    def onKeyPressEvent(self, event):
        pass

    def onKeyReleaseEvent(self, event):
        pass

    def onUiInitDone(self):
        '''
            UI init done, you can update your widget here
            this method runs in UI thread, do not block too long
        '''
        pass

    def onConnChanged(self, status:ConnectionStatus, msg:str):
        '''
            call in UI thread, be carefully!!
        '''
        super().onConnChanged(status, msg)
        if status == ConnectionStatus.CONNECTED:
            # set pty size when first connect
            self.widget.terminal.resizeEvent("")
            # auto focus terminal
            self.widget.terminal.setFocus()

