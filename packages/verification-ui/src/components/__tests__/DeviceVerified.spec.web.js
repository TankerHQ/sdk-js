// @flow
import React from 'react';
import { shallow } from 'enzyme';
import { expect, sinon } from '@tanker/test-utils';

import DeviceVerified from '../DeviceVerified';

describe('<DeviceVerified />', () => {
  it('renders', () => {
    expect(shallow(<DeviceVerified exit={() => {}} />)).to.have.length(1);
  });

  it('calls the exit callback when the button is clicked', () => {
    const exit = sinon.fake();
    const wrapper = shallow(<DeviceVerified exit={exit} />);
    wrapper.childAt(3).simulate('click');
    expect(exit.calledOnce).to.be.true;
  });
});
