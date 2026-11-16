import type { BasicConfigType } from '../types/basic-config.type';
import { get } from '../utils/env-var';

export const environmentBasicFactory = (): BasicConfigType => ({
  port: get('PORT').default('3000').asPortNumber()!,
});
