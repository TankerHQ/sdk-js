from typing import Any, Callable
import argparse
import os
from pathlib import Path
import re
import shutil
import sys
import time
import json

import cli_ui as ui
import psutil

import tankerci.conan
import tankerci.js
import tankerci.reporting


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
    kill_windows_process_if_running("msedge.exe")
    kill_windows_process_if_running("iexplore.exe")
    kill_windows_process_if_running("dllhost.exe")


def onerror(navigator: str) -> Callable[..., None]:
    def fcn(_: Callable[..., None], path: str, e: Any) -> None:
        ui.error(
            f"While attempting to clear {navigator}'s state, ",
            f"unable to delete path: {path}\n",
            f"error: {e}",
        )
        shutil.rmtree(path, ignore_errors=True)

    return fcn


def delete_ie_state() -> None:
    kill_windows_processes()
    localappdata = os.environ.get("LOCALAPPDATA")
    ie_db_path = Path(r"%s\Microsoft\Internet Explorer\Indexed DB" % localappdata)
    shutil.rmtree(ie_db_path, onerror=onerror("IE"))

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
    tankerci.run("RunDll32.exe", "InetCpl.cpl,ClearMyTracksByProcess", "511")
    time.sleep(5)


def delete_safari_state() -> None:
    safari_user_path = Path(r"~/Library/Safari").expanduser()
    if safari_user_path.exists():
        shutil.rmtree(safari_user_path)


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
        tankerci.js.run_yarn("karma", "--browsers", "ChromeInDocker")
    elif runner == "macos":
        tankerci.run("killall", "Safari", check=False)
        delete_safari_state()
        tankerci.js.run_yarn("karma", "--browsers", "Safari")
    elif runner == "windows-edge":
        kill_windows_processes()
        tankerci.js.run_yarn("karma", "--browsers", "EdgeHeadless")
    elif runner == "windows-ie":
        delete_ie_state()
        tankerci.js.run_yarn("karma", "--browsers", "IE")


def run_sdk_compat_tests() -> None:
    cwd = Path.cwd() / "ci/compat"
    tankerci.js.yarn_install_deps(cwd=cwd)
    tankerci.js.run_yarn("proof", cwd=cwd)


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
    tankerci.run(
        "npm", "publish", "--access", "public", "--tag", npm_tag, cwd=package_path
    )


def run_linters() -> None:
    tankerci.js.run_yarn("flow")
    tankerci.js.run_yarn("lint:js")


def run_tests_in_node() -> None:
    tankerci.js.run_yarn("coverage")


def check(*, runner: str, nightly: bool) -> None:
    tankerci.js.yarn_install_deps()
    if runner == "linux" and not nightly:
        run_linters()
        run_tests_in_node()

    if nightly:
        run_tests_in_browser_ten_times(runner=runner)
    else:
        run_tests_in_browser(runner=runner)


def compat() -> None:
    tankerci.js.yarn_install_deps()
    run_sdk_compat_tests()


def e2e(*, use_local_sources: bool) -> None:
    if use_local_sources:
        base_path = Path.cwd().parent
    else:
        base_path = tankerci.git.prepare_sources(
            repos=["sdk-python", "sdk-js", "qa-python-js"]
        )
    tankerci.conan.set_home_isolation()
    tankerci.conan.update_config()
    with base_path / "sdk-python":
        tankerci.run("poetry", "install", "--no-root")
        tankerci.conan.install_tanker_source(
            tankerci.conan.TankerSource.SAME_AS_BRANCH,
            output_path=Path("conan") / "out",
            profiles=["gcc8-release"],
            update=False,
            tanker_deployed_ref=None,
        )
        tankerci.run("poetry", "install")
    with base_path / "sdk-js":
        tankerci.js.yarn_install()
    with base_path / "qa-python-js":
        tankerci.run("poetry", "install")
        tankerci.run("poetry", "run", "pytest", "--verbose", "--capture=no")


def deploy_sdk(*, env: str, git_tag: str) -> None:
    tankerci.js.yarn_install_deps()
    version = tankerci.bump.version_from_git_tag(git_tag)
    tankerci.bump.bump_files(version)

    # Publish packages in order so that dependencies don't break during deploy
    configs = [
        {"build": "global-this", "publish": ["@tanker/global-this"]},
        {"build": "crypto", "publish": ["@tanker/crypto"]},
        {"build": "errors", "publish": ["@tanker/errors"]},
        {"build": "identity", "publish": ["@tanker/identity"]},
        {"build": "file-ponyfill", "publish": ["@tanker/file-ponyfill"]},
        {"build": "file-reader", "publish": ["@tanker/file-reader"]},
        {"build": "http-utils", "publish": ["@tanker/http-utils"]},
        {"build": "types", "publish": ["@tanker/types"]},
        {
            "build": "streams",
            "publish": [
                "@tanker/stream-base",
                "@tanker/stream-cloud-storage",
            ],
        },
        {
            "build": "datastores",
            "publish": [
                "@tanker/datastore-base",
                "@tanker/datastore-dexie-base",
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
        tankerci.js.yarn_build(delivery=config["build"], env=env)  # type: ignore
        for package_name in config["publish"]:
            publish_npm_package(package_name, version)


def get_branch_name() -> str:
    branch = os.environ.get("CI_COMMIT_BRANCH", None)
    if not branch:
        branch = tankerci.git.get_current_branch(Path().getcwd())
    if not branch:
        ui.fatal("Not on a branch, can't report size")
    ui.info(f"Running on branch {branch}")
    return branch


def report_size() -> None:
    tankerci.reporting.assert_can_send_metrics()

    branch = get_branch_name()
    _, commit_id = tankerci.git.run_captured(os.getcwd(), "rev-parse", "HEAD")

    tankerci.run("yarn", "build:client-browser-umd")
    lib_path = Path("packages/client-browser/dist/umd/tanker-client-browser.min.js")
    size = lib_path.getsize()
    tankerci.reporting.send_metric(
        f"benchmark",
        tags={
            "project": "sdk-js",
            "branch": branch,
            "object": "client-browser-umd",
            "scenario": "size",
        },
        fields={"value": size, "commit_id": commit_id},
    )


def benchmark(*, runner: str) -> None:
    tankerci.reporting.assert_can_send_metrics()

    branch = get_branch_name()
    _, commit_id = tankerci.git.run_captured(os.getcwd(), "rev-parse", "HEAD")

    if runner == "linux":
        tankerci.js.run_yarn("benchmark", "--browsers", "ChromeInDocker")
    else:
        raise RuntimeError(f"unsupported runner {runner}")
    benchmark_output = Path("benchmarks.json")
    benchmark_results = json.loads(benchmark_output.read_text())

    hostname = os.environ.get("CI_RUNNER_DESCRIPTION", None)
    if not hostname:
        hostname = benchmark_results["context"]["host"]

    for browser in benchmark_results["browsers"]:
        # map the name to something more friendly
        if browser["name"].startswith("Chrome Headless"):
            browser_name = "chrome-headless"
        else:
            raise RuntimeError(f"unsupported browser {browser['name']}")

        for benchmark in browser["benchmarks"]:
            tankerci.reporting.send_metric(
                f"benchmark",
                tags={
                    "project": "sdk-js",
                    "branch": branch,
                    "browser": browser_name,
                    "scenario": benchmark["name"].lower(),
                    "host": hostname,
                },
                fields={"real_time": benchmark["real_time"], "commit_id": commit_id},
            )


def _main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(title="subcommands", dest="command")

    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--nightly", action="store_true")
    check_parser.add_argument("--runner", required=True)

    deploy_parser = subparsers.add_parser("deploy")
    deploy_parser.add_argument("--git-tag", required=True)
    deploy_parser.add_argument("--env", required=True)

    subparsers.add_parser("compat")

    e2e_parser = subparsers.add_parser("e2e")
    e2e_parser.add_argument("--use-local-sources", action="store_true", default=False)

    subparsers.add_parser("mirror")

    benchmark_parser = subparsers.add_parser("benchmark")
    benchmark_parser.add_argument("--runner", required=True)

    args = parser.parse_args()
    if args.command == "check":
        runner = args.runner
        nightly = args.nightly
        check(runner=runner, nightly=nightly)
    elif args.command == "deploy":
        git_tag = args.git_tag
        deploy_sdk(env=args.env, git_tag=git_tag)
    elif args.command == "mirror":
        tankerci.git.mirror(github_url="git@github.com:TankerHQ/sdk-js")
    elif args.command == "compat":
        compat()
    elif args.command == "e2e":
        e2e(use_local_sources=args.use_local_sources)
    elif args.command == "benchmark":
        tankerci.js.yarn_install()
        report_size()
        benchmark(runner=args.runner)
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
