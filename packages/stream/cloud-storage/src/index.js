// @flow
import GCSDownloadStream from './gcs/DownloadStream';
import GCSUploadStream from './gcs/UploadStream';

export const GCS = {
  DownloadStream: GCSDownloadStream,
  UploadStream: GCSUploadStream,
};

export default {
  GCS,
};
