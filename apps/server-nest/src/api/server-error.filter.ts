import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { ServerError } from '../domain';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

@Catch(ServerError)
export class ServerErrorFilter implements ExceptionFilter<ServerError> {
  catch(exception: ServerError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    response.status(statusFor(exception)).json({
      error: exception.kind,
      message: exception.message,
    });
  }
}

function statusFor(error: ServerError): number {
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
