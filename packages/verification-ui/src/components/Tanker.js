// @flow
import React from 'react';
import { hot } from 'react-hot-loader';
import { TransitionMotion, spring } from 'react-motion';
import styled from 'styled-components';
import fetchPonyfill from 'fetch-ponyfill';

import colors from './colors';
import { type Context } from '../context/makeContextHolder';
import Modal from './Modal';
import TankerLogo from './TankerLogo';

import VerifyDevice from './VerifyDevice';
import DeviceVerified from './DeviceVerified';

const Container = styled(Modal)`
  display: flex;
  flex-flow: column;
  align-items: center;
  height: 420px;
  width: 340px;
  padding: 30px 0 0;
  overflow-x: hidden;
  overflow-y: auto;

  @media (max-width: 980px) {
    width: 100%;
    height: 100%;
  }

  & > * {
    width: 100%;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 14px;
  margin: 0 0 30px;
`;

const TitlePart = styled.span`
  width: 100px;
  color: ${colors.blue};
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.5px;
  line-height: 1.5;
  text-transform: uppercase;
`;

const AlignedTitlePart = styled(TitlePart)`
  text-align: ${props => props.align};
`;

const Logo = styled(TankerLogo)`
  margin: 0 9px 1px;
`;

const Panels = styled.div`
  position: relative;
  display: flex;
  flex-flow: column;
  align-items: center;
  height: 100%;
  width: 100%;
  flex-grow: 1;
`;

const Panel = styled.div`
  position: absolute;
  display: flex;
  flex-flow: column;
  align-items: center;
  flex-grow: 1;
  min-height: 340px;
  height: 100%;
  width: 100%;
  top: 0;
  left: 0;
  padding: 0 20px 30px;

  & > * { max-width: 100%; }
`;

const willEnter = () => ({ opacity: 0, x: 300 });
const willLeave = () => ({ opacity: spring(0, { stiffness: 300, damping: 25 }), x: spring(-300) });
const computeStyles = values => ({ opacity: values.opacity, transform: `translate3d(${values.x}px, 0, 0)` });

const { fetch } = fetchPonyfill({ Promise });

type Props = { context: Context, appId: string, url: string, email: string, check: string => Promise<void>, exit: () => void };
export const Tanker = ({ context, appId, url, email, check, exit }: Props) => (
  <Container onClose={context.state.verifySuccess ? exit : null}>
    <Header>
      <AlignedTitlePart align="right">Data Privacy</AlignedTitlePart>
      <Logo color={colors.blue} width={12} />
      <AlignedTitlePart align="left">by Tanker</AlignedTitlePart>
    </Header>
    <TransitionMotion
      willEnter={willEnter}
      willLeave={() => willLeave()}
      styles={[
        {
          key: context.state.verifySuccess ? 'DeviceVerified' : 'VerifyDevice',
          style: { opacity: spring(1), x: spring(0) },
        },
      ]}
    >
      {interpolatedStyles => (
        <Panels>
          {interpolatedStyles.map(({ key, style }) => (
            <Panel key={key} style={computeStyles(style)}>
              {key === 'DeviceVerified' ? <DeviceVerified exit={exit} /> : <VerifyDevice context={context} fetch={fetch} appId={appId} url={url} email={email} check={check} />}
            </Panel>
          ))}
        </Panels>
      )}
    </TransitionMotion>
  </Container>
);

export default hot(module)(Tanker);
