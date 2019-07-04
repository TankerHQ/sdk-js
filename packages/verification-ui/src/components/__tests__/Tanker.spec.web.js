// @flow
import React from 'react';
import { expect } from 'chai';
import { shallow } from 'enzyme';

import makeContextHolder from '../../context/makeContextHolder';
import { Tanker } from '../Tanker';

const contextHolder = makeContextHolder();
const defaultProps = {
  appId: '1234',
  email: 'a@a.aa',
  url: 'https://thisisatest.test',
  check: () => new Promise(resolve => resolve()),
  exit: () => {},
  context: { state: contextHolder.state, actions: contextHolder.actions },
};

describe('<Tanker />', () => {
  it('renders', () => {
    expect(shallow(<Tanker {...defaultProps} />)).to.have.length(1);
  });

  it('doesn\'t allow the user to close the modal before the verification occurs', () => {
    const verifySuccess = false;
    const wrapper = shallow(<Tanker {...defaultProps} context={{ ...defaultProps.context, state: { ...defaultProps.context.state, verifySuccess } }} />);
    expect(wrapper.props().onClose).to.be.null;
  });

  it('allows the user to close the modal after the verification occurs', () => {
    const verifySuccess = true;
    const wrapper = shallow(<Tanker {...defaultProps} context={{ ...defaultProps.context, state: { ...defaultProps.context.state, verifySuccess } }} />);
    expect(wrapper.props().onClose).to.equal(defaultProps.exit);
  });

  it('show the verification screen before the verification occurs', () => {
    const verifySuccess = false;
    const wrapper = shallow(<Tanker {...defaultProps} context={{ ...defaultProps.context, state: { ...defaultProps.context.state, verifySuccess } }} />);
    expect(wrapper.childAt(1).props().styles[0].key).to.equal('VerifyDevice');
  });

  it('show the success screen after the verification occurs', () => {
    const verifySuccess = true;
    const wrapper = shallow(<Tanker {...defaultProps} context={{ ...defaultProps.context, state: { ...defaultProps.context.state, verifySuccess } }} />);
    expect(wrapper.childAt(1).props().styles[0].key).to.equal('DeviceVerified');
  });
});
