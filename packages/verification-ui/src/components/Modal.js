// @flow
import React from 'react';
import styled from 'styled-components';
import { Motion, spring } from 'react-motion';
import { transparentize } from 'polished';

import colors from './colors';
import Overlay from './Overlay';

const Dialog = styled.dialog`
  position: fixed;
  max-width: 100%;
  max-height: 100%;
  margin: 0 auto;
  top: 50%;
  left: 0;
  padding: 0;
  background: #fff;
  border: none;
  border-radius: 5px;
  box-shadow: 0 2px 20px 0 ${transparentize(0.7, colors.grey)};
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  transform: translate3d(0, calc(var(--offset) - 50%), 0) scale(var(--scale));
  will-change: transform;
  z-index: 1338;

  @media (max-width: 980px) {
    height: 100%;
    top: 0;
    border-radius: 0;
    transform: translate3d(calc(-4.5 * var(--offset)), 0, 0);
  }
`;

const computeStyle = ({ opacity, scale, offset }) => ({
  '--scale': scale > 1 ? 1 : scale,
  '--offset': `${offset}px`,
  opacity,
});

const springOptions = { stiffness: 200, damping: 24 };

export const Modal = ({ onClose, ...props }: {onClose?: Event => any}) => (
  <>
    <Overlay onClick={onClose} aria-hidden />
    <Motion
      defaultStyle={{ opacity: 0, offset: -50, scale: 0.5 }}
      style={{ opacity: spring(1, springOptions), offset: spring(0, springOptions), scale: spring(1, springOptions) }}
    >
      {interpolatingStyle => <Dialog open {...props} style={computeStyle(interpolatingStyle)} />}
    </Motion>
  </>
);

export default Modal;
