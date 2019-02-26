import json
import os

import pytest

from tankersdk.core import Admin, Tanker


def get_url():
    return os.environ["TANKER_URL"]


def get_token():
    return os.environ["TANKER_TOKEN"]


@pytest.fixture()
def trustchain_context():
    url = get_url()
    admin = Admin(url=url, token=get_token())
    name = "upgrade_tests"
    trustchain = admin.create_trustchain(name)
    tanker = Tanker(trustchain.id, trustchain_url=url, writable_path="")
    bob_id = "bob"
    bob_token = tanker.generate_user_token(trustchain.private_key, bob_id)
    alice_id = "alice"
    alice_token = tanker.generate_user_token(trustchain.private_key, alice_id)
    context = {
        "trustchain_id": trustchain.id,
        "trustchain_url": url,
        "bob_id": bob_id,
        "bob_token": bob_token,
        "alice_id": alice_id,
        "alice_token": alice_token,
    }
    yield json.dumps(context)
    admin.delete_trustchain(trustchain.id)
