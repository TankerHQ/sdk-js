from typing import Any, Callable
import argparse
import os
import re
import subprocess
import sys
import time

import cli_ui as ui
from path import Path
import psutil


def run(*cmd: str, **kwargs: Any) -> "subprocess.CompletedProcess[str]":
    check = kwargs.get("check", True)
    if "cwd" in kwargs:
        ui.info_2(kwargs["cwd"], ui.green, "$", end=" ")
    else:
        ui.info_2(os.getcwd(), ui.green, "$", end=" ")
    ui.info(*cmd)
    completed_process = subprocess.run(cmd, **kwargs)
    returncode = completed_process.returncode
    if returncode != 0 and check:
        ui.fatal(f'`{" ".join(cmd)}` exited with retcode: {returncode}')
    return completed_process


def run_yarn(*args: str, **kwargs: Any) -> None:
    cmd = "yarn"
    if os.name == "nt":
        cmd += ".cmd"
    run(cmd, *args, **kwargs)


class TestFailed(Exception):
    pass


def find_procs_by_name(name: str) -> psutil.Process:
    "Return a list of processes matching 'name'."
    ls = []
    for p in psutil.process_iter(attrs=["name", "exe", "cmdline"]):
        if (
            name == p.info["name"]
            or p.info["exe"]
            and os.path.basename(p.info["exe"]) == name
            or p.info["cmdline"]
            and p.info["cmdline"][0] == name
        ):
            ls.append(p)
    return ls


def kill_windows_process_if_running(name: str) -> None:
    processes = find_procs_by_name(name)
    for p in processes:
        p.kill()
    psutil.wait_procs(processes)


def kill_windows_processes() -> None:
    kill_windows_process_if_running("MicrosoftEdge.exe")
    kill_windows_process_if_running("iexplore.exe")
    kill_windows_process_if_running("dllhost.exe")


def onerror(navigator: str) -> Callable[..., None]:
    def fcn(_: Callable[..., None], path: str, e: Any) -> None:
        ui.error(
            f"While attempting to clear {navigator}'s state, ",
            f"unable to delete path: {path}\n",
            f"error: {e}",
        )
        Path(path).rmtree(ignore_errors=True)

    return fcn


def delete_edge_state() -> None:
    kill_windows_processes()
    localappdata = os.environ.get("LOCALAPPDATA")
    edge_path = Path(
        r"%s\Packages\Microsoft.MicrosoftEdge_8wekyb3d8bbwe" % localappdata
    )  # noqa
    edge_ac_path = edge_path.joinpath("AC")
    user_default_path = edge_ac_path.joinpath(r"MicrosoftEdge\User\Default")

    targets = edge_ac_path.glob("#!*")
    targets.append(edge_path.joinpath(r"AppData"))
    targets.append(user_default_path.joinpath(r"Recovery\Active"))
    targets.append(user_default_path.joinpath("DataStore"))
    for target in targets:
        target.rmtree(onerror=onerror("Edge"))


def delete_ie_state() -> None:
    kill_windows_processes()
    localappdata = os.environ.get("LOCALAPPDATA")
    ie_db_path = Path(r"%s\Microsoft\Internet Explorer\Indexed DB" % localappdata)
    ie_db_path.rmtree(onerror=onerror("IE"))

    """
    This magic value is the combination of the following bitflags:
    #define CLEAR_HISTORY         0x0001 // Clears history
    #define CLEAR_COOKIES         0x0002 // Clears cookies
    #define CLEAR_CACHE           0x0004 // Clears Temporary Internet Files folder
    #define CLEAR_CACHE_ALL       0x0008 // Clears offline favorites and download history
    #define CLEAR_FORM_DATA       0x0010 // Clears saved form data for form auto-fill-in
    #define CLEAR_PASSWORDS       0x0020 // Clears passwords saved for websites
    #define CLEAR_PHISHING_FILTER 0x0040 // Clears phishing filter data
    #define CLEAR_RECOVERY_DATA   0x0080 // Clears webpage recovery data
    #define CLEAR_SHOW_NO_GUI     0x0100 // Do not show a GUI when running the cache clearing

    Total: 511
    """
    run("RunDll32.exe", "InetCpl.cpl,ClearMyTracksByProcess", "511")
    time.sleep(5)


def delete_safari_state() -> None:
    safari_user_path = Path(r"~/Library/Safari").expanduser()
    safari_user_path.rmtree_p()


def run_tests_in_browser_ten_times(*, runner: str) -> None:
    failures = list()
    for i in range(1, 11):
        print("\n" + "-" * 80 + "\n")
        print("Running tests round", i)
        print("-" * 80, end="\n\n")
        try:
            run_tests_in_browser(runner=runner)
        except (Exception, SystemExit):
            failures.append(i)

    if failures:
        print("Tests failed")
        print("Failed rounds:", repr(failures))
        raise TestFailed


def run_tests_in_browser(*, runner: str) -> None:
    if runner == "linux":
        run_yarn("karma", "--browsers", "ChromeInDocker")
    elif runner == "macos":
        run_yarn("karma", "--browsers", "Safari")
    elif runner == "windows-edge":
        run_yarn("karma", "--browsers", "EdgeAzure")
    elif runner == "windows-ie":
        run_yarn("karma", "--browsers", "IE")


def run_sdk_compat_tests() -> None:
    cwd = Path.getcwd() / "ci/compat"
    run_yarn(cwd=cwd)
    run_yarn("proof", cwd=cwd)


def get_package_path(package_name: str) -> Path:
    m = re.match(r"^@tanker/(?:(datastore|stream)-)?(.*)$", package_name)
    p = Path("packages")
    assert m
    if m[1]:
        p = p.joinpath(m[1])
    return p.joinpath(m[2]).joinpath("dist")


def version_to_npm_tag(version: str) -> str:
    for tag in ["alpha", "beta"]:
        if tag in version:
            return tag

    return "latest"


def publish_npm_package(package_name: str, version: str) -> None:
    package_path = get_package_path(package_name)
    npm_tag = version_to_npm_tag(version)
    run("npm", "publish", "--access", "public", "--tag", npm_tag, cwd=package_path)


def run_linters() -> None:
    run_yarn("flow")
    run_yarn("lint:js")


def run_tests_in_node() -> None:
    run_yarn("coverage")


def check(*, runner: str, nightly: bool) -> None:
    run_yarn()
    if runner == "linux" and not nightly:
        run_linters()
        run_tests_in_node()

    if nightly:
        run_tests_in_browser_ten_times(runner=runner)
    else:
        run_tests_in_browser(runner=runner)


def compat() -> None:
    run_yarn()
    run_sdk_compat_tests()


def _main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(title="subcommands", dest="command")

    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--nightly", action="store_true")
    check_parser.add_argument("--runner", required=True)

    subparsers.add_parser("compat")

    args = parser.parse_args()
    if args.command == "check":
        runner = args.runner
        nightly = args.nightly
        check(runner=runner, nightly=nightly)
    elif args.command == "compat":
        compat()
    else:
        parser.print_help()
        sys.exit(1)


def main():
    # hide backtrace when tests fail
    try:
        _main()
    except TestFailed:
        sys.exit(1)
    except Exception:
        raise


if __name__ == "__main__":
    main()
