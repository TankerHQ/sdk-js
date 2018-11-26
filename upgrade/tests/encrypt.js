// @flow

const fs = require('fs');

const { makeAlice, makeBob, runner, assertMessage } = require('./helpers');

const dataFile = 'data/encrypt.json';
const message = 'yoyoyoyoyo';
const bob = makeBob();
const alice = makeAlice();

async function oldMain() {
  await bob.create();
  await bob.close();

  await alice.create();
  const encryptedData = await alice.encrypt(message, [bob.id], []);
  const jsonData = JSON.stringify({
    data: encryptedData,
  }, null, 2);
  await alice.close();

  fs.writeFileSync(dataFile, jsonData);
}

async function currentMain() {
  const dataText = fs.readFileSync(dataFile, 'utf8');
  const data = JSON.parse(dataText);

  await bob.open();
  let decryptedData = await bob.decrypt(data.data);
  await bob.close();
  assertMessage(message, decryptedData);
  await alice.open();
  decryptedData = await alice.decrypt(data.data);
  await alice.close();
  assertMessage(message, decryptedData);
}

runner(oldMain, currentMain);
