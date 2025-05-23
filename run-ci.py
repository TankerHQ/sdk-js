import argparse
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Callable, List, TypedDict

import cli_ui as ui
import psutil
import tankerci
import tankerci.git
import tankerci.js


class TestFailed(Exception):
    pass


class Config(TypedDict):
    build: str
    publish: List[str]


# Publish packages in order so that dependencies don't break during deploy
configs: List[Config] = [
    {"build": "global-this", "publish": ["@tanker/global-this"]},
    {"build": "errors", "publish": ["@tanker/errors"]},
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
    {"build": "crypto", "publish": ["@tanker/crypto"]},
    {
        "build": "datastores",
        "publish": [
            "@tanker/datastore-base",
            "@tanker/datastore-dexie-base",
            "@tanker/datastore-dexie-browser",
            "@tanker/datastore-dexie-memory",
            "@tanker/datastore-pouchdb-base",
            "@tanker/datastore-pouchdb-memory",
            "@tanker/datastore-pouchdb-node",
        ],
    },
    {"build": "core", "publish": ["@tanker/core"]},
    {
        "build": "client-browser",
        "publish": ["@tanker/client-browser"],
    },
    {"build": "client-node", "publish": ["@tanker/client-node"]},
]


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


def run_tests_in_browser(*, runner: str) -> None:
    if runner == "linux":
        tankerci.js.npm("run", "karma", "--", "--browsers", "ChromeInDocker")
    elif runner == "macos":
        tankerci.js.npm("run", "karma", "--", "--browsers", "Safari")
    elif runner == "windows-edge":
        kill_windows_processes()
        tankerci.js.npm("run", "karma", "--", "--browsers", "EdgeHeadless")


def get_package_path(package_name: str) -> Path:
    m = re.match(r"^@tanker/(?:(datastore|stream)-)?(.*)$", package_name)
    p = Path("packages")
    assert m
    if m[1]:
        p = p.joinpath(m[1])
    p = p.joinpath(m[2])
    return p


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


def run_tests_in_node() -> None:
    tankerci.js.npx("node", "--version")
    tankerci.js.npm("run", "build")
    tankerci.js.npm("run", "coverage")


def lint() -> None:
    tankerci.js.npm("install")
    tankerci.js.npm("run", "build")
    tankerci.js.npm("run", "lint:js")
    tankerci.js.npm("run", "lint:ts")
    tankerci.js.npm("run", "lint:compat:all")


def check(*, runner: str) -> None:
    tankerci.js.npm("install")
    if runner == "node":
        run_tests_in_node()
    else:
        run_tests_in_browser(runner=runner)


def test_matcher() -> None:
    tankerci.js.npm("install")
    tankerci.js.npm(
        "run",
        "test-matcher:export-test-names",
        "--",
        "--reporter-options",
        "'outputFile=functional_test_list.json'",
    )


def e2e(*, use_local_sources: bool) -> None:
    if use_local_sources:
        base_path = Path.cwd().parent
    else:
        base_path = tankerci.git.prepare_sources(
            repos=["sdk-python", "sdk-js", "qa-python-js"]
        )
    with tankerci.working_directory(base_path / "sdk-python"):
        tankerci.run("poetry", "install", "--no-root")
        tankerci.run(
            "poetry",
            "run",
            "python",
            "run-ci.py",
            "--isolate-conan-user-home",
            "prepare",
            "--use-tanker=same-as-branch",
            "--profile=linux-x86_64",
        )
        tankerci.run("poetry", "run", "python", "run-ci.py", "build")
    with tankerci.working_directory(base_path / "sdk-js"):
        tankerci.js.npm("install")
        tankerci.js.npm("run", "build")
    with tankerci.working_directory(base_path / "qa-python-js"):
        tankerci.run("poetry", "install")
        tankerci.run("poetry", "run", "pytest", "--verbose", "--capture=no")


def deploy_sdk(*, version: str) -> None:
    tankerci.js.npm("install")
    tankerci.bump.bump_files(version)

    for config in configs:
        tankerci.js.npm_build(delivery=config["build"])
        for package_name in config["publish"]:
            publish_npm_package(package_name, version)


def test_deploy(*, version: str) -> None:
    test_dir = Path("test")
    index_file = test_dir / "index.js"
    test_dir.mkdir()
    tankerci.js.npm("init", "--yes", cwd=test_dir)
    tankerci.js.npm("add", f"@tanker/client-browser@{version}", cwd=test_dir)
    index_file.write_text('require("@tanker/client-browser");')
    tankerci.run("node", "index.js", cwd=test_dir)


def _main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(title="subcommands", dest="command")
    subparsers.add_parser("lint")

    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--runner", required=True)

    deploy_parser = subparsers.add_parser("deploy")
    deploy_parser.add_argument("--version", required=True)

    e2e_parser = subparsers.add_parser("e2e")
    e2e_parser.add_argument("--use-local-sources", action="store_true", default=False)

    subparsers.add_parser("test-matcher")

    test_deploy_parser = subparsers.add_parser("test-deploy")
    test_deploy_parser.add_argument("--version", required=True)

    write_bridge_dotenv = subparsers.add_parser("write-bridge-dotenv")
    write_bridge_dotenv.add_argument(
        "--downstream", dest="downstreams", action="append", required=True
    )

    args = parser.parse_args()
    if args.command == "check":
        check(runner=args.runner)
    elif args.command == "test-matcher":
        test_matcher()
    elif args.command == "lint":
        lint()
    elif args.command == "deploy":
        deploy_sdk(version=args.version)
    elif args.command == "e2e":
        e2e(use_local_sources=args.use_local_sources)
    elif args.command == "test-deploy":
        test_deploy(version=args.version)
    elif args.command == "write-bridge-dotenv":
        branches = [
            tankerci.git.matching_branch_or_default(repo) for repo in args.downstreams
        ]
        keys = [
            repo.replace("-", "_").upper() + "_BRIDGE_BRANCH"
            for repo in args.downstreams
        ]
        env_list = "\n".join([f"{k}={v}" for k, v in zip(keys, branches)])
        with open("bridge.env", "a+") as f:
            f.write(env_list)
        ui.info(env_list)
    else:
        parser.print_help()
        sys.exit(1)


def main() -> None:
    # hide backtrace when tests fail
    try:
        _main()
    except TestFailed:
        sys.exit(1)
    except Exception:
        raise


if __name__ == "__main__":
    main()
