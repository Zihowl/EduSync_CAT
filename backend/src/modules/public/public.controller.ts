import { Controller, Get, Query } from '@nestjs/common';
import { SchedulesService } from '../academic/services/schedules.service';
import { ScheduleSlot } from '../academic/entities/schedule-slot.entity';

/**
 * Controlador público para consultar horarios sin autenticación.
 * Solo expone horarios publicados (isPublished = true).
 */
@Controller('public')
export class PublicController
{
    constructor(private readonly schedulesService: SchedulesService)
    {}

    /**
     * GET /public/schedules
     * Obtiene horarios publicados con filtros opcionales.
     */
    @Get('schedules')
    async GetPublicSchedules(
        @Query('groupId') groupId?: string,
        @Query('teacherId') teacherId?: string,
        @Query('classroomId') classroomId?: string,
        @Query('dayOfWeek') dayOfWeek?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ): Promise<ScheduleSlot[]>
    {
        return await this.schedulesService.FindAll({
            groupId: groupId ? parseInt(groupId, 10) : undefined,
            teacherId: teacherId ? parseInt(teacherId, 10) : undefined,
            classroomId: classroomId ? parseInt(classroomId, 10) : undefined,
            dayOfWeek: dayOfWeek ? parseInt(dayOfWeek, 10) : undefined,
            isPublished: true, // Solo horarios publicados
            page: page ? parseInt(page, 10) : 1,
            limit: limit ? parseInt(limit, 10) : 50,
        });
    }
}
