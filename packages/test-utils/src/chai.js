// @flow
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiExclude from 'chai-exclude';

chai.use(chaiAsPromised);
chai.use(chaiExclude);

export { assert, expect, chai };
