// @flow
import { Tanker, errors } from '@tanker/client-browser';
import VerificationUI from '@tanker/verification-ui';
import saveToDisk from 'file-saver';

export default class FileKit {
  tanker: Tanker;
  verificationUI: VerificationUI;

  constructor(config: Object) {
    const { appId: trustchainId, ...otherConfig } = config;

    if (typeof trustchainId !== 'string')
      throw new errors.InvalidArgument('Invalid appId option');

    this.tanker = new Tanker({ ...otherConfig, trustchainId });
    this.verificationUI = new VerificationUI(this.tanker);
  }

  async start(email: string, privateIdentity: { permanentIdentity: string, provisionalIdentity?: string }) {
    const { permanentIdentity, provisionalIdentity } = privateIdentity;
    return this.verificationUI.start(email, permanentIdentity, provisionalIdentity);
  }

  /* one time only session, we register a verificationKey that we discard */
  async startDisposableSession(privateIdentity: { permanentIdentity: string }) {
    const { permanentIdentity } = privateIdentity;
    const status = await this.tanker.start(permanentIdentity);

    switch (status) {
      case Tanker.statuses.IDENTITY_REGISTRATION_NEEDED: {
        const genVerificationKey = await this.tanker.generateVerificationKey();
        await this.tanker.registerIdentity({ verificationKey: genVerificationKey });
        return;
      }
      case Tanker.statuses.IDENTITY_VERIFICATION_NEEDED: {
        throw new errors.InvalidArgument('This identity has already been used, create a new one.');
      }
      default:
        throw new errors.InternalError(`Assertion error: unexpected status ${status}`);
    }
  }

  async stop() {
    return this.tanker.stop();
  }

  async upload(...args: any) {
    return this.tanker.upload(...args);
  }

  async download(...args: any) {
    return this.tanker.download(...args);
  }

  async share(...args: any) {
    return this.tanker.share(...args);
  }

  async downloadToDisk(...args: any) {
    const file = await this.download(...args);
    saveToDisk(file);
  }
}
