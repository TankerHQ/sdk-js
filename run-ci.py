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

import ci.js
import ci.endtoend
import ci.conan
import ci.cpp


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
    ci.run("RunDll32.exe", "InetCpl.cpl,ClearMyTracksByProcess", "511")
    time.sleep(5)


def delete_safari_state() -> None:
    safari_user_path = Path(r"~/Library/Safari").expanduser()
    safari_user_path.rmtree_p()


def run_tests_in_browser_ten_times(*, env: str, runner: str) -> None:
    failures = list()
    for i in range(1, 11):
        print("\n" + "-" * 80 + "\n")
        print("Running tests round", i)
        print("-" * 80, end="\n\n")
        try:
            run_tests_in_browser(env=env, runner=runner)
        except (Exception, SystemExit):
            failures.append(i)

    if failures:
        print("Tests failed")
        print("Failed rounds:", repr(failures))
        raise TestFailed


def run_tests_in_browser(*, env: str, runner: str) -> None:
    run_env = ci.js.get_run_env(project_config=env)
    if runner == "linux":
        ci.js.run_yarn("karma", "--browsers", "ChromiumInDocker", env=run_env)
    elif runner == "macos":
        ci.run("killall", "Safari", check=False)
        delete_safari_state()
        this_path = Path(__file__).parent
        safari_awaker_script = this_path / "ci/keep-safari-awake.sh"
        safari_awaker = subprocess.Popen(["bash", safari_awaker_script])
        try:
            ci.js.run_yarn("karma", "--browsers", "Safari", env=run_env)
        finally:
            safari_awaker.kill()
    elif runner == "windows-edge":
        delete_edge_state()
        ci.js.run_yarn("karma", "--browsers", "Edge", env=run_env)
    elif runner == "windows-ie":
        delete_ie_state()
        ci.js.run_yarn("karma", "--browsers", "IE", env=run_env)


def run_sdk_compat_tests(*, env: str) -> None:
    run_env = ci.js.get_run_env(project_config=env)
    cwd = Path.getcwd() / "ci/compat"
    ci.js.yarn_install_deps(cwd=cwd)
    ci.js.run_yarn("proof", cwd=cwd, env=run_env)


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
    ci.run("npm", "publish", "--access", "public", "--tag", npm_tag, cwd=package_path)


def run_linters() -> None:
    ci.js.run_yarn("flow")
    ci.js.run_yarn("lint:js")


def run_tests_in_node(*, env: str) -> None:
    run_env = ci.js.get_run_env(project_config=env)
    ci.js.run_yarn("coverage", env=run_env)


def check(*, runner: str, env: str, nightly: bool) -> None:
    ci.js.yarn_install_deps()
    if runner == "linux" and not nightly:
        run_linters()
        run_tests_in_node(env=env)

    if nightly:
        run_tests_in_browser_ten_times(env=env, runner=runner)
    else:
        run_tests_in_browser(env=env, runner=runner)


def compat(*, env: str) -> None:
    ci.js.yarn_install_deps()
    run_sdk_compat_tests(env=env)


def e2e(args) -> None:
    if args.use_local_sources:
        base_path = Path.getcwd().parent
    else:
        base_path = ci.git.prepare_sources(
            repos=["sdk-native", "sdk-python", "sdk-js", "qa-python-js"]
        )
    ci.cpp.update_conan_config()
    ci.conan.export(src_path=base_path / "sdk-native", ref_or_channel="tanker/dev")
    ci.endtoend.test(
        tanker_conan_ref="tanker/dev@tanker/dev",
        profile="gcc8-release",
        base_path=base_path,
        project_config=args.env,
    )


def deploy_sdk(env: str, git_tag: str) -> None:
    ci.js.yarn_install_deps()
    version = ci.bump.version_from_git_tag(git_tag)
    ci.bump.bump_files(version)

    # Publish packages in order so that dependencies don't break during deploy
    configs = [
        {"build": "global-this", "publish": ["@tanker/global-this"]},
        {"build": "crypto", "publish": ["@tanker/crypto"]},
        {"build": "errors", "publish": ["@tanker/errors"]},
        {"build": "identity", "publish": ["@tanker/identity"]},
        {"build": "file-ponyfill", "publish": ["@tanker/file-ponyfill"]},
        {"build": "file-reader", "publish": ["@tanker/file-reader"]},
        {"build": "types", "publish": ["@tanker/types"]},
        {
            "build": "streams",
            "publish": [
                "@tanker/stream-base",
                "@tanker/stream-browser",
                "@tanker/stream-node",
                "@tanker/stream-cloud-storage",
            ],
        },
        {
            "build": "datastores",
            "publish": [
                "@tanker/datastore-base",
                "@tanker/datastore-dexie-browser",
                "@tanker/datastore-pouchdb-base",
                "@tanker/datastore-pouchdb-memory",
                "@tanker/datastore-pouchdb-node",
            ],
        },
        {"build": "core", "publish": ["@tanker/core"]},
        {"build": "client-browser", "publish": ["@tanker/client-browser"]},
        {"build": "client-node", "publish": ["@tanker/client-node"]},
        {"build": "verification-ui", "publish": ["@tanker/verification-ui"]},
        {"build": "fake-authentication", "publish": ["@tanker/fake-authentication"]},
        {"build": "filekit", "publish": ["@tanker/filekit"]},
    ]

    for config in configs:
        ci.js.yarn_build(delivery=config["build"], env=env)  # type: ignore
        for package_name in config["publish"]:
            publish_npm_package(package_name, version)


def _main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(title="subcommands", dest="command")

    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--nightly", action="store_true")
    check_parser.add_argument("--env", default="dev")
    check_parser.add_argument("--runner", required=True)

    deploy_parser = subparsers.add_parser("deploy")
    deploy_parser.add_argument("--git-tag", required=True)
    deploy_parser.add_argument("--env", required=True)

    compat_parser = subparsers.add_parser("compat")
    compat_parser.add_argument("--env", required=True)

    e2e_parser = subparsers.add_parser("e2e")
    e2e_parser.add_argument("--env", required=True)
    e2e_parser.add_argument("--use-local-sources", action="store_true", default=False)

    subparsers.add_parser("mirror")

    args = parser.parse_args()
    if args.command == "check":
        runner = args.runner
        nightly = args.nightly
        check(runner=runner, env=args.env, nightly=nightly)
    elif args.command == "deploy":
        git_tag = args.git_tag
        deploy_sdk(env=args.env, git_tag=git_tag)
    elif args.command == "mirror":
        ci.git.mirror(github_url="git@github.com:TankerHQ/sdk-js")
    elif args.command == "compat":
        compat(env=args.env)
    elif args.command == "e2e":
        e2e(args)
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
