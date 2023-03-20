import { DownloadStream as GCSDownloadStream } from './gcs/DownloadStream';
import { UploadStream as GCSUploadStream } from './gcs/UploadStream';
import { DownloadStream as S3DownloadStream } from './s3/DownloadStream';
import { UploadStream as S3UploadStream } from './s3/UploadStream';

export const GCS = {
  DownloadStream: GCSDownloadStream,
  UploadStream: GCSUploadStream,
};

export const S3 = {
  DownloadStream: S3DownloadStream,
  UploadStream: S3UploadStream,
};

export const streamCloudStorage = {
  GCS,
  S3,
};
