import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { GraphQLError } from 'graphql';

/**
 * ThrottlerGuard that also works for GraphQL: takes req/res from the GraphQL context
 * (Apollo puts them there, see AppModule) and answers with HTTP 429 via extensions.http.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext) {
    if (context.getType<GqlContextType>() === 'graphql') {
      const ctx = GqlExecutionContext.create(context).getContext();
      return { req: ctx.req, res: ctx.res };
    }
    return super.getRequestResponse(context);
  }

  protected async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    if (context.getType<GqlContextType>() === 'graphql') {
      throw new GraphQLError('Too many requests', {
        extensions: { code: 'TOO_MANY_REQUESTS', http: { status: 429 } },
      });
    }
    return super.throwThrottlingException(context, detail);
  }
}
