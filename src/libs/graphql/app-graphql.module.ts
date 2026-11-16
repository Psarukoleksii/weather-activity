import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { GraphQLConfigFactory } from './graphql-config.factory';
import { GraphQLErrorPassthroughFilter } from './graphql-error.filter';

/** POST /graphql; expected GraphQLErrors reach the client without being logged as unhandled. */
@Module({
  imports: [GraphQLModule.forRootAsync<ApolloDriverConfig>({ driver: ApolloDriver, useClass: GraphQLConfigFactory })],
  providers: [{ provide: APP_FILTER, useClass: GraphQLErrorPassthroughFilter }],
})
export class AppGraphQLModule {}
