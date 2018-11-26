// @flow

const { makeBob, makeBobPhone, runner } = require('./helpers');

const bob = makeBob();

async function oldMain() {
  await bob.create();
  await bob.close();
}

async function currentMain() {
  const bobPhone = makeBobPhone();
  await bobPhone.open();
  await bobPhone.close();
}

runner(oldMain, currentMain);
