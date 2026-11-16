import { AppConst } from '../consts/app.consts';
import { environmentApiFactory } from '../factories/environment-api.factory';
import { environmentWorkerFactory } from '../factories/environment-worker.factory';
import type { ApiConfigType } from '../types/env-configs/api-config.type';
import type { WorkerConfigType } from '../types/env-configs/worker-config.type';

type AppConfigByApp = {
  [AppConst.Api]: ApiConfigType;
  [AppConst.Worker]: WorkerConfigType;
};

/** Whole configuration of one app, read from the environment. */
export const environment = <A extends AppConst>(app: A): AppConfigByApp[A] => {
  if (app === AppConst.Worker) return environmentWorkerFactory() as AppConfigByApp[A];
  return environmentApiFactory() as AppConfigByApp[A];
};
