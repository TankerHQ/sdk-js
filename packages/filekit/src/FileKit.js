// @flow
import Tanker from '@tanker/client-browser';
import Storage from '@tanker/storage';
import VerificationUI from '@tanker/verification-ui';
import saveToFile from 'file-saver';

export default class FileKit {
  constructor(config) {
    this.tanker = new Tanker(config);
    this.storage = new Storage(this.tanker);
    this.verificationUI = new VerificationUI(this.tanker);
  }

  async start(email, privateIdentity, privateProvisionalIdentity) {
    return this.verificationUI.start(email, privateIdentity, privateProvisionalIdentity);
  }

  async startWithVerificationKey(privateIdentity, verificationKey, privateProvisionalIdentity) {
    const status = await this.tanker.start(privateIdentity);
    switch (status) {
      case Tanker.statuses.IDENTITY_REGISTRATION_NEEDED: {
        const genVerificationKey = await this.tanker.generateVerificationKey();
        await this.tanker.registerIdentity({ verificationKey: genVerificationKey });
        if (privateProvisionalIdentity)
          await this.tanker.attachProvisionalIdentity(privateProvisionalIdentity);
        return genVerificationKey;
      }
      case Tanker.statuses.IDENTITY_VERIFICATION_NEEDED: {
        if (!verificationKey)
          throw new Error('Please provide a verificationKey');
        await this.tanker.verifyIdentity({ verificationKey });
        return null;
      }
      default:
        return null;
    }
  }

  async stop() {
    return this.tanker.stop();
  }

  async upload(...args) {
    return this.storage.upload(...args);
  }

  async download(...args) {
    const file = await this.storage.download(...args);
    saveToFile(file);
  }
}
