// @flow
import styled from 'styled-components';
import { transparentize } from 'polished';

import colors from './colors';

const Error = styled.p`
  margin: 0 0 23px;
  color: ${transparentize(0.4, colors.red)};
  font-size: 16px;
  font-weight: 400;
  line-height: 1.625;
  text-align: center;
`;

export default Error;
