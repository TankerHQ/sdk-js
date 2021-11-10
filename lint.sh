#!/bin/sh

set -xe

poetry run black --check . --diff
poetry run flake8 run-ci.py
poetry run mypy --no-incremental .
poetry run python run-ci.py lint
