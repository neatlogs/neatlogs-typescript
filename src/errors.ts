export type NeatlogsConfigurationErrorCode =
  | 'UNKNOWN_INIT_OPTION'
  | 'UNSUPPORTED_INSTRUMENTATIONS';

/** A caller-actionable SDK configuration failure. */
export class NeatlogsConfigurationError extends TypeError {
  readonly code: NeatlogsConfigurationErrorCode;
  readonly option: string;

  constructor(
    code: NeatlogsConfigurationErrorCode,
    option: string,
    message: string,
  ) {
    super(message);
    this.name = 'NeatlogsConfigurationError';
    this.code = code;
    this.option = option;
  }
}
