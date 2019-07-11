// @flow
import Tanker from '@tanker/client-browser';
import VerificationUI from '@tanker/verification-ui';
import saveToFile from 'file-saver';

export default class FileKit {
  constructor(config) {
    this.tanker = new Tanker(config);
    this.verificationUI = new VerificationUI(this.tanker);
  }

  async start(email, privateIdentity, privateProvisionalIdentity) {
    return this.verificationUI.start(email, privateIdentity, privateProvisionalIdentity);
  }

  async startDisposableSession(privateIdentity) {
    return this.tanker.startDisposableSession(privateIdentity);
  }

  async stop() {
    return this.tanker.stop();
  }

  async upload(...args) {
    return this.tanker.upload(...args);
  }

  async download(...args) {
    const file = await this.tanker.download(...args);
    saveToFile(file);
  }
}
