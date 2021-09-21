import * as React from 'react';
import styled from 'styled-components';
import { transparentize } from 'polished';

import colors from './colors';

const Element = styled.div`
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: 100%;
  background-color: ${transparentize(0.5, colors.grey)};
  overflow: hidden;
  will-change: transform;
  z-index: 1337;
`;

const enforceTarget = cb => event => event.target.classList.contains(Element.styledComponentId) && cb && cb(event);

const Overlay = ({ onClick, ...props }: { onClick?: (arg0: Event) => any; }) => <Element {...props} onClick={enforceTarget(onClick)} />;

export default Overlay;
