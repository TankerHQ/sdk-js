// @flow
import styled from 'styled-components';
import { darken } from 'polished';

import colors from './colors';

const Button = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  background: transparent;
  border: 0 none;
  cursor: pointer;
  outline: none;
  transition: all 0.3s;
  user-select: none;

  &:not(:disabled) {
    cursor: pointer;
  }

  ${props => props.round && 'border-radius: 50px'};

  ${props => props.blue
    && `padding: 9px 20px 11px;
    background-color: ${colors.blue};
    color: #fff;
    font-size: 18px;
    line-height: 1.25;

    &:active,
    &:focus,
    &:hover {
      background-color: ${darken(0.08, colors.blue)}
    }`}
`;

export default Button;
