// @flow
import Tanker from '@tanker/client-browser';
import VerificationUI from '@tanker/verification-ui';
import saveToFile from 'file-saver';

export default class FileKit {
  tanker: Tanker;
  verificationUI: VerificationUI;

  constructor(config: Object) {
    this.tanker = new Tanker(config);
    this.verificationUI = new VerificationUI(this.tanker);
  }

  async start(email: string, privateIdentity: string, privateProvisionalIdentity: string) {
    return this.verificationUI.start(email, privateIdentity, privateProvisionalIdentity);
  }

  async startDisposableSession(privateIdentity: string) {
    return this.tanker.startDisposableSession(privateIdentity);
  }

  async stop() {
    return this.tanker.stop();
  }

  async upload(...args: any) {
    return this.tanker.upload(...args);
  }

  async download(...args: any) {
    const file = await this.tanker.download(...args);
    saveToFile(file);
  }
}
