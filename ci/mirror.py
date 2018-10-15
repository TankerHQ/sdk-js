import os

import ci


def main():
    tag = os.environ.get("CI_COMMIT_TAG")
    ref = os.environ["CI_COMMIT_REF_NAME"]

    if tag:
        ci.run("git", "fetch", "--tags", "origin")
    else:
        ci.run("git", "fetch", "--force", "origin", "%s:%s" % (ref,ref))

    github_url = "git@github.com:supertanker/sdk-js"
    ci.run("git", "push", github_url, "%s:%s" % (ref,ref))


if __name__ == "__main__":
    main()
