// @flow
import React from 'react';
import styled from 'styled-components';
import { transparentize } from 'polished';

import colors from './colors';

const Rectangles = styled.div`
  position: relative;
  display: flex;
  justify-content: space-between;
  max-width: 296px;
  height: 44px;
  width: 100%;

  @media (max-width: 340px) {
    height: 41px;
    max-width: 280px;
  }
`;

const Rectangle = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 32px;
  flex-shrink: 0;
  padding: 0 0 1px;
  background-color: #fff;
  border: 1px solid ${transparentize(0.8, colors.text)};
  border-radius: 6px;
  color: ${colors.text};
  font-size: 24px;
  text-align: center;

  @media (max-width: 340px) {
    width: 30px;
  }

  &:not(:last-child) {
    margin: 0 4px 0 0;
  }

  &:nth-child(5) {
    margin: 0 15px 0 0;
  }
`;

const NumberField = styled.input`
  position: absolute;
  display: ${props => (props.hidden ? 'none' : 'flex')};
  height: 100%;
  width: 32px;
  top: 0;
  left: ${props => props.position * 36 + 12 * Number(props.position >= 4)}px;
  padding: 0;
  background-color: #fff;
  border: 1px solid ${colors.blue};
  border-radius: 6px;
  box-shadow: 0 0 0 2px ${transparentize(0.9, colors.blue)};
  font-size: 18px;
  text-align: center;
  outline: 0;

  @media (max-width: 340px) {
    width: 30px;
    left: ${props => props.position * 34 + 12 * Number(props.position >= 4)}px;
  }

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }
`;

const VerificationCodeField = ({ value, onChange, onDelete, ...props }: { value: string, onChange: Function, onDelete: Function}) => (
  <Rectangles {...props}>
    <NumberField
      type="tel"
      onChange={onChange}
      onKeyDown={event => event.key === 'Backspace' && onDelete()}
      value=""
      position={value.length}
      hidden={value.length >= 8}
    />
    {value
      .padEnd(8, ' ')
      .split('')
      .map((digit, i) => (
        <Rectangle key={i.toString()}>{digit === ' ' ? '' : digit}</Rectangle>
      ))}
  </Rectangles>
);

export default VerificationCodeField;
