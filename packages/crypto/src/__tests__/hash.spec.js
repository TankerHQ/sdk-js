// @flow
import { expect } from './chai';
import { generichash } from '../hash';
import { fromHex, fromString } from '../utils';

describe('hash', () => {
  it('should not have trivial collisions', async () => {
    const input = 'I went to Yoshinoya a while ago; you know, Yoshinoya?';
    const output1 = generichash(fromString(`${input} AB`));
    const output2 = generichash(fromString(`${input} BA`));

    expect(output1).to.not.equal(output2);
  });

  it('should have the requested output size', async () => {
    const hashsize = 48;
    const input = fromString('Dreams thrive by competition');
    const output = generichash(input, hashsize);

    expect(output.length).to.equal(hashsize);
  });

  // To check that the hash function is implemented correctly, we compute a test vector,
  // which is a known expected output for a given input, defined in the standard
  it('should match the RFC7693 BLAKE2b-512 test vector for "abc"', async () => {
    const vector = fromHex('BA80A53F981C4D0D6A2797B69F12F6E94C212F14685AC4B74B12BB6FDBFFA2D17D87C5392AAB792DC252D5DE4533CC9518D38AA8DBF1925AB92386EDD4009923');
    const input = fromString('abc');
    const output = generichash(input, 64);

    expect(output).to.deep.equal(vector);
  });
});
