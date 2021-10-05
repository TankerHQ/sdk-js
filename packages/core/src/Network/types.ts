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
  { type: 'email'; encrypted_email?: string; }
  | { type: 'phone_number'; encrypted_phone_number: string; }
  | { type: 'passphrase'; }
  | { type: 'oidc_id_token'; }
)>;
