// @flow
import React from 'react';
import { shallow } from 'enzyme';
import { expect, sinon } from '@tanker/test-utils';

import makeContextHolder from '../../context/makeContextHolder';
import VerifyDevice from '../VerifyDevice';

const shallowNoMount = elt => shallow(elt, { disableLifecycleMethods: true });
const contextHolder = makeContextHolder();

const appId = '/+A=';
const b64UrlUnpaddedAppId = '_-A';

const defaultProps = {
  fetch: (uri: string, options: { method: string, body: string }) => {}, // eslint-disable-line no-unused-vars
  appId,
  email: 'a@a.aa',
  url: 'https://thisisatest.test',
  check: () => new Promise(resolve => resolve()),
  context: { state: contextHolder.state, actions: contextHolder.actions },
};

const makeFakeFetch = (status: number, body: Object) => {
  let callCount = 0;
  let callArgs;

  const fakeFetch = (uri: string, options: { method: string, body: string }): Object => {
    callCount += 1;
    callArgs = { uri, options };
    return { status, json: () => body };
  };

  fakeFetch.assert = () => {
    expect(callCount).to.equal(1);
    expect(callArgs.uri).to.equal(`${defaultProps.url}/v2/apps/${b64UrlUnpaddedAppId}/verification/default-email`);
    expect(callArgs.options.method).to.equal('POST');
    expect(callArgs.options.body).to.equal(JSON.stringify({ to_email: defaultProps.email }));
  };

  return fakeFetch;
};

describe('<VerifyDevice />', () => {
  let stub;
  before(() => { stub = sinon.stub(console, 'error'); });
  after(() => stub.restore());

  beforeEach(() => contextHolder.actions.reset());

  it('renders', () => {
    expect(shallowNoMount(<VerifyDevice {...defaultProps} />)).to.have.length(1);
  });

  it('puts the email prop in the header', () => {
    const email = 'email';
    const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} email={email} />);
    expect(wrapper.childAt(0).text()).to.include(email);
  });

  context('updating the verification field', () => {
    it('puts the verificationCode prop in the field', () => {
      const verificationCode = 'verificationCode';
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} context={{ ...defaultProps.context, state: { ...defaultProps.context.state, verificationCode } }} />);
      expect(wrapper.childAt(1).props().value).to.equal(verificationCode);
    });

    it('updates the verificationCode when the field changes', async () => {
      const setVerificationCode = sinon.spy();
      const nextCode = 'next';
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} context={{ ...defaultProps.context, actions: { ...defaultProps.context.actions, setVerificationCode } }} />);
      await wrapper.childAt(1).props().onChange(nextCode);
      expect(setVerificationCode.calledOnceWith(nextCode)).to.be.true;
    });

    it('starts the verification when the code is more than 8 characters long', async () => {
      const verifyStart = sinon.spy();
      const nextCode = 'nextCode';
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} context={{ ...defaultProps.context, actions: { ...defaultProps.context.actions, verifyStart } }} />);
      await wrapper.childAt(1).props().onChange(nextCode);
      expect(verifyStart.calledOnce).to.be.true;
    });

    it('doesn\'t start the verification if one is already in progress', async () => {
      const verifyStart = sinon.spy();
      const nextCode = 'nextCode';
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} context={{ state: { ...defaultProps.context.state, verifyIsFetching: true }, actions: { ...defaultProps.context.actions, verifyStart } }} />);
      await wrapper.childAt(1).props().onChange(nextCode);
      expect(verifyStart.calledOnce).to.be.false;
    });

    it('uses the verificationCode when the code is more than 8 characters long', async () => {
      const check = sinon.spy();
      const nextCode = 'nextCode';
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} check={check} />);
      await wrapper.childAt(1).props().onChange(nextCode);
      expect(check.calledOnceWith(nextCode)).to.be.true;
    });

    it('calls the success callback when verification succeeds', async () => {
      const verifySuccess = sinon.spy();
      const verifyError = sinon.spy();
      const nextCode = 'nextCode';
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} context={{ ...defaultProps.context, actions: { ...defaultProps.context.actions, verifySuccess, verifyError } }} />);
      await wrapper.childAt(1).props().onChange(nextCode);
      expect(verifySuccess.calledOnce).to.be.true;
      expect(verifyError.calledOnce).to.be.false;
    });

    it('calls the error callback when verification fails', async () => {
      const error = new Error('error');
      const check = () => { throw error; };
      const verifySuccess = sinon.spy();
      const verifyError = sinon.spy();
      const nextCode = 'nextCode';
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} check={check} context={{ ...defaultProps.context, actions: { ...defaultProps.context.actions, verifySuccess, verifyError } }} />);
      await wrapper.childAt(1).props().onChange(nextCode);
      expect(verifySuccess.calledOnce).to.be.false;
      expect(verifyError.calledOnceWith(error)).to.be.true;
    });
  });

  context('(re)sending the verification email', () => {
    afterEach(() => { defaultProps.fetch.assert(); });

    it('sends a verification email when mounting', async () => {
      defaultProps.fetch = makeFakeFetch(200, {});
      const sendStart = sinon.spy();
      shallow(<VerifyDevice {...defaultProps} context={{ ...defaultProps.context, actions: { ...defaultProps.context.actions, sendStart } }} />);
      expect(sendStart.calledOnce).to.be.true;
    });

    it('sends a verification email when clickng the resend button', async () => {
      defaultProps.fetch = makeFakeFetch(200, {});
      const sendStart = sinon.spy();
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} context={{ ...defaultProps.context, actions: { ...defaultProps.context.actions, sendStart } }} />);
      await wrapper.childAt(2).props().onClick();
      expect(sendStart.calledOnce).to.be.true;
    });

    it('calls the success callback when sending the verification email succeeds', async () => {
      defaultProps.fetch = makeFakeFetch(200, {});
      const sendSuccess = sinon.spy();
      const sendError = sinon.spy();
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} context={{ ...defaultProps.context, actions: { ...defaultProps.context.actions, sendSuccess, sendError } }} />);
      await wrapper.childAt(2).props().onClick();
      expect(sendSuccess.calledOnce).to.be.true;
      expect(sendError.calledOnce).to.be.false;
    });

    it('calls the error callback when sending the verification email fails with a standard error', async () => {
      const code = 'code';
      defaultProps.fetch = makeFakeFetch(500, { code });
      const sendSuccess = sinon.spy();
      const sendError = sinon.spy();
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} context={{ ...defaultProps.context, actions: { ...defaultProps.context.actions, sendSuccess, sendError } }} />);
      await wrapper.childAt(2).props().onClick();
      expect(sendSuccess.calledOnce).to.be.false;
      expect(sendError.calledWithMatch(error => error.message === code)).to.be.true;
    });

    it('calls the error callback when sending the verification email fails with a non-standard error', async () => {
      defaultProps.fetch = makeFakeFetch(500, {});
      const sendSuccess = sinon.spy();
      const sendError = sinon.spy();
      const wrapper = shallowNoMount(<VerifyDevice {...defaultProps} context={{ ...defaultProps.context, actions: { ...defaultProps.context.actions, sendSuccess, sendError } }} />);
      await wrapper.childAt(2).props().onClick();
      expect(sendSuccess.calledOnce).to.be.false;
      expect(sendError.calledOnce).to.be.true;
    });
  });
});
