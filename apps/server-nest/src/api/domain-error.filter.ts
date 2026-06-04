import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { DomainError } from '../domain';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    response.status(statusFor(exception)).json({
      error: exception.kind,
      message: exception.message,
    });
  }
}

function statusFor(error: DomainError): number {
  switch (error.kind) {
    case 'notFound':
      return HttpStatus.NOT_FOUND;
    case 'conflict':
      return HttpStatus.CONFLICT;
    case 'validation':
      return HttpStatus.BAD_REQUEST;
    case 'internal':
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
