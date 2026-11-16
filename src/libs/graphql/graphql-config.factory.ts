import type { ApolloDriverConfig } from '@nestjs/apollo';
import { Injectable } from '@nestjs/common';
import type { GqlOptionsFactory } from '@nestjs/graphql';

/** Code-first GraphQL over Apollo Server. */
@Injectable()
export class GraphQLConfigFactory implements GqlOptionsFactory<ApolloDriverConfig> {
  public createGqlOptions(): Omit<ApolloDriverConfig, 'driver'> {
    return {
      autoSchemaFile: true,
      sortSchema: true,
      playground: false,
      introspection: true,
      // Keep the status from extensions.http (429 from GqlThrottlerGuard); Nest resets it to 200 by default.
      preserveHttpStatusForExecutionErrors: false,
      // The throttler guard needs req/res from the GraphQL context.
      context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
    };
  }
}
