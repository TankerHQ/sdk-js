import argparse
import sys

from path import Path

import ci.js
import ci.mail


def check(*, runner: str, nightly: bool, upgrade: bool) -> None:
    env = "dev"
    ci.js.yarn_install_deps()
    if runner == "linux":
        ci.js.run_linters()
        ci.js.run_tests_in_node(env=env)

    if nightly or upgrade:
        if nightly:
            with ci.mail.notify_failure("sdk-js"):
                ci.js.run_tests_in_browser_ten_times(env=env, runner=runner)
        if runner == "linux":
            with ci.mail.notify_failure("upgrade tests"):
                ci.js.run_sdk_upgrade_tests(env=env)
    else:
        ci.js.run_tests_in_browser(env=env, runner=runner)


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(title="subcommands", dest="command")

    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--nightly", action="store_true")
    check_parser.add_argument("--runner", required=True)
    check_parser.add_argument("--upgrade", action="store_true")

    deploy_parser = subparsers.add_parser("deploy")
    deploy_parser.add_argument("--git-tag", required=True)
    deploy_parser.add_argument("--env", required=True)

    subparsers.add_parser("mirror")

    args = parser.parse_args()
    if args.command == "check":
        runner = args.runner
        nightly = args.nightly
        upgrade = args.upgrade
        check(runner=runner, nightly=nightly, upgrade=upgrade)
    elif args.command == "deploy":
        env = args.env
        git_tag = args.git_tag
        ci.js.deploy_sdk(env=env, git_tag=git_tag)
    elif args.command == "mirror":
        ci.git.mirror(github_url="git@github.com:TankerHQ/sdk-js")
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
