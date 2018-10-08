import subprocess
import os
import sys

import ui


def print_cmd():
    ui.info(sys.executable, " ".join(sys.argv))


def run(*cmd, **kwargs):
    ui.info_2(" ".join(cmd))
    kwargs.setdefault('check', True)
    subprocess.run(cmd, **kwargs)


def run_yarn(*args, **kwargs):
    cmd = "yarn"
    if os.name == "nt":
        cmd += ".cmd"

    run(cmd, *args, **kwargs)


def install_deps():
    run_yarn()
