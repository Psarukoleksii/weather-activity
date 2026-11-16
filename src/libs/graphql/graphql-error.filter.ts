import { Catch } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

/**
 * Expected domain errors (BAD_USER_INPUT, NOT_FOUND, UPSTREAM_UNAVAILABLE, TOO_MANY_REQUESTS) go to the
 * client as they are; without this filter Nest logs each of them as an unhandled ERROR with a stack.
 */
@Catch(GraphQLError)
export class GraphQLErrorPassthroughFilter implements GqlExceptionFilter {
  catch(exception: GraphQLError): GraphQLError {
    return exception;
  }
}
