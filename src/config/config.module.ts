import { ConfigModule } from '@nestjs/config';
import { AppConst } from '../environment/consts/app.consts';
import { environment } from '../environment/environments/environment';

/** Global ConfigModule of one app; `.env` (if present) is loaded into process.env before the factories run. */
export const configurationModule = (app: AppConst) =>
  ConfigModule.forRoot({
    isGlobal: true,
    load: [() => environment(app)],
  });
