import React from 'react';
import styled, { keyframes } from 'styled-components';

function generate() {
  return [0, 1, 2, 3].reduce(
    (acc, i) => `${acc}
       ${i * 25}% { transform: rotateZ(${630 * i}deg); }
       ${i * 25 + 11.25}% { transform: rotateZ(${110 + 630 * i}deg); }
       ${i * 25 + 13.75}% { transform: rotateZ(${170 + 630 * i}deg); }`,
    '',
  );
}

const rotate = keyframes`
  ${generate()}

  100% {
    transform: rotateZ(2520deg);
  }
}`;

const dash = keyframes`
  0% {
    stroke-dashoffset: 20.5;
  }

  45% {
    stroke-dashoffset: 0;
  }

  55% {
    stroke-dashoffset: 0;
  }

  100% {
    stroke-dashoffset: 20.5;
  }
`;

const Svg = styled.svg`
  overflow: hidden;
`;

const Wrapper = styled.g`
  animation: ${rotate} 6s linear infinite;
  backface-visibility: hidden;
  perspective: 1000;
  transform-origin: center;
`;

const Circle = styled.circle`
  stroke-width: 1;
  stroke-dasharray: 21.6 10000;
  animation: ${dash} 1.5s linear infinite;
`;

const Spinner = ({ color, width, ...props }: { color: string; width: number; }) => (
  <Svg {...props} viewBox="0 0 10 10" width={width} height={width} aria-label="Loading..." tabIndex={0} role="progressbar">
    <Wrapper>
      <Circle fill="transparent" stroke={color} cx="5" cy="5" r="4.4" />
    </Wrapper>
  </Svg>
);

export default Spinner;
