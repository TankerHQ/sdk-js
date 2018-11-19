import argparse
import sys

from path import Path

import ci.js
import ci.mail


def check(*, runner: str, nightly: bool) -> None:
    if nightly:
        with ci.notify_failure("sdk-test"):
            ci.js.check_sdk(cwd=Path.getcwd(), env="dev", runner=runner, nightly=True)
    else:
        ci.js.check_sdk(cwd=Path.getcwd(), env="dev", runner=runner, nightly=False)


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
