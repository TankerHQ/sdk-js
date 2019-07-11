// @flow

export default class Storage {
  constructor(tanker) {
    this.tanker = tanker;
  }

  upload(...args) {
    return this.tanker.upload(...args);
  }

  download(...args) {
    return this.tanker.upload(...args);
  }
}
