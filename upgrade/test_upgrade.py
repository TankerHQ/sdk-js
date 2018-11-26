import os

from path import Path
import pytest
from ruamel.yaml import YAML

import ci.js


def get_curreny_dir():
    return Path(__file__).abspath().parent


def get_test_dir():
    return get_curreny_dir() / "tests"


def get_versions():
    parameters = []
    yaml = YAML(typ='safe')
    conf_file = get_curreny_dir() / "versions.yml"
    tests_versions = yaml.load(conf_file.text())
    for tests_version in tests_versions:
        version = tests_version["version"]
        tests = tests_version["tests"]
        parameters.append((version, tests))
    return parameters


@pytest.mark.parametrize("version,tests", get_versions())
def test_version(version, tests, trustchain_context):
    test_folder = get_test_dir()
    ci.js.yarn_from_template(working_dir=test_folder, version=version)
    env = os.environ.copy()
    env["TRUSTCHAIN_CONTEXT"] = trustchain_context
    for test in tests:
        env["OLD_SDK"] = "1"
        ci.js.run_yarn("run", "babel-node", "--require", "babel.conf.js", test, cwd=test_folder, env=env)
    for test in tests:
        env["OLD_SDK"] = "0"
        ci.js.run_yarn("run", "babel-node", "--require", "babel.conf.js", test, cwd=test_folder, env=env)
