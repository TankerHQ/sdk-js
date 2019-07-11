import argparse
import sys

import ci.js
import ci.endtoend
import ci.conan
import ci.cpp

from path import Path


def check(*, runner: str, env: str, nightly: bool) -> None:
    ci.js.yarn_install_deps()
    return
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
        ci.js.deploy_sdk(env=args.env, git_tag=git_tag)
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
