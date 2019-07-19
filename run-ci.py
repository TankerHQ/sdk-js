import argparse
import sys

import ci.js
import ci.endtoend
import ci.conan
import ci.cpp

from path import Path


def check(*, runner: str, env: str, nightly: bool) -> None:
    ci.js.yarn_install_deps()
    if runner == "linux":
        ci.js.run_linters()
        ci.js.run_tests_in_node(env=env)

    if nightly:
        ci.js.run_tests_in_browser_ten_times(env=env, runner=runner)
    else:
        ci.js.run_tests_in_browser(env=env, runner=runner)


def compat(*, env: str) -> None:
    ci.js.yarn_install_deps()
    ci.js.run_sdk_compat_tests(env=env)


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
        {"build": "crypto", "publish": ["@tanker/crypto"]},
        {"build": "errors", "publish": ["@tanker/errors"]},
        {"build": "identity", "publish": ["@tanker/identity"]},
        {"build": "file-ponyfill", "publish": ["@tanker/file-ponyfill"]},
        {"build": "file-reader", "publish": ["@tanker/file-reader"]},
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
        {"build": "fake-authentication", "publish": ["@tanker/fake-authentication"]},
        {"build": "verification-ui", "publish": ["@tanker/verification-ui"]},
        {"build": "filekit", "publish": ["@tanker/filekit"]},
    ]

    for config in configs:
        ci.js.yarn_build(delivery=config["build"], env=env)  # type: ignore
        for package_name in config["publish"]:
            ci.js.publish_npm_package(package_name, version)


def main() -> None:
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


if __name__ == "__main__":
    main()
