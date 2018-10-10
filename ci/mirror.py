import argparse
import ci


def mirror(ref):
    """ Mirror the given ref to GitHub """

    github_url = "git@github.com:supertanker/sdk-js"
    ci.run("git", "fetch", "--force", "origin", "%s:%s" % (ref,ref))
    ci.run("git", "push", github_url, "%s:%s" % (ref,ref))



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ref", required=True)
    args = parser.parse_args()
    mirror(args.ref)


if __name__ == "__main__":
    main()
