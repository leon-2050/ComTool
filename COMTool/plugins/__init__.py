# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
"""Builtin plugin metadata, with implementations loaded when a session needs them."""
from importlib import import_module

try:
    from i18n import _
except ImportError:
    from COMTool.i18n import _


class BuiltinPlugin:
    """Expose menu metadata without importing optional, expensive dependencies."""

    def __init__(self, plugin_id, display_name):
        self.id = plugin_id
        self._display_name = display_name
        self._plugin_class = None

    @property
    def name(self):
        return _(self._display_name)

    def load(self):
        if self._plugin_class is None:
            self._plugin_class = import_module("." + self.id, __name__).Plugin
        return self._plugin_class

    @property
    def help(self):
        return self.load().help

    def __call__(self, *args, **kwargs):
        return self.load()(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(self.load(), name)


pluginClasses = [
    BuiltinPlugin("dbg", "Send Receive"),
    BuiltinPlugin("protocol", "protocol"),
    BuiltinPlugin("terminal", "terminal"),
    BuiltinPlugin("graph", "Graph"),
]
builtinPlugins = {plugin.id: plugin for plugin in pluginClasses}
