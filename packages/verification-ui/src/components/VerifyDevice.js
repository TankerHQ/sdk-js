// @flow
import React from 'react';
import styled from 'styled-components';
import { transparentize } from 'polished';
import { errors } from '@tanker/client-browser';

import colors from './colors';
import { type Context } from './Context';
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
  color: ${colors.blue};
  font-size: 15px;
  font-weight: 400;
  line-height: 1.8;

  &:active,
  &:focus,
  &:hover {
    text-decoration: underline;
  }
`;

const errorTuples = [
  [errors.TooManyAttempts, 'Too many attempts, please retry later.'],
  [errors.InvalidVerification, 'Invalid verification code.'],
];
const findError = error => {
  const res = errorTuples.find(([e]) => error instanceof e);
  return res ? res[1] : null;
};
const getVerificationError = error => findError(error) || 'An unknown error occurred while checking the code.';

type Props = { appId: string, email: string, check: string => Promise<void>, context: Context };
class VerifyDevice extends React.Component<Props> {
  componentDidMount() {
    this.sendVerificationEmail();
  }

  sendVerificationEmail = async () => {
    const { appId, email, context } = this.props;
    const { actions, sendAttempts, sendIsFetching } = context;
    if (sendIsFetching) return;

    actions.sendStart(sendAttempts + 1);
    const raw = await fetch('https://staging-api.tanker.io/verification/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        trustchain_id: appId,
        email_data: { to_email: email },
      })
    });

    if (raw.status !== 200) {
      const ret = await raw.json();
      if (ret.error)
        actions.sendError(new Error(ret.error.code));
      actions.sendError(new Error(ret));
    } else {
      actions.sendSuccess();
    }
  };

  appendToVerificationCode = async (value: string) => {
    const cleanValue = value.replace(/\D/g, '');
    const { check, context } = this.props;
    const { actions, verificationCode, verifyIsFetching } = context;

    const newVerificationCode = (verificationCode + cleanValue).substring(0, 8);
    actions.setVerificationCode(newVerificationCode);

    if (newVerificationCode.length !== 8) return;
    if (verifyIsFetching) return;

    try {
      actions.verifyStart();
      await check(newVerificationCode);
      actions.verifySuccess();
    } catch (e) {
      console.error(e);
      actions.verifyError(e);
    }
  };

  shaveVerificationCode = () => {
    const { actions, verificationCode } = this.props.context;
    const previousVerificationCode = verificationCode;
    const nextVerificationCode = previousVerificationCode.substring(0, previousVerificationCode.length - 1);
    actions.setVerificationCode(nextVerificationCode);
  };

  render() {
    const { context, email } = this.props;

    return (
      <>
        <Label htmlFor="tanker-verification-ui-field">
          We need to verify it{"'"}s you. A verification code was sent to {email}.<br />
          Please enter it below:
        </Label>
        <StyledVerificationCodeField
          id="tanker-verification-ui-field"
          value={context.verificationCode}
          onChange={event => this.appendToVerificationCode(event.target.value)}
          onDelete={this.shaveVerificationCode}
        />
        {(context.verifyIsFetching || context.sendIsFetching) && <StyledSpinner size={18} color={colors.blue} />}
        {context.verifyError && <ErrorText>{getVerificationError(context.verifyError)}</ErrorText>}
        {context.sendError && <ErrorText>An unknown error occurred while sending the email, please retry.</ErrorText>}
        {context.sendAttempts === 1 && context.sendSuccess && <Sender>The sender of the verification email is “verification@tanker.io”.</Sender>}
        {context.sendAttempts > 1 && context.sendSuccess && <Success>New verification code sent.</Success>}
        {context.sendAttempts > 1 && context.sendSuccess && <Sender>Make sure to check your spam folder. The sender of the verification email is “verification@tanker.io”</Sender>}
        <LinkButton type="button" onClick={this.sendVerificationEmail}>
          Resend email
        </LinkButton>
      </>
    );
  }
}

export default VerifyDevice;
