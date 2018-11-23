import json
import os

import pytest

import ci.js
from tankersdk.core import Admin, Tanker


def get_url():
    return os.environ["TANKER_URL"]

def get_token():
    return os.environ["TANKER_TOKEN"]


class User:
    def __init__(self, *, tanker, tanker_id):
        self.tanker_id = tanker_id
        self.token = tanker.generate_user_token(tanker_id)


@pytest.fixture()
def trustchain_context():
    url = get_url()
    admin = Admin(
        url=url,
        token=get_token(),
        )
    name = "upgrade_tests"
    admin.create_trustchain(name)
    tanker = Tanker(
        trustchain_url=url,
        trustchain_id=admin.trustchain_id,
        trustchain_private_key=admin.trustchain_private_key,
        writable_path="",
        )
    bob = User(tanker=tanker, tanker_id="bob")
    alice = User(tanker=tanker, tanker_id="alice")
    context = {
        "trustchain_id": admin.trustchain_id,
        "trustchain_url": url,
        "bob_id": bob.tanker_id,
        "bob_token": bob.token,
        "alice_id": alice.tanker_id,
        "alice_token": alice.token,
        }
    yield json.dumps(context)
    admin.delete_trustchain()
