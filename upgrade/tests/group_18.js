// @flow

const fs = require('fs');

const { makeAlice, makeBob, runner, assertMessage } = require('./helpers');

const dataFile = 'data/group.json';
const message = 'yoyoyoyoyo';
const bob = makeBob();
const alice = makeAlice();

async function oldMain() {
  await bob.create18();
  await bob.close();

  await alice.create18();
  const groupId = await alice.createGroup([bob.id, alice.id]);
  const encryptedData = await alice.encrypt18(message, [groupId]);
  const jsonData = JSON.stringify({
    data: encryptedData,
    groupId,
  }, null, 2);
  await alice.close();
  fs.writeFileSync(dataFile, jsonData);
}

async function currentMain() {
  const dataText = fs.readFileSync(dataFile, 'utf8');
  const data = JSON.parse(dataText);
  const message2 = 'message number 2';

  await bob.open();
  let decryptedData = await bob.decrypt(data.data);
  await bob.close();
  assertMessage(message, decryptedData);

  await alice.open();
  decryptedData = await alice.decrypt(data.data);
  const encryptedData = await alice.encrypt(message2, [], [data.groupId]);
  await alice.close();
  assertMessage(message, decryptedData);

  await bob.open();
  decryptedData = await bob.decrypt(encryptedData);
  await bob.close();
  assertMessage(message2, decryptedData);
}

runner(oldMain, currentMain);
