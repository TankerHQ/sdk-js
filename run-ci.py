import argparse
import sys

from path import Path

import ci.js
import ci.mail
import ci.endtoend


def check(*, runner: str, nightly: bool) -> None:
    env = "dev"
    ci.js.yarn_install_deps()
    if runner == "linux":
        ci.js.run_linters()
        ci.js.run_tests_in_node(env=env)

    if nightly:
        with ci.mail.notify_failure("sdk-js"):
            ci.js.run_tests_in_browser_ten_times(env=env, runner=runner)
    else:
        ci.js.run_tests_in_browser(env=env, runner=runner)


def compat(*, env: str) -> None:
    ci.js.yarn_install_deps()
    with ci.mail.notify_failure("compat tests"):
        ci.js.run_sdk_compat_tests(env=env)


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(title="subcommands", dest="command")

    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--nightly", action="store_true")
    check_parser.add_argument("--runner", required=True)

    deploy_parser = subparsers.add_parser("deploy")
    deploy_parser.add_argument("--git-tag", required=True)
    deploy_parser.add_argument("--env", required=True)

    subparsers.add_parser("compat")
    subparsers.add_parser("e2e")
    subparsers.add_parser("mirror")

    args = parser.parse_args()
    if args.command == "check":
        runner = args.runner
        nightly = args.nightly
        check(runner=runner, nightly=nightly)
    elif args.command == "deploy":
        env = args.env
        git_tag = args.git_tag
        ci.js.deploy_sdk(env=env, git_tag=git_tag)
    elif args.command == "mirror":
        ci.git.mirror(github_url="git@github.com:TankerHQ/sdk-js")
    elif args.command == "compat":
        compat(env="dev")
    elif args.command == "e2e":
        ci.endtoend.test(env="dev")
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
