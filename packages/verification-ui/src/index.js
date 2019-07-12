// @flow
import React from 'react';
import ReactDOM from 'react-dom';
import { Tanker, type b64string, type EmailVerification } from '@tanker/client-browser';
import 'isomorphic-fetch';

import Root from './components/Root';

class VerificationUI {
  _tanker: Tanker;
  _container: Element;

  constructor(tanker: Tanker) {
    this._container = global.document.createElement('div');
    this._container.className = 'tanker-verification-ui';
    global.document.body.appendChild(this._container);

    this._tanker = tanker;
  }

  _mountAndWrap = (email: string, func: EmailVerification => Promise<void>): Promise<void> => (
    new Promise(resolve => {
      this._mount(
        email,
        async verificationCode => func({ email, verificationCode }),
        resolve
      );
    })
  )

  _mount = (email: string, check: Function, exit: Function) => {
    ReactDOM.render(<Root appId={this._tanker.trustchainId} email={email} check={check} exit={exit} />, this._container);
  }

  _unmount = () => {
    ReactDOM.unmountComponentAtNode(this._container);
  }

  start = async (email: string, identity: b64string, provisionalIdentity?: b64string) => {
    const status = await this._tanker.start(identity);
    if (status === Tanker.statuses.IDENTITY_REGISTRATION_NEEDED)
      await this._mountAndWrap(email, this._tanker.registerIdentity.bind(this._tanker));
    else if (status === Tanker.statuses.IDENTITY_VERIFICATION_NEEDED)
      await this._mountAndWrap(email, this._tanker.verifyIdentity.bind(this._tanker));

    if (provisionalIdentity) {
      const attachStatus = await this._tanker.attachProvisionalIdentity(provisionalIdentity);
      if (attachStatus === Tanker.statuses.IDENTITY_VERIFICATION_NEEDED)
        await this._mountAndWrap(email, this._tanker.verifyProvisionalIdentity.bind(this._tanker));
    }

    this._unmount();
  }

  stop = async () => this._tanker.stop();
}

export default VerificationUI;
