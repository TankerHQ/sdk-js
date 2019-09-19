// @flow
import React from 'react';
import ReactDOM from 'react-dom';
import type { Tanker, b64string, EmailVerification } from '@tanker/client-browser';

import Root from './components/Root';
import domReady from './domReady';

export class VerificationUI {
  _tanker: Tanker;
  _container: Element;
  _domReady: Promise<void>;

  constructor(tanker: Tanker) {
    this._domReady = domReady().then(this._initDom);
    this._tanker = tanker;
  }

  _initDom = () => {
    this._container = window.document.createElement('div');
    this._container.className = 'tanker-verification-ui';
    window.document.body.appendChild(this._container);
  }

  _mountAndWrap = (email: string, func: EmailVerification => Promise<void>): Promise<void> => (
    new Promise(resolve => {
      this._mount(
        email,
        verificationCode => func({ email, verificationCode }),
        resolve
      );
    })
  )

  _mount = async (email: string, check: string => Promise<void>, exit: () => void) => {
    await this._domReady;

    ReactDOM.render(<Root appId={this._tanker.appId} url={this._tanker.options.url || 'https://api.tanker.io'} email={email} check={check} exit={exit} />, this._container);
  }

  _unmount = () => {
    ReactDOM.unmountComponentAtNode(this._container);
  }

  start = async (email: string, identity: b64string, provisionalIdentity?: b64string) => {
    const { statuses } = this._tanker.constructor;
    const status = await this._tanker.start(identity);

    if (status === statuses.IDENTITY_REGISTRATION_NEEDED)
      await this._mountAndWrap(email, this._tanker.registerIdentity.bind(this._tanker));
    else if (status === statuses.IDENTITY_VERIFICATION_NEEDED)
      await this._mountAndWrap(email, this._tanker.verifyIdentity.bind(this._tanker));

    if (provisionalIdentity) {
      const { status: attachStatus } = await this._tanker.attachProvisionalIdentity(provisionalIdentity);
      if (attachStatus === statuses.IDENTITY_VERIFICATION_NEEDED)
        await this._mountAndWrap(email, this._tanker.verifyProvisionalIdentity.bind(this._tanker));
    }

    this._unmount();
  }
}

export default VerificationUI;
