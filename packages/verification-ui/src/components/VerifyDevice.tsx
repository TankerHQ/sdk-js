import React from 'react';
import styled from 'styled-components';
import { transparentize } from 'polished';
import { ExpiredVerification, InvalidVerification, TooManyAttempts } from '@tanker/errors';

import colors from './colors';
import type { Context } from '../context/makeContextHolder';
import Button from './Button';
import Spinner from './Spinner';

import VerificationCodeField from './VerificationCodeField';

const Label = styled.label`
  margin: 0 0 30px;
  color: ${colors.text};
  font-size: 14px;
  font-weight: 400;
  line-height: 1.56;
  text-align: center;
`;

const StyledVerificationCodeField = styled(VerificationCodeField)`
  margin: 0 0 28px;
`;

const Text = styled.p`
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.625;
  text-align: center;
`;

const Success = styled(Text)`
  color: ${transparentize(0.4, colors.green)};
`;

const ErrorText = styled(Text)`
  color: ${transparentize(0.4, colors.red)};
`;

const Sender = styled(Text)`
  margin: 0 0 12px;
  color: ${transparentize(0.4, colors.text)};
`;

const StyledSpinner = styled(Spinner)`
  margin: 17px 0 29px;
`;

const LinkButton = styled(Button)`
  position: absolute;
  bottom: 30px;
  left: 50%;
  color: ${colors.blue};
  font-size: 15px;
  font-weight: 400;
  line-height: 1.8;
  transform: translate(-50%, 0);

  &:active,
  &:focus,
  &:hover {
    text-decoration: underline;
  }
`;

const errorTuples = [
  [ExpiredVerification, 'Expired verification code.'],
  [InvalidVerification, 'Invalid verification code.'],
  [TooManyAttempts, 'Too many attempts, please retry later.'],
];
const findError = error => {
  const res = errorTuples.find(([e]) => error instanceof e);
  return res ? res[1] : null;
};
const getVerificationError = error => findError(error) || 'An unknown error occurred while checking the code.';

type Props = { fetch: (...args: Array<any>) => any; appId: string; url: string; email: string; check: (arg0: string) => Promise<void>; context: Context; };
class VerifyDevice extends React.Component<Props> {
  componentDidMount() {
    this.sendVerificationEmail();
  }

  sendVerificationEmail = async () => {
    const { fetch, appId, url, email, context } = this.props;
    const { actions, state } = context;
    if (state.sendIsFetching) return;

    try {
      actions.sendStart(state.sendAttempts + 1);
      const b64UrlUnpaddedAppId = appId.replace(/\//g, '_').replace(/\+/g, '-').replace(/=+$/g, '');
      const raw = await fetch(`${url}/v2/apps/${b64UrlUnpaddedAppId}/verification/default-email`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to_email: email }),
      });

      if (raw.status !== 200) {
        const ret = await raw.json();
        if (ret.code)
          actions.sendError(new Error(ret.code));
        else
          actions.sendError(new Error('internal_error'));
      } else {
        actions.sendSuccess();
      }
    } catch (e) {
      console.error(e);
      actions.sendError(e);
    }
  };

  useVerificationCode = async (value: string) => {
    const { check, context } = this.props;
    const { actions, state } = context;

    actions.setVerificationCode(value);

    if (value.length !== 8) return;
    if (state.verifyIsFetching) return;

    try {
      actions.verifyStart();
      await check(value);
      actions.verifySuccess();
    } catch (e) {
      console.error(e);
      actions.verifyError(e);
    }
  };

  render() {
    const { context, email } = this.props;
    const { verificationCode, verifyIsFetching, verifyError, sendAttempts, sendIsFetching, sendSuccess, sendError } = context.state;

    return (
      <>
        <Label htmlFor="tanker-verification-ui-field">
          We need to verify it&apos;s you. A verification code was sent to {email}.<br />
          Please enter it below:
        </Label>
        <StyledVerificationCodeField
          id="tanker-verification-ui-field"
          value={verificationCode}
          onChange={this.useVerificationCode}
        />
        {(verifyIsFetching || sendIsFetching) && <StyledSpinner width={18} color={colors.blue} />}
        {verifyError && <ErrorText>{getVerificationError(verifyError)}</ErrorText>}
        {sendError && <ErrorText>An unknown error occurred while sending the email, please retry.</ErrorText>}
        {sendAttempts === 1 && sendSuccess && <Sender>The sender of the verification email is “verification@tanker.io”.</Sender>}
        {sendAttempts > 1 && sendSuccess && <Success>New verification code sent.</Success>}
        {sendAttempts > 1 && sendSuccess && <Sender>Make sure to check your spam folder. The sender of the verification email is “verification@tanker.io”</Sender>}
        <LinkButton type="button" onClick={this.sendVerificationEmail}>
          Resend email
        </LinkButton>
      </>
    );
  }
}

export default VerifyDevice;
