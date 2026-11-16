import { ArgsType, Field, GraphQLISODateTime, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { GraphQLScalarType, Kind } from 'graphql';
import { ActivityType, Confidence, Rating } from '../../../models/enums';

registerEnumType(ActivityType, { name: 'ActivityType' });
registerEnumType(Rating, { name: 'Rating' });
registerEnumType(Confidence, { name: 'Confidence' });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date without time, 'YYYY-MM-DD', in the place's time zone. */
export const DateScalar = new GraphQLScalarType<string, string>({
  name: 'Date',
  description: 'Calendar date YYYY-MM-DD in the place time zone',
  serialize: (value) => String(value),
  parseValue: (value) => {
    if (typeof value !== 'string' || !DATE_RE.test(value)) throw new TypeError('Date must be YYYY-MM-DD');
    return value;
  },
  parseLiteral: (ast) => {
    if (ast.kind !== Kind.STRING || !DATE_RE.test(ast.value)) throw new TypeError('Date must be YYYY-MM-DD');
    return ast.value;
  },
});

@ArgsType()
export class ActivityRankingsArgs {
  @Field(() => String, { description: 'City name, e.g. "Zakopane"' })
  city: string;

  @Field(() => String, { description: 'ISO 3166-1 alpha-2 country code, e.g. "PL"' })
  country: string;
}

@ObjectType('Place')
export class PlaceDto {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field({ description: 'ISO 3166-1 alpha-2' })
  country: string;

  @Field({ description: 'IANA time zone' })
  timezone: string;
}

@ObjectType('DayScore')
export class DayScoreDto {
  @Field(() => Int, { description: '1 = best day for this activity' })
  rank: number;

  @Field(() => DateScalar)
  date: string;

  @Field(() => Int)
  score: number;

  @Field(() => Rating)
  rating: Rating;

  @Field(() => Confidence)
  confidence: Confidence;

  @Field(() => [String])
  reasons: string[];
}

@ObjectType('ActivityRanking')
export class ActivityRankingDto {
  @Field(() => ActivityType)
  activity: ActivityType;

  @Field()
  applicable: boolean;

  @Field(() => String, { nullable: true, description: 'Set when applicable = false' })
  notApplicableReason: string | null;

  @Field(() => [DayScoreDto], { description: 'Best day first; empty when not applicable' })
  days: DayScoreDto[];
}

@ObjectType('ActivityRankingsResult')
export class ActivityRankingsResultDto {
  @Field(() => PlaceDto)
  place: PlaceDto;

  @Field(() => GraphQLISODateTime, { description: 'When the weather was fetched from Open-Meteo' })
  dataAsOf: Date;

  @Field(() => [ActivityRankingDto], { description: 'Always four activities' })
  activities: ActivityRankingDto[];
}
