import argparse
import sys

from path import Path

import ci.js
import ci.mail


def check(*, runner: str, nightly: bool) -> None:
    env = "dev"
    ci.js.yarn_install_deps()
    if runner == "linux":
        ci.js.run_linters(cwd=Path.getcwd())
        ci.js.run_tests_in_node(cwd=Path.getcwd(), env=env)

    ci.js.run_tests_in_browser(cwd=Path.getcwd(), env=env, runner=runner)

    if "windows" in runner:
        return

    if nightly:
        with ci.mail.notify_failure("sdk-js"):
            ci.js.run_sdk_functional_tests(env=env, runner=runner, ten_times=True)
    else:
        ci.js.run_sdk_functional_tests(env=env, runner=runner, ten_times=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(title="subcommands", dest="command")

    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--nightly", action="store_true")
    check_parser.add_argument("--runner", required=True)

    deploy_parser = subparsers.add_parser("deploy")
    deploy_parser.add_argument("--git-tag", required=True)
    deploy_parser.add_argument("--env", required=True)

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
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
