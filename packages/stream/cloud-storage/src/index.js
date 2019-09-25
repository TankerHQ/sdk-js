// @flow
import GCSDownloadStream from './gcs/DownloadStream';
import GCSUploadStream from './gcs/UploadStream';
import S3DownloadStream from './s3/DownloadStream';
import S3UploadStream from './s3/UploadStream';

export const GCS = {
  DownloadStream: GCSDownloadStream,
  UploadStream: GCSUploadStream,
};

export const S3 = {
  DownloadStream: S3DownloadStream,
  UploadStream: S3UploadStream,
};

export default {
  GCS,
  S3,
};
