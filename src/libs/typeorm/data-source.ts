import { ConfigService } from '@nestjs/config';
import { environmentPgFactory } from '../../environment/factories/environment-pg.factory';
import { TypeOrmConfigPgFactory } from './typeorm-config-pg.factory';

/**
 * Entry point of the TypeORM CLI (`npm run migration:*`). Must export exactly one DataSource,
 * which is why it is not re-exported from index.ts.
 */
export default new TypeOrmConfigPgFactory(new ConfigService(environmentPgFactory())).createTypeOrmDataSource();
