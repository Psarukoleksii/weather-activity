import { Module } from '@nestjs/common';
import { WeatherModule } from '../weather/weather.module';
import { PlacesService } from './places.service';

@Module({
  imports: [WeatherModule],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
