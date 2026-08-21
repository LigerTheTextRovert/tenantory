import { Logger as NestLogger } from '@nestjs/common';
import { Logger as TypeOrmLoggerInterface } from 'typeorm';

export class TypeOrmLogger implements TypeOrmLoggerInterface {
  private readonly logger = new NestLogger('TypeORM');

  logQuery(query: string, parameters?: any[]) {
    this.logger.debug(
      `query: ${query} -- parameters: ${JSON.stringify(parameters || [])}`,
    );
  }

  logQueryError(error: string | Error, query: string, parameters?: any[]) {
    this.logger.error(
      `query failed: ${query} -- parameters: ${JSON.stringify(parameters || [])}`,
      error instanceof Error ? error.stack : error,
    );
  }

  logQuerySlow(time: number, query: string, parameters?: any[]) {
    this.logger.warn(
      `query is slow: ${time}ms -- query: ${query} -- parameters: ${JSON.stringify(parameters || [])}`,
    );
  }

  logSchemaBuild(message: string) {
    this.logger.log(message);
  }

  logMigration(message: string) {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: any) {
    if (level === 'log' || level === 'info') {
      this.logger.log(message);
    } else if (level === 'warn') {
      this.logger.warn(message);
    }
  }
}
