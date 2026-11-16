import { Module } from '@nestjs/common';
import { OpenMeteoClient } from './open-meteo.client';
import { WeatherService } from './weather.service';

@Module({
  providers: [OpenMeteoClient, WeatherService],
  exports: [OpenMeteoClient, WeatherService],
})
export class WeatherModule {}
