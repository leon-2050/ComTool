# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
'''
    logger wrapper based oh logging

    @author neucrack
    @license MIT copyright 2020-2021 neucrack CZD666666@gmail.com
'''



import logging
import sys

class Logger:
    '''
        use logging module to record log to console or file
    '''
    def __init__(self, level="d", stdout = True, file_path=None,
                fmt = '%(asctime)s - [%(levelname)s] - %(message)s',
                logger_name = "logger"):
        self.log = logging.getLogger(logger_name)
        formatter=logging.Formatter(fmt=fmt)
        level_ = {"d": logging.DEBUG, "i": logging.INFO,
                  "w": logging.WARNING, "e": logging.ERROR}.get(level, logging.INFO)
        self.log.setLevel(level_)
        self.log.propagate = False
        # Reinitializing the wrapper must not duplicate output handlers.
        for handler in self.log.handlers[:]:
            self.log.removeHandler(handler)
            handler.close()
        if stdout and sys.stderr is not None:
            handler = logging.StreamHandler(sys.stderr)
            handler.setFormatter(formatter)
            self.log.addHandler(handler)
        if file_path:
            # Normal launches never open or create a log until an error occurs.
            fh = logging.FileHandler(file_path, mode="a", encoding="utf-8", delay=True)
            fh.setFormatter(formatter)
            fh.setLevel(level_)
            self.log.addHandler(fh)
        if not self.log.handlers:
            self.log.addHandler(logging.NullHandler())

    def _write(self, level, args):
        if self.log.isEnabledFor(level):
            self.log.log(level, " ".join(str(arg) for arg in args))

    def d(self, *args):
        self._write(logging.DEBUG, args)

    def i(self, *args):
        self._write(logging.INFO, args)

    def w(self, *args):
        self._write(logging.WARNING, args)

    def e(self, *args):
        self._write(logging.ERROR, args)

class Fake_Logger:
    '''
        use logging module to record log to console or file
    '''
    def __init__(self, level="d", file_path=None, fmt = '%(asctime)s - [%(levelname)s]: %(message)s'):
        pass

    def d(self, *args):
        print(args)

    def i(self, *args):
        print(args)

    def w(self, *args):
        print(args)

    def e(self, *args):
        print(args)


if __name__ == "__main__":
    import os
    log = Logger(file_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "test.log"))
    log.d("debug", "hello")
    log.i("info:", 1)
    log.w("warning")
    log.e("error")



