import { type ArgumentsHost, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { STATUS_CODES } from 'node:http';

// Nest logs every non-HttpException error, and body parser errors (415, 413)
// carry request values in their message, such as the sent charset. Client
// errors are already in the request log, so they are answered as an
// HttpException, which Nest does not log. The response body copies Nest's
// handleUnknownError so clients see no change.
export class QuietClientErrorsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (
      this.isHttpError(exception) &&
      exception.statusCode >= 400 &&
      exception.statusCode < 500
    ) {
      const message =
        exception.expose === false
          ? (STATUS_CODES[exception.statusCode] ?? 'Internal server error')
          : exception.message;
      return super.catch(
        new HttpException(message, exception.statusCode),
        host,
      );
    }

    super.catch(exception, host);
  }
}
