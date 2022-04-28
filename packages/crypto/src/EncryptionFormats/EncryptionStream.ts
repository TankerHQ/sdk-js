import type { Transform } from '@tanker/stream-base';

import type { b64string } from '../aliases';

export interface EncryptionStream extends Transform {
  get resourceId(): b64string;
}
