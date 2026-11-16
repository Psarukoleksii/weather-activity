import { Module } from '@nestjs/common';
import { RedisModule } from '../../libs/redis';
import { WeatherModule } from '../weather/weather.module';
import { GeocodingMissCache } from './geocoding-miss.cache';
import { PlacesService } from './places.service';

@Module({
  imports: [WeatherModule, RedisModule],
  providers: [PlacesService, GeocodingMissCache],
  exports: [PlacesService],
})
export class PlacesModule {}
