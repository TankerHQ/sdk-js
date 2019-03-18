// @flow
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

type RejectionParams = {|
  handler: any;
  exception: any;
  property: string;
  expectedValue: any;
|};

export async function expectRejectedWithProperty(params: RejectionParams) {
  try {
    await params.handler();
  } catch (e) {
    expect(e).to.be.an.instanceOf(params.exception);
    expect(e[params.property]).to.deep.equal(params.expectedValue);
    return;
  }
  assert.fail('Exception not thrown');
}

export { assert, expect };
export default chai;
