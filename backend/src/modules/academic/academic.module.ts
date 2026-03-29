import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Teacher } from './entities/teacher.entity';
import { Subject } from './entities/subject.entity';
import { Classroom } from './entities/classroom.entity';
import { Group } from './entities/group.entity';
import { ScheduleSlot } from './entities/schedule-slot.entity';
import { Building } from './entities/building.entity';
import { ExcelService } from './services/excel.service';
import { AcademicController } from './academic.controller';
import { TeachersService } from './services/teachers.service';
import { TeachersResolver } from './resolvers/teachers.resolver';
import { BuildingsService } from './services/buildings.service';
import { BuildingsResolver } from './resolvers/buildings.resolver';
import { SubjectsService } from './services/subjects.service';
import { SubjectsResolver } from './resolvers/subjects.resolver';
import { GroupsService } from './services/groups.service';
import { GroupsResolver } from './resolvers/groups.resolver';
import { ClassroomsService } from './services/classrooms.service';
import { ClassroomsResolver } from './resolvers/classrooms.resolver';
import { SchedulesService } from './services/schedules.service';
import { SchedulesResolver } from './resolvers/schedules.resolver';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
    imports: [TypeOrmModule.forFeature([Teacher, Subject, Classroom, Group, ScheduleSlot, Building])],
    controllers: [AcademicController],
    providers: [
        ExcelService,
        TeachersService,
        TeachersResolver,
        BuildingsService,
        BuildingsResolver,
        SubjectsService,
        SubjectsResolver,
        GroupsService,
        GroupsResolver,
        ClassroomsService,
        ClassroomsResolver,
        SchedulesService,
        SchedulesResolver,
        RolesGuard,
    ],
    exports: [ExcelService, SchedulesService],
})
export class AcademicModule
{}
