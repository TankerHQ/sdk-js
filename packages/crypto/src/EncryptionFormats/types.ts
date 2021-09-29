export interface EncryptionFormatReporter {
  getClearSize(encryptedSize: number, maxEncryptedChunkSize?: number): number
  getEncryptedSize(clearSize: number, maxEncryptedChunkSize?: number): number
}
