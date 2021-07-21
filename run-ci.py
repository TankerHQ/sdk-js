from typing import Any, Callable, Optional, Dict, cast
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

import tankerci
import tankerci.conan
import tankerci.js
import tankerci.reporting
import tankerci.benchmark


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


def get_package_path(package_name: str, *, is_typescript: bool) -> Path:
    m = re.match(r"^@tanker/(?:(datastore|stream)-)?(.*)$", package_name)
    p = Path("packages")
    assert m
    if m[1]:
        p = p.joinpath(m[1])
    p = p.joinpath(m[2])
    if not is_typescript:
        p = p.joinpath("dist")
    return p


def version_to_npm_tag(version: str) -> str:
    for tag in ["alpha", "beta"]:
        if tag in version:
            return tag

    return "latest"


def publish_npm_package(package_name: str, version: str, is_typescript: bool) -> None:
    package_path = get_package_path(package_name, is_typescript=is_typescript)
    npm_tag = version_to_npm_tag(version)
    tankerci.run(
        "npm", "publish", "--access", "public", "--tag", npm_tag, cwd=package_path
    )


def run_tests_in_node() -> None:
    tankerci.js.run_yarn("exec", "--", "node", "--version")
    tankerci.js.run_yarn("build:ts")
    tankerci.js.run_yarn("coverage")


def lint() -> None:
    tankerci.js.yarn_install_deps()
    tankerci.js.run_yarn("lint:ts")
    tankerci.js.run_yarn("flow")
    tankerci.js.run_yarn("lint:js")


def check(*, runner: str, nightly: bool) -> None:
    tankerci.js.yarn_install_deps()
    if nightly:
        run_tests_in_browser_ten_times(runner=runner)
    elif runner == "node":
        run_tests_in_node()
    else:
        run_tests_in_browser(runner=runner)


def e2e(*, use_local_sources: bool) -> None:
    if use_local_sources:
        base_path = Path.cwd().parent
    else:
        base_path = tankerci.git.prepare_sources(
            repos=["sdk-python", "sdk-js", "qa-python-js"]
        )
    tankerci.conan.set_home_isolation()
    tankerci.conan.update_config()
    with tankerci.working_directory(base_path / "sdk-python"):
        tankerci.run("poetry", "install", "--no-root")
        tankerci.conan.install_tanker_source(
            tankerci.conan.TankerSource.SAME_AS_BRANCH,
            output_path=Path("conan") / "out",
            profiles=["linux-release"],
            update=False,
            tanker_deployed_ref=None,
        )
        tankerci.run("poetry", "install")
    with tankerci.working_directory(base_path / "sdk-js"):
        tankerci.js.yarn_install()
    with tankerci.working_directory(base_path / "qa-python-js"):
        tankerci.run("poetry", "install")
        tankerci.run("poetry", "run", "pytest", "--verbose", "--capture=no")


def deploy_sdk(*, git_tag: str) -> None:
    tankerci.js.yarn_install_deps()
    version = tankerci.bump.version_from_git_tag(git_tag)
    tankerci.bump.bump_files(version)

    # Publish packages in order so that dependencies don't break during deploy
    configs = [
        {"build": "global-this", "publish": ["@tanker/global-this"]},
        {"build": "crypto", "publish": ["@tanker/crypto"]},
        {"build": "errors", "typescript": True, "publish": ["@tanker/errors"]},
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
        tankerci.js.yarn_build(delivery=config["build"], env="prod")  # type: ignore
        for package_name in config["publish"]:
            publish_npm_package(package_name, version, config.get("typescript", False))


def get_branch_name() -> str:
    branch = os.environ.get("CI_COMMIT_BRANCH", None)
    if not branch:
        branch = os.environ.get("CI_COMMIT_REF_NAME", None)
    if not branch:
        branch = tankerci.git.get_current_branch(Path.cwd())
    if not branch:
        ui.fatal("Not on a branch, can't report size")
    ui.info(f"Running on branch {branch}")
    # branch is not Optional anymore
    return cast(str, branch)


def report_size(upload_results: bool) -> int:
    tankerci.reporting.assert_can_send_metrics()

    branch = get_branch_name()
    _, commit_id = tankerci.git.run_captured(Path.cwd(), "rev-parse", "HEAD")

    tankerci.run("yarn", "build:client-browser-umd")
    lib_path = Path("packages/client-browser/dist/umd/tanker-client-browser.min.js")
    size = lib_path.stat().st_size
    if upload_results:
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

    ui.info(f"Tanker library size: {size / 1024}KiB")
    return size


def benchmark(
    *,
    runner: str,
    upload_results: bool,
    iterations: Optional[int],
) -> Dict[str, Dict[str, float]]:
    tankerci.reporting.assert_can_send_metrics()

    branch = get_branch_name()
    _, commit_id = tankerci.git.run_captured(Path.cwd(), "rev-parse", "HEAD")

    karma_config_args = []
    if iterations:
        karma_config_args.append(f"--sampleCount={iterations}")

    if runner == "linux":
        # The first -- is for yarn, otherwise if there is a second --, yarn will swallow the --browsers argument
        # The second -- (in karma_config_args) is for karma. Hell's full, but there's always JS frameworks.
        tankerci.js.run_yarn(
            "benchmark", "--browsers", "ChromeInDocker", *karma_config_args
        )
    elif runner == "macos":
        tankerci.run("killall", "Safari", check=False)
        delete_safari_state()
        tankerci.js.run_yarn(
            "benchmark", "--browsers", "Safari", *karma_config_args
        )
    elif runner == "windows-edge":
        kill_windows_processes()
        tankerci.js.run_yarn(
            "benchmark", "--browsers", "EdgeHeadless", *karma_config_args
        )
    else:
        raise RuntimeError(f"unsupported runner {runner}")
    benchmark_output = Path("benchmarks.json")
    benchmark_results = json.loads(benchmark_output.read_text())

    hostname = os.environ.get("CI_RUNNER_DESCRIPTION", None)
    if not hostname:
        hostname = benchmark_results["context"]["host"]

    bench_result_array = benchmark_results["browsers"][0]["benchmarks"]
    benchmark_aggregates = {}
    for bench in bench_result_array:
        name = bench["name"].lower()
        benchmark_aggregates[name] = {
            "median": bench["real_time"],
            "stddev": bench["stddev"],
        }

    for browser in benchmark_results["browsers"]:
        # map the name to something more friendly
        if browser["name"].startswith("Chrome Headless"):
            browser_name = "chrome-headless"
        elif browser["name"].startswith("Safari"):
            browser_name = "safari"
        elif browser["name"].startswith("Edge"):
            browser_name = "edge"
        else:
            raise RuntimeError(f"unsupported browser {browser['name']}")

        if upload_results:
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
                    fields={
                        "real_time": benchmark["real_time"],
                        "stddev": benchmark["stddev"],
                        "commit_id": commit_id,
                        "browser_full_name": browser["name"],
                    },
                )
    return benchmark_aggregates


def fetch_lib_size_for_branch(branch: str) -> int:
    """Retrieves the size of the client-browser-umd build for a branch from InfluxDB"""
    response = tankerci.reporting.query_last_metrics(
        "benchmark",
        group_by="scenario",
        tags=["scenario"],
        fields=["value"],
        where={
            "branch": branch,
            "project": "sdk-js",
            "scenario": "size",
            "object": "client-browser-umd",
        },
    )
    result_series = response["results"][0]["series"][0]
    size_column_idx = result_series["columns"].index("value")
    size_data_point = result_series["values"][0][size_column_idx]
    return size_data_point


def compare_benchmark_results(
    runner: str,
    benchmark_aggregates: Dict[str, Dict[str, float]],
    current_size: Optional[int],
):
    if runner == "linux":
        browser = "chrome-headless"
        master_size = fetch_lib_size_for_branch("master")
    elif runner == "macos":
        browser = "safari"
        master_size = None
    elif runner == "windows-edge":
        browser = "edge"
        master_size = None
    else:
        ui.fatal("Manual benchmarks not supported on this runner")

    response = tankerci.reporting.query_last_metrics(
        "benchmark",
        group_by="scenario",
        tags=["scenario"],
        fields=["real_time", "stddev"],
        where={"branch": "master", "project": "sdk-js", "browser": browser},
    )
    master_results = {}
    for point in response["results"][0]["series"]:
        result = tankerci.benchmark.data_point_to_bench_result(point)
        if result["stddev"] is None:
            result["stddev"] = 0  # Old benchmarks did not have a stddev
        master_results[result["name"]] = result

    result_message = f"Benchmark for `{runner}`.\n\n"
    result_message += tankerci.benchmark.format_benchmark_table(
        benchmark_aggregates, master_results, master_size, current_size
    )

    tankerci.benchmark.post_gitlab_mr_message("sdk-js", result_message)


def _main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(title="subcommands", dest="command")
    subparsers.add_parser("lint")

    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--nightly", action="store_true")
    check_parser.add_argument("--runner", required=True)

    deploy_parser = subparsers.add_parser("deploy")
    deploy_parser.add_argument("--git-tag", required=True)

    e2e_parser = subparsers.add_parser("e2e")
    e2e_parser.add_argument("--use-local-sources", action="store_true", default=False)

    benchmark_parser = subparsers.add_parser("benchmark")
    benchmark_parser.add_argument("--runner", required=True)
    benchmark_parser.add_argument(
        "--compare-results", dest="compare_results", action="store_true"
    )
    benchmark_parser.add_argument(
        "--upload-results", dest="upload_results", action="store_true"
    )
    benchmark_parser.add_argument("--iterations", default=None, type=int)

    args = parser.parse_args()
    if args.command == "check":
        runner = args.runner
        nightly = args.nightly
        check(runner=runner, nightly=nightly)
    elif args.command == "lint":
        lint()
    elif args.command == "deploy":
        deploy_sdk(git_tag=args.git_tag)
    elif args.command == "e2e":
        e2e(use_local_sources=args.use_local_sources)
    elif args.command == "benchmark":
        tankerci.js.yarn_install()
        size = None
        if args.runner == "linux":
            # size is the same on all platforms, when uploading we can track it only on linux
            size = report_size(args.upload_results)
        bench_results = benchmark(
            runner=args.runner,
            upload_results=args.upload_results,
            iterations=args.iterations,
        )

        if args.compare_results:
            compare_benchmark_results(args.runner, bench_results, size)
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
