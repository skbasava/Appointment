import { Context, Next } from 'hono';
import { Env } from '../../db/types';

export class AppError extends Error {
  public statusCode: number;
  public code?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export function errorHandler() {
  return async (c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> => {
    try {
      await next();
    } catch (error: any) {
      console.error('Error caught:', {
        message: error?.message,
        name: error?.name,
        statusCode: error?.statusCode,
        code: error?.code,
        keys: Object.keys(error || {}),
      });

      // Check if this is one of our custom errors
      if (error?.statusCode && typeof error.statusCode === 'number') {
        return c.json(
          {
            error: error.message || 'Unknown error',
            code: error.code || 'ERROR',
          },
          error.statusCode
        );
      }

      return c.json(
        {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
        500
      );
    }
  };
}
