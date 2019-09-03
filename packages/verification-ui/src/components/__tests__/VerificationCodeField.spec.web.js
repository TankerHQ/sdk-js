// @flow
import React from 'react';
import { shallow } from 'enzyme';
import { expect, sinon } from '@tanker/test-utils';

import VerificationCodeField from '../VerificationCodeField';

const defaultProps = { id: 'id', value: '' };

describe('<VerificationCodeField />', () => {
  it('renders', () => {
    expect(shallow(<VerificationCodeField {...defaultProps} />)).to.have.length(1);
  });

  it('forwards the id prop to the number field', () => {
    const id = 'id';
    const wrapper = shallow(<VerificationCodeField {...defaultProps} id={id} />);
    expect(wrapper.childAt(0).props().id).to.equal(id);
  });

  it('does not forward the value prop to the number field', () => {
    const value = 'value';
    const wrapper = shallow(<VerificationCodeField {...defaultProps} value={value} />);
    expect(wrapper.childAt(0).props().value).to.equal('');
  });

  it('hides the number field if the value contains 8 characters or more', () => {
    const value = '12345678';
    const wrapper = shallow(<VerificationCodeField {...defaultProps} value={value} />);
    expect(wrapper.childAt(0).props().hidden).to.equal(true);
  });

  it('calls the onChange callback with the new value when the number field changes', () => {
    const onChange = sinon.spy();
    const oldValue = '1234';
    const added = '5678';
    const wrapper = shallow(<VerificationCodeField {...defaultProps} value={oldValue} onChange={onChange} />);
    wrapper.childAt(0).simulate('change', { target: { value: added } });
    expect(onChange.calledWith(oldValue + added)).to.be.true;
  });

  it('cleans up the new value before calling the onChange callback', () => {
    const onChange = sinon.spy();
    const oldValue = '1';
    const added = '5az';
    const wrapper = shallow(<VerificationCodeField {...defaultProps} value={oldValue} onChange={onChange} />);
    wrapper.childAt(0).simulate('change', { target: { value: added } });
    expect(onChange.calledWith('15')).to.be.true;
  });

  it('limits the length of the new value to 8 when calling the onChange callback', () => {
    const onChange = sinon.spy();
    const oldValue = '1234';
    const added = '56789';
    const wrapper = shallow(<VerificationCodeField {...defaultProps} value={oldValue} onChange={onChange} />);
    wrapper.childAt(0).simulate('change', { target: { value: added } });
    expect(onChange.calledWith('12345678')).to.be.true;
  });

  it('removes a character in the new value and calls the onChange callback when pressing Backspace in the number field', () => {
    const onChange = sinon.spy();
    const value = 'value';
    const wrapper = shallow(<VerificationCodeField {...defaultProps} value={value} onChange={onChange} />);
    wrapper.childAt(0).simulate('keydown', { key: 'Backspace' });
    expect(onChange.calledWith(value.slice(0, value.length - 1))).to.be.true;
  });

  it('does not call the onChange callback when pressing not-Backspace in the number field', () => {
    const onChange = sinon.spy();
    const wrapper = shallow(<VerificationCodeField {...defaultProps} onChange={onChange} />);
    wrapper.childAt(0).simulate('keydown', { key: 'a' });
    expect(onChange.calledOnce).to.be.false;
  });

  it('forwards the value prop to the hidden field for accessibility', () => {
    const value = 'value';
    const wrapper = shallow(<VerificationCodeField {...defaultProps} value={value} />);
    expect(wrapper.childAt(1).props().value).to.equal(value);
  });

  it('has a hidden field with an id that is pointed to by an aria property on the number field', () => {
    const wrapper = shallow(<VerificationCodeField {...defaultProps} />);
    expect(wrapper.childAt(1).props().id).to.equal(wrapper.childAt(0).props()['aria-controls']);
  });

  it('contains 8 rectangles', () => {
    const wrapper = shallow(<VerificationCodeField {...defaultProps} />);
    expect(wrapper.children().slice(2)).to.have.length(8);
  });

  it('puts every letter of the value prop into a separate cell', () => {
    const value = 'value';
    const wrapper = shallow(<VerificationCodeField {...defaultProps} value={value} />);
    expect(wrapper.children().slice(2, value.length + 2).map(node => node.text())).to.deep.equal(value.split(''));
  });
});
