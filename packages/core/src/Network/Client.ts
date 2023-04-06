import type { b64string } from '@tanker/crypto';
import { tcrypto, utils } from '@tanker/crypto';
import { TankerError, InternalError, InvalidArgument, InvalidVerification, OperationCanceled, PreconditionFailed } from '@tanker/errors';
import { fetch, retry, exponentialDelayGenerator } from '@tanker/http-utils';
import type { DelayGenerator } from '@tanker/http-utils';
import { PromiseWrapper } from '@tanker/types';

import { TaskQueue } from '../TaskQueue';
import { signChallenge } from './Authenticator';
import { genericErrorHandler } from './ErrorHandler';
import { b64RequestObject, urlize } from './utils';
import type { ProvisionalKeysRequest, SetVerificationMethodRequest, VerificationRequest } from '../LocalUser/requests';
import type { PublicProvisionalIdentityTarget } from '../Identity/identity';
import type {
  FileUploadURLResponse, FileDownloadURLResponse,
  TankerProvisionalIdentityResponse, VerificationMethodResponse,
  E2eVerificationKeyResponse, EncryptedVerificationKeyResponse,
} from './types';

export const defaultApiEndpoint = 'https://api.tanker.io';

export type ClientOptions = {
  instanceInfo: { id: string; };
  sdkInfo: { type: string; version: string; };
  url?: string;
};

export type ServerPublicProvisionalIdentity = {
  app_id: b64string;
  target: PublicProvisionalIdentityTarget;
  value: string;
  public_signature_key: b64string;
  public_encryption_key: b64string;
};

export type PublicProvisionalIdentityResults = {
  hashedEmails: Record<string, ServerPublicProvisionalIdentity>;
  hashedPhoneNumbers: Record<string, ServerPublicProvisionalIdentity>;
};

export type PullOptions = {
  isLight?: boolean;
};

const MAX_CONCURRENCY = 5;
const MAX_QUERY_STRING_ITEMS = 100;

function unique(vals: Array<string>): Array<string> {
  return Array.from(new Set(vals));
}

/**
 * Network communication
 */
export class Client {
  declare _accessToken: string;
  declare _apiEndpoint: string;
  declare _apiRootPath: string;
  declare _appId: Uint8Array;
  declare _authenticating: Promise<void> | null;
  declare _cancelationHandle: PromiseWrapper<void>;
  declare _deviceId: Uint8Array | null;
  declare _deviceSignatureKeyPair: tcrypto.SodiumKeyPair | null;
  declare _fetchQueue: TaskQueue;
  declare _instanceId: string;
  declare _retryDelayGenerator: DelayGenerator;
  declare _sdkType: string;
  declare _sdkVersion: string;
  declare _userId: Uint8Array;

  constructor(appId: Uint8Array, userId: Uint8Array, options: ClientOptions) {
    const { instanceInfo, sdkInfo, url } = { url: defaultApiEndpoint, ...options };
    this._accessToken = '';
    this._apiEndpoint = url.replace(/\/+$/, '');
    this._apiRootPath = `/v2/apps/${urlize(appId)}`;
    this._appId = appId;
    this._cancelationHandle = new PromiseWrapper<void>();
    this._deviceId = null;
    this._deviceSignatureKeyPair = null;
    this._fetchQueue = new TaskQueue(MAX_CONCURRENCY);
    this._instanceId = instanceInfo.id;
    this._retryDelayGenerator = exponentialDelayGenerator;
    this._sdkType = sdkInfo.type;
    this._sdkVersion = sdkInfo.version;
    this._userId = userId;
  }

  _cancelable = <R>(fun: (...args: Array<any>) => Promise<R>) => (...args: Array<any>) => {
    // cancelationHandle.promise always rejects. Its returned type doesn't matter
    if (this._cancelationHandle.settled) {
      return this._cancelationHandle.promise as never;
    }
    return Promise.race([this._cancelationHandle.promise as never, fun(...args)]);
  };

  // Simple fetch wrapper with limited concurrency
  _fetch = (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    const fn = () => fetch(input, init);

    return this._fetchQueue.enqueue(fn);
  };

  // Simple _fetch wrapper with:
  //   - proper headers set (sdk info and authorization)
  //   - generic error handling
  _baseApiCall = async (path: string, init?: RequestInit): Promise<any> => {
    try {
      if (!path || path[0] !== '/') {
        throw new InvalidArgument('"path" should be non empty and start with "/"');
      }

      const headers = (init?.headers ? init.headers : {}) as Record<string, string>;
      headers['X-Tanker-Instanceid'] = this._instanceId;
      headers['X-Tanker-Sdktype'] = this._sdkType;
      headers['X-Tanker-Sdkversion'] = this._sdkVersion;

      if (this._accessToken) {
        headers['Authorization'] = `Bearer ${this._accessToken}`; // eslint-disable-line dot-notation
      }

      const url = `${this._apiEndpoint}${this._apiRootPath}${path}`;

      const response = await this._fetch(url, { ...init, headers });

      if (response.status === 204) { // no-content: no JSON response to parse
        return;
      }

      if (response.ok) {
        // Keep the await here to benefit from the enclosing try/catch
        // and common error handling
        const responseJSON = await response.json();
        return responseJSON;
      }

      // We use response.text() and manual JSON parsing here as the response
      // may come from the load balancer (e.g. 502 errors), and thus not
      // contain the common JSON format used in all our API responses
      const responseText = await response.text();

      let error;
      try {
        ({ error } = JSON.parse(responseText));
      } catch (_) { } // eslint-disable-line no-empty

      if (!error) {
        const details = responseText ? `response body: "${responseText}"` : 'empty response body';
        const message = `"${response.status} ${response.statusText}" status with ${details}`;
        error = { code: '<unknown>', message, status: response.status, trace_id: '<unknown>' };
      }

      const apiMethod = init && init.method || 'GET';
      genericErrorHandler(apiMethod, url, error);
    } catch (err) {
      const e = err as Error;
      if (e instanceof TankerError) throw e;
      throw new InternalError(e.toString());
    }
  };

  // Advanced _baseApiCall wrapper with additional capabilities:
  //   - await authentication if in progress
  //   - smart retry on authentication failure (e.g. expired token)
  //   - call in progress can be canceled if close() called
  _apiCall = this._cancelable(async (path: string, init?: RequestInit): Promise<any> => {
    if (this._authenticating) {
      await this._authenticating;
    }

    const accessToken = this._accessToken;

    const retryOptions = {
      delayGenerator: this._retryDelayGenerator,
      retries: 1,
      retryCondition: async (error: Error) => {
        if (error instanceof PreconditionFailed && error.apiCode === 'invalid_token') {
          // The access token we are using is invalid/expired.
          //
          // We could be in one of the following situations:
          //
          // 1. Another API call is already trying to re-authenticate
          if (this._authenticating) {
            await this._authenticating;
            // 2. This is the first API call to attempt a re-authentication. This
            //    is also the recovery process when this API call occurs after a
            //    previous re-authentication failure (i.e. access token is '')
          } else if (this._accessToken === accessToken) {
            await this._authenticate();
          }
          // (else)
          // 3. Another API call already completed a re-authentication
          // We can safely retry now
          return true;
        }
        return false;
      },
    };

    return retry(() => this._baseApiCall(path, init), retryOptions);
  });

  _authenticate = this._cancelable((): Promise<void> => {
    if (this._authenticating) {
      return this._authenticating;
    }

    this._accessToken = '';

    if (!this._deviceId)
      throw new InternalError('Assertion error: trying to authenticate without a device id');
    const deviceId = this._deviceId;

    if (!this._deviceSignatureKeyPair)
      throw new InternalError('Assertion error: trying to sign a challenge without a signature key pair');
    const deviceSignatureKeyPair = this._deviceSignatureKeyPair;

    const auth = async () => {
      const { challenge } = await this._cancelable(
        () => this._baseApiCall(`/devices/${urlize(deviceId)}/challenges`, { method: 'POST' }),
      )();

      const signature = signChallenge(deviceSignatureKeyPair, challenge);
      const signaturePublicKey = deviceSignatureKeyPair.publicKey;

      const { access_token: accessToken } = await this._cancelable(
        () => this._baseApiCall(`/devices/${urlize(deviceId)}/sessions`, {
          method: 'POST',
          body: JSON.stringify(b64RequestObject({ signature, challenge, signature_public_key: signaturePublicKey })),
          headers: { 'Content-Type': 'application/json' },
        }),
      )();

      this._accessToken = accessToken;
    };

    this._authenticating = auth().finally(() => {
      this._authenticating = null;
    });

    return this._authenticating;
  });

  authenticateDevice = async (deviceId: Uint8Array, signatureKeyPair: tcrypto.SodiumKeyPair) => {
    this._deviceId = deviceId;
    this._deviceSignatureKeyPair = signatureKeyPair;

    return this._authenticate();
  };

  getUser = async (): Promise<unknown | null> => {
    const path = `/users/${urlize(this._userId)}`;

    try {
      const { user } = await this._apiCall(path);
      return user;
    } catch (e) {
      if (e instanceof TankerError) {
        if (e.apiCode === 'app_not_found') throw new PreconditionFailed(e);
        if (e.apiCode === 'user_not_found') return null;
      }
      throw e;
    }
  };

  getVerificationKey = async (body: unknown): Promise<Uint8Array> => {
    const path = `/users/${urlize(this._userId)}/verification-key`;
    const options = {
      method: 'POST',
      body: JSON.stringify(b64RequestObject(body)),
      headers: { 'Content-Type': 'application/json' },
    };

    const { encrypted_verification_key_for_user_secret: key } = await this._apiCall(path, options);

    return utils.fromBase64(key);
  };

  getE2eVerificationKey = async (body: any): Promise<E2eVerificationKeyResponse> => {
    const path = `/users/${urlize(this._userId)}/verification-key`;
    const options = {
      method: 'POST',
      body: JSON.stringify(b64RequestObject(body)),
      headers: { 'Content-Type': 'application/json' },
    };

    const {
      encrypted_verification_key_for_user_key: vkForUk,
      encrypted_verification_key_for_e2e_passphrase: vkForPass,
    } = await this._apiCall(path, options);

    return {
      encrypted_verification_key_for_user_key: utils.fromBase64(vkForUk),
      encrypted_verification_key_for_e2e_passphrase: utils.fromBase64(vkForPass),
    };
  };

  getEncryptedVerificationKey = async (): Promise<EncryptedVerificationKeyResponse> => {
    const reply = await this._apiCall('/encrypted-verification-key');
    const vkForUs = reply.encrypted_verification_key_for_user_secret ? utils.fromBase64(reply.encrypted_verification_key_for_user_secret) : null;
    const vkForUk = reply.encrypted_verification_key_for_user_key ? utils.fromBase64(reply.encrypted_verification_key_for_user_key) : null;
    if (vkForUs)
      return { encrypted_verification_key_for_user_secret: vkForUs };
    if (vkForUk)
      return { encrypted_verification_key_for_user_key: vkForUk };
    throw new InternalError('both getEncryptedVerificationKey fields are null');
  };

  getEncryptionKey = async (ghostDevicePublicSignatureKey: Uint8Array) => {
    const query = `ghost_device_public_signature_key=${urlize(ghostDevicePublicSignatureKey)}`;

    const path = `/users/${urlize(this._userId)}/encryption-key?${query}`;

    try {
      const { encrypted_user_private_encryption_key: key, ghost_device_id: id } = await this._apiCall(path);

      return {
        encryptedPrivateUserKey: utils.fromBase64(key),
        deviceId: utils.fromBase64(id),
      };
    } catch (e) {
      if (e instanceof TankerError) {
        if (e.apiCode === 'device_not_found') throw new InvalidVerification(e);
      }

      throw e;
    }
  };

  enrollUser = async (body: unknown): Promise<void> => {
    const path = `/users/${urlize(this._userId)}/enroll`;

    const options = {
      method: 'POST',
      body: JSON.stringify(b64RequestObject(body)),
      headers: { 'Content-Type': 'application/json' },
    };

    await this._apiCall(path, options);
  };

  createUser = async (deviceId: Uint8Array, deviceSignatureKeyPair: tcrypto.SodiumKeyPair, body: unknown): Promise<void> => {
    const path = `/users/${urlize(this._userId)}`;

    const options = {
      method: 'POST',
      body: JSON.stringify(b64RequestObject(body)),
      headers: { 'Content-Type': 'application/json' },
    };

    const { access_token: accessToken } = await this._apiCall(path, options);

    this._accessToken = accessToken;
    this._deviceId = deviceId;
    this._deviceSignatureKeyPair = deviceSignatureKeyPair;
  };

  createDevice = async (deviceId: Uint8Array, deviceSignatureKeyPair: tcrypto.SodiumKeyPair, body: unknown): Promise<void> => {
    const options = {
      method: 'POST',
      body: JSON.stringify(b64RequestObject(body)),
      headers: { 'Content-Type': 'application/json' },
    };

    const { access_token: accessToken } = await this._apiCall('/devices', options);

    this._accessToken = accessToken;
    this._deviceId = deviceId;
    this._deviceSignatureKeyPair = deviceSignatureKeyPair;
  };

  getUserHistories = async (query: string): Promise<{
    root: b64string;
    histories: Array<b64string>;
  }> => {
    const path = `/user-histories?${query}`;
    const {
      root,
      histories,
    } = await this._apiCall(path);
    return {
      root,
      histories,
    };
  };

  getUserHistoriesByUserIds = async (userIds: Array<Uint8Array>, options: PullOptions) => {
    const urlizedUserIds = unique(userIds.map(userId => urlize(userId)));

    const result = { root: '' as b64string, histories: [] as Array<b64string> };
    for (let i = 0; i < urlizedUserIds.length; i += MAX_QUERY_STRING_ITEMS) {
      const query = `is_light=${options.isLight ? 'true' : 'false'}&user_ids[]=${urlizedUserIds.slice(i, i + MAX_QUERY_STRING_ITEMS).join('&user_ids[]=')}`;
      const response = await this.getUserHistories(query);
      result.root = response.root;
      result.histories = result.histories.concat(response.histories);
    }
    return result;
  };

  getUserHistoriesByDeviceIds = async (deviceIds: Array<Uint8Array>, options: PullOptions) => {
    if (!this._deviceId)
      throw new InternalError('Assertion error: trying to get user histories without a device id');

    const urlizedDeviceIds = unique(deviceIds.map(deviceId => urlize(deviceId)));
    const result: { root: b64string; histories: Array<b64string>; } = { root: '', histories: [] };
    const gotBlocks = new Set();

    for (let i = 0; i < urlizedDeviceIds.length; i += MAX_QUERY_STRING_ITEMS) {
      const query = `is_light=${options.isLight ? 'true' : 'false'}&device_ids[]=${urlizedDeviceIds.slice(i, i + MAX_QUERY_STRING_ITEMS).join('&device_ids[]=')}`;
      const response = await this.getUserHistories(query);
      result.root = response.root;
      // We may ask for the same user twice, but through two different device
      // IDs. We can't use unique() here because we need to keep the order
      // intact.
      const withoutDuplicates = response.histories.filter(d => !gotBlocks.has(d));
      result.histories = result.histories.concat(withoutDuplicates);
      for (const block of withoutDuplicates)
        gotBlocks.add(block);
    }
    return result;
  };

  getVerificationMethods = async (): Promise<VerificationMethodResponse> => {
    const path = `/users/${urlize(this._userId)}/verification-methods`;
    const { verification_methods: verificationMethods } = await this._apiCall(path);
    return verificationMethods;
  };

  setVerificationMethod = async (body: SetVerificationMethodRequest) => {
    await this._apiCall(`/users/${urlize(this._userId)}/verification-methods`, {
      method: 'POST',
      body: JSON.stringify(b64RequestObject(body)),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  };

  getOidcChallenge = async (nonce: b64string): Promise<b64string> => {
    const { challenge } = await this._apiCall(`/users/${urlize(this._userId)}/oidc/challenges`, {
      method: 'POST',
      body: JSON.stringify({ nonce }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return challenge;
  };

  getResourceKey = async (resourceId: Uint8Array): Promise<b64string | null> => {
    const query = `resource_ids[]=${urlize(resourceId)}`;
    const { resource_keys: resourceKeys } = await this._apiCall(`/resource-keys?${query}`);
    if (resourceKeys.length === 0) {
      return null;
    }
    return resourceKeys[0];
  };

  publishResourceKeys = async (body: unknown): Promise<void> => {
    await this._apiCall('/resource-keys', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  createGroup = async (body: unknown): Promise<void> => {
    await this._apiCall('/user-groups', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  patchGroup = async (body: unknown): Promise<void> => {
    await this._apiCall('/user-groups', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  softUpdateGroup = async (body: unknown): Promise<void> => {
    await this._apiCall('/user-groups/soft-update', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  getSessionToken = async (body: unknown): Promise<b64string> => {
    const path = `/users/${urlize(this._userId)}/session-certificates`;
    // eslint-disable-next-line camelcase
    const { session_token: sessionToken } = await this._apiCall(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    return sessionToken;
  };

  getGroupHistories = (query: string): Promise<{ histories: Array<b64string>; }> => this._apiCall(`/user-group-histories?${query}&is_light=true`);

  getGroupHistoriesByGroupIds = async (groupIds: Array<Uint8Array>): Promise<{ histories: Array<b64string>; }> => {
    const result = { histories: [] as Array<b64string> };

    for (let i = 0; i < groupIds.length; i += MAX_QUERY_STRING_ITEMS) {
      const query = `user_group_ids[]=${groupIds.slice(i, i + MAX_QUERY_STRING_ITEMS).map(id => urlize(id)).join('&user_group_ids[]=')}`;
      const response = await this.getGroupHistories(query);
      result.histories = result.histories.concat(response.histories);
    }
    return result;
  };

  getGroupHistoriesByGroupPublicEncryptionKey = (groupPublicEncryptionKey: Uint8Array) => {
    const query = `user_group_public_encryption_key=${urlize(groupPublicEncryptionKey)}`;
    return this.getGroupHistories(query);
  };

  getFileUploadURL = (resourceId: Uint8Array, metadata: b64string, uploadContentLength: number): Promise<FileUploadURLResponse> => {
    const query = `metadata=${urlize(metadata)}&upload_content_length=${uploadContentLength}`;
    return this._apiCall(`/resources/${urlize(resourceId)}/upload-url?${query}`);
  };

  getFileDownloadURL = (resourceId: Uint8Array): Promise<FileDownloadURLResponse> => this._apiCall(`/resources/${urlize(resourceId)}/download-url`);

  getPublicProvisionalIdentities = async (hashedEmails: Array<Uint8Array>, hashedPhoneNumbers: Array<Uint8Array>): Promise<PublicProvisionalIdentityResults> => {
    const MAX_QUERY_ITEMS = 100; // This is probably route-specific, so doesn't need to be global
    const result = {
      hashedEmails: {},
      hashedPhoneNumbers: {},
    };

    let done = 0;
    while (done < hashedEmails.length + hashedPhoneNumbers.length) {
      // First, get as many emails as we have left that can fit in one request
      let hashedEmailsSlice: Array<Uint8Array> = [];
      if (done < hashedEmails.length) {
        const numEmailsToGet = Math.min(hashedEmails.length - done, MAX_QUERY_ITEMS);
        hashedEmailsSlice = hashedEmails.slice(done, done + numEmailsToGet);
        done += numEmailsToGet;
      }

      // If we had less than MAX_QUERY_ITEMS emails left, then there's room to start requesting phone numbers
      let hashedPhoneNumbersSlice: Array<Uint8Array> = [];
      if (hashedEmailsSlice.length < MAX_QUERY_ITEMS) {
        const phonesDone = done - hashedEmails.length;
        const numPhoneNumbersToGet = Math.min(hashedPhoneNumbers.length - phonesDone, MAX_QUERY_ITEMS - hashedEmailsSlice.length);
        hashedPhoneNumbersSlice = hashedPhoneNumbers.slice(phonesDone, phonesDone + numPhoneNumbersToGet);
        done += numPhoneNumbersToGet;
      }

      const options = {
        method: 'POST',
        body: JSON.stringify(b64RequestObject({
          hashed_emails: hashedEmailsSlice,
          hashed_phone_numbers: hashedPhoneNumbersSlice,
        })),
        headers: { 'Content-Type': 'application/json' },
      };

      const { public_provisional_identities: identitiesBatch } = await this._apiCall('/public-provisional-identities', options);
      result.hashedEmails = { ...result.hashedEmails, ...identitiesBatch.hashed_emails };
      result.hashedPhoneNumbers = { ...result.hashedPhoneNumbers, ...identitiesBatch.hashed_phone_numbers };
    }

    return result;
  };

  getProvisionalIdentityClaims = async (): Promise<Array<b64string>> => {
    const path = `/users/${urlize(this._userId)}/provisional-identity-claims`;
    const { provisional_identity_claims: claims } = await this._apiCall(path);
    return claims;
  };

  getTankerProvisionalKeysFromSession = async (body: ProvisionalKeysRequest): Promise<TankerProvisionalIdentityResponse> => {
    const path = `/users/${urlize(this._userId)}/tanker-provisional-keys`;
    const options = {
      method: 'POST',
      body: JSON.stringify(b64RequestObject(body)),
      headers: { 'Content-Type': 'application/json' },
    };

    const { tanker_provisional_keys: provisionalKeys } = await this._apiCall(path, options);
    return provisionalKeys;
  };

  getTankerProvisionalKeysWithVerif = async (body: { verification: VerificationRequest }): Promise<TankerProvisionalIdentityResponse> => {
    const options = {
      method: 'POST',
      body: JSON.stringify(b64RequestObject(body)),
      headers: { 'Content-Type': 'application/json' },
    };

    const { tanker_provisional_keys: provisionalKeys } = await this._apiCall('/tanker-provisional-keys', options);
    return provisionalKeys;
  };

  claimProvisionalIdentity = async (body: unknown): Promise<void> => {
    await this._apiCall('/provisional-identity-claims', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  close = async (reason?: Error): Promise<void> => {
    this._cancelationHandle.reject(new OperationCanceled('Closing the client', reason));

    if (this._accessToken && this._deviceId) {
      const deviceId = this._deviceId;
      const path = `/devices/${urlize(deviceId)}/sessions`;
      // HTTP status:
      //   204: session successfully deleted
      //   401: session already expired
      //   other: something unexpected happened -> ignore and continue closing ¯\_(ツ)_/¯
      await this._baseApiCall(path, { method: 'DELETE' }).catch((error: TankerError) => {
        if (error.httpStatus !== 401) {
          console.error('Error while closing the network client', error);
        }
      });
    }

    this._accessToken = '';
    this._deviceId = null;
    this._deviceSignatureKeyPair = null;
  };
}
