// @flow
import React from 'react';
import { shallow } from 'enzyme';
import { expect } from '@tanker/test-utils';

import Button from '../Button';
import Check from '../Check';
import Error from '../Error';
import Modal from '../Modal';
import Overlay from '../Overlay';
import Spinner from '../Spinner';
import TankerLogo from '../TankerLogo';

describe('Basic elements', () => {
  it('renders a <Button />', () => {
    expect(shallow(<Button />)).to.have.length(1);
  });

  it('renders a <Check />', () => {
    expect(shallow(<Check color="#fff" width={42} />)).to.have.length(1);
  });

  it('renders a <Error />', () => {
    expect(shallow(<Error />)).to.have.length(1);
  });

  it('renders a <Modal />', () => {
    expect(shallow(<Modal />)).to.have.length(1);
  });

  it('renders a <Overlay />', () => {
    expect(shallow(<Overlay />)).to.have.length(1);
  });

  it('renders a <Spinner />', () => {
    expect(shallow(<Spinner color="#fff" width={42} />)).to.have.length(1);
  });

  it('renders a <TankerLogo />', () => {
    expect(shallow(<TankerLogo color="#fff" width={42} />)).to.have.length(1);
  });
});
