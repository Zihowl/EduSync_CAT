import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { AcademicModule } from '../academic/academic.module';

@Module({
    imports: [AcademicModule],
    controllers: [PublicController],
})
export class PublicModule
{}
