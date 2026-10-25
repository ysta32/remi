export class DetectorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DetectorError';
    this.code = code;
  }
}
