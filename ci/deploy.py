import argparse

import path
import re
import tbump.config

import ci
import utils


def get_package_path(package_name):
    m = re.match(r"^@tanker/(datastore-)?(.*)$", package_name)
    p = path.Path("packages")
    if m[1]:
      p = p.joinpath("datastore")
    return p.joinpath(m[2]).joinpath("dist")


def version_to_npm_tag(version):
    for tag in ["alpha", "beta"]:
        if tag in version:
            return tag

    return "latest"


def version_from_git_tag(git_tag):
    prefix = "v"
    assert git_tag.startswith(prefix), "tag should start with %s" % prefix
    tbump_cfg = tbump.config.parse(path.Path("tbump.toml"))
    regex = tbump_cfg.version_regex
    version = git_tag[len(prefix):]
    match = regex.match(version)
    assert match, "Could not parse %s as a valid tag" % git_tag
    return version


def publish_npm_package(package_name, version):
    package_path = get_package_path(package_name)
    npm_tag = version_to_npm_tag(version)
    ci.run("npm", "publish", "--access", "public", "--tag", npm_tag, cwd=package_path)


def deploy_sdk(env, git_tag):
    version = version_from_git_tag(git_tag)

    # Publish packages in order so that dependencies don't break during deploy
    configs = [
      { "build": "crypto", "publish": ["@tanker/crypto"] },
      {
        "build": "datastores",
        "publish": [
          "@tanker/datastore-base",
          "@tanker/datastore-dexie-browser",
          "@tanker/datastore-pouchdb-base",
          "@tanker/datastore-pouchdb-memory",
          "@tanker/datastore-pouchdb-node"
        ]
      },
      { "build": "core", "publish": ["@tanker/core"] },
      { "build": "client-browser", "publish": ["@tanker/client-browser"] },
      { "build": "client-node", "publish": ["@tanker/client-node"] }
    ]

    for config in configs:
        ci.yarn_build(config["build"], env)
        for package_name in config["publish"]:
          publish_npm_package(package_name, version)


def main():
    utils.print_cmd()
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", required=True)
    version_group = parser.add_mutually_exclusive_group(required=True)
    version_group.add_argument("--git-tag")
    args = parser.parse_args()
    git_tag = args.git_tag
    env = args.env
    ci.install_deps()
    deploy_sdk(env, git_tag)


if __name__ == "__main__":
    main()
