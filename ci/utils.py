import sys

import ui


def print_cmd():
    ui.info(sys.executable, " ".join(sys.argv))
