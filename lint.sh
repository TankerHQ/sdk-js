#!/bin/sh

set -xe

poetry run black --check --diff run-ci.py
poetry run flake8 run-ci.py
poetry run isort --check --diff --profile black run-ci.py
poetry run mypy run-ci.py

poetry run python run-ci.py lint
