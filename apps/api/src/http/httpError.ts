export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    public readonly code = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "HttpError";
  }
}
