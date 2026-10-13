# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
try:
    from Combobox import ComboBox
    from i18n import _
    import utils, parameters
    from parameters import dataPath
    from ui_icons import icon as makeIcon
except ImportError:
    from COMTool import utils, parameters
    from COMTool.i18n import _
    from COMTool.Combobox import ComboBox
    from COMTool.parameters import dataPath
    from COMTool.ui_icons import icon as makeIcon

from PyQt5.QtWidgets import QWidget
from PyQt5 import sip
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import QSize
import os

_buttonIcons = {}
_skin = "light"

def get_skins():
    qss_path = os.path.join(dataPath, "assets", "qss")
    names = os.listdir(qss_path)
    styles = []
    for name in names:
        if name.startswith("style-"):
            styles.append(name[6:-4])
    return styles

def setSkin(skin):
    global _skin, _buttonIcons

    if skin == _skin:
        return
    delete = []
    for btn in list(_buttonIcons):
        if sip.isdeleted(btn):
            delete.append(btn)
            continue
        icon, colorVar = _buttonIcons[btn]
        color = parameters.styleForCode[skin][colorVar]
        btn.setIcon(makeIcon(icon, color=color))
    for btn in delete:
        _buttonIcons.pop(btn)
    _skin = skin    

def setButtonIcon(button, icon : str, colorVar = "iconColor"):
    '''
        @colorVar set in parameters.styleForCode
    '''
    global _skin, _buttonIcons

    iconColor = parameters.styleForCode[_skin][colorVar]
    firstRegistration = button not in _buttonIcons
    _buttonIcons[button] = [icon, colorVar]
    if firstRegistration:
        button.destroyed.connect(lambda _=None, btn=button: _buttonIcons.pop(btn, None))
        button.setIconSize(QSize(18, 18))
    button.setIcon(makeIcon(icon, color=iconColor))

def clearButtonIcon(button):
    global _skin, _buttonIcons
    if button in _buttonIcons:
        button.setIcon(QIcon())
        _buttonIcons.pop(button)

def getStyleVar(var):
    global _skin, _buttonIcons

    return parameters.styleForCode[_skin][var]

def updateStyle(parent, widget):
    parent.style().unpolish(widget)
    parent.style().polish(widget)
    parent.update()
