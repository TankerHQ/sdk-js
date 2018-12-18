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
        "psutil",
        "tbump >= 5.0",
        "unidecode",
        "websockets==6.0",
    ],
    extras_require={
        "dev": [
            "tankersdk>=1.9.1",
            "pytest",
            "ruamel.yaml",
            ]
    },
)
