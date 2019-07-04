// @flow
import { Tanker } from '@tanker/client-browser';
import { createIdentity } from '@tanker/identity';
import uuid from 'uuid';
import VerificationUI from '../src';

const trustchainId = 'BEaAMNLrAutnx89ShJRww5TsJjSMq1tZzZi4fmk+l+w=';
const trustchainPrivateKey = 'L8AiBl10yWTvvpJ41UMixXFh23tCjfuMoZRnyV9xnVObRD3UEwKwIka3RObTWwq2qw1kpRzhA1oGIxL929RZSA==';
const url = 'https://staging-api.tanker.io';
const userId = uuid.v4();
createIdentity(trustchainId, trustchainPrivateKey, userId).then(async identity => {
  // await createProvisionalIdentity();
  const tanker = new Tanker({ trustchainId, url });
  const verificationUI = new VerificationUI(tanker);
  await verificationUI.start('quentin.vernot@tanker.io', identity);
});
