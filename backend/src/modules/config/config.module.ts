import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllowedDomain } from './entities/allowed-domain.entity';
import { SchoolYear } from './entities/school-year.entity';
import { ConfigService } from './config.service';
import { ConfigResolver } from './config.resolver';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
    imports: [TypeOrmModule.forFeature([AllowedDomain, SchoolYear])],
    providers: [ConfigService, ConfigResolver, RolesGuard],
    exports: [ConfigService],
})
export class ConfigModule 
{}
