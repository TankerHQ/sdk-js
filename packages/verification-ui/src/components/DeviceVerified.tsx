import React from 'react';
import styled from 'styled-components';

import colors from './colors';
import Button from './Button';
import Check from './Check';

const BigCheck = styled(Check)`
  margin: 50px 0 26px;
`;

const Title = styled.h1`
  margin: 0 0 21px;
  color: ${colors.text};
  font-size: 24px;
  font-weight: 400;
  line-height: 1.33;
  text-align: center;
`;

const Text = styled.p`
  margin: 0 0 52px;
  font-size: 18px;
  line-height: 1.56;
  text-align: center;
`;

const Done = styled(Button)`
  width: 100px;
`;

const DeviceVerified = ({ exit }: { exit: () => void; }) => (
  <>
    <BigCheck width={30} color={colors.green} />
    <Title>You’re all set.</Title>
    <Text>Your email has been verified.</Text>
    <Done blue round type="button" onClick={exit} id="tanker-verification-ui-done-button">
      Done
    </Done>
  </>
);

export default DeviceVerified;
