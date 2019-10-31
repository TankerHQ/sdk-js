import sys
from setuptools import setup, find_packages

if sys.version_info.major < 3:
    sys.exit("Error: Please upgrade to Python3")


setup(
    name="sdk-js",
    version="0.1.0",
    author="Tanker Team",
    packages=find_packages(),
    install_requires=[
        "ci",
    ],
    extras_require={
        "dev": [
            "flake8",
            "mypy",
        ],
    },
)
