export type CloudStorageServices = 'GCS' | 'S3';

export type FileUploadURLResponse = {
  urls: Array<string>;
  headers: Record<string, any>;
  service: CloudStorageServices;
  recommended_chunk_size: number;
};

export type FileDownloadURLResponse = {
  head_url: string;
  get_url: string;
  service: CloudStorageServices;
};

export type TankerProvisionalIdentityResponse = {
  private_signature_key: string;
  public_signature_key: string;
  private_encryption_key: string;
  public_encryption_key: string;
};

export type VerificationMethodResponse = Array<(
  { type: 'email'; encrypted_email?: string; is_preverified: boolean; }
  | { type: 'phone_number'; encrypted_phone_number: string; is_preverified: boolean; }
  | { type: 'passphrase'; }
  | { type: 'e2e_passphrase'; }
  | { type: 'oidc_id_token'; }
)>;

export type E2eVerificationKeyResponse = {
  encrypted_verification_key_for_user_key: Uint8Array,
  encrypted_verification_key_for_e2e_passphrase: Uint8Array,
};

export type EncryptedVerificationKeyResponse = {
  encrypted_verification_key_for_user_secret: Uint8Array,
} | {
  encrypted_verification_key_for_user_key: Uint8Array,
};
