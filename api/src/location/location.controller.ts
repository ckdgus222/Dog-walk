import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { NotDemoGuard } from '../auth/guards/not-demo.guard.js';
import type { PublicUser } from '../users/users.service.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import { LocationService } from './location.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(
    @Inject(LocationService) private readonly location: LocationService,
  ) {}

  @Get('me/location')
  me(@Req() request: Request & { user: PublicUser }) {
    return this.location.findMine(request.user.id);
  }

  @Post('me/location-consent')
  @UseGuards(NotDemoGuard)
  @HttpCode(204)
  consent(@Req() request: Request & { user: PublicUser }) {
    return this.location.consent(request.user.id);
  }

  @Delete('me/location-consent')
  @UseGuards(NotDemoGuard)
  @HttpCode(204)
  withdraw(@Req() request: Request & { user: PublicUser }) {
    return this.location.withdraw(request.user.id);
  }

  @Patch('me/location')
  @UseGuards(NotDemoGuard)
  update(
    @Req() request: Request & { user: PublicUser },
    @Body() body: UpdateLocationDto,
  ) {
    return this.location.update(request.user.id, body);
  }

  @Get('nearby')
  nearby(@Req() request: Request & { user: PublicUser }) {
    return this.location.findNearby(request.user.id);
  }
}
