import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduleSlot } from '../entities/schedule-slot.entity';
import { Teacher } from '../entities/teacher.entity';
import { Subject } from '../entities/subject.entity';
import { Classroom } from '../entities/classroom.entity';
import { Group } from '../entities/group.entity';
import { User } from '../../users/entities/user.entity';
import { CreateScheduleSlotInput } from '../dto/create-schedule-slot.input';
import { UpdateScheduleSlotInput } from '../dto/update-schedule-slot.input';
import { ScheduleFilterInput } from '../dto/schedule-filter.input';

@Injectable()
export class SchedulesService
{
    constructor(
        @InjectRepository(ScheduleSlot)
        private readonly scheduleRepo: Repository<ScheduleSlot>,
        @InjectRepository(Teacher)
        private readonly teacherRepo: Repository<Teacher>,
        @InjectRepository(Subject)
        private readonly subjectRepo: Repository<Subject>,
        @InjectRepository(Classroom)
        private readonly classroomRepo: Repository<Classroom>,
        @InjectRepository(Group)
        private readonly groupRepo: Repository<Group>,
    )
    {}

    /**
     * Obtiene todos los horarios con filtros opcionales y paginación.
     */
    async FindAll(filter?: ScheduleFilterInput): Promise<ScheduleSlot[]>
    {
        const qb = this.scheduleRepo.createQueryBuilder('slot')
            .leftJoinAndSelect('slot.teacher', 'teacher')
            .leftJoinAndSelect('slot.subject', 'subject')
            .leftJoinAndSelect('slot.classroom', 'classroom')
            .leftJoinAndSelect('slot.group', 'group')
            .leftJoinAndSelect('slot.createdBy', 'createdBy');

        if (filter?.groupId)
        {
            qb.andWhere('slot.group_id = :groupId', { groupId: filter.groupId });
        }
        if (filter?.teacherId)
        {
            qb.andWhere('slot.teacher_id = :teacherId', { teacherId: filter.teacherId });
        }
        if (filter?.classroomId)
        {
            qb.andWhere('slot.classroom_id = :classroomId', { classroomId: filter.classroomId });
        }
        if (filter?.dayOfWeek)
        {
            qb.andWhere('slot.dayOfWeek = :dayOfWeek', { dayOfWeek: filter.dayOfWeek });
        }
        if (filter?.isPublished !== undefined)
        {
            qb.andWhere('slot.isPublished = :isPublished', { isPublished: filter.isPublished });
        }

        qb.orderBy('slot.dayOfWeek', 'ASC')
          .addOrderBy('slot.startTime', 'ASC');

        const page = filter?.page ?? 1;
        const limit = filter?.limit ?? 50;
        qb.skip((page - 1) * limit).take(limit);

        return await qb.getMany();
    }

    /**
     * Obtiene un horario por su ID.
     */
    async FindOne(id: number): Promise<ScheduleSlot | null>
    {
        return await this.scheduleRepo.findOne({ where: { id } });
    }

    /**
     * Crea un nuevo slot de horario con validación de colisiones.
     */
    async Create(input: CreateScheduleSlotInput, currentUser?: User): Promise<ScheduleSlot>
    {
        // Validar que startTime < endTime
        this.ValidateTimes(input.startTime, input.endTime);

        // Validar existencia de entidades relacionadas
        const teacher = await this.teacherRepo.findOne({ where: { id: input.teacherId } });
        if (!teacher) throw new NotFoundException(`Profesor con ID ${input.teacherId} no encontrado`);

        const subject = await this.subjectRepo.findOne({ where: { id: input.subjectId } });
        if (!subject) throw new NotFoundException(`Materia con ID ${input.subjectId} no encontrada`);

        const classroom = await this.classroomRepo.findOne({ where: { id: input.classroomId } });
        if (!classroom) throw new NotFoundException(`Salón con ID ${input.classroomId} no encontrado`);

        const group = await this.groupRepo.findOne({ where: { id: input.groupId } });
        if (!group) throw new NotFoundException(`Grupo con ID ${input.groupId} no encontrado`);

        // Verificar colisiones
        await this.CheckCollisions(input.teacherId, input.classroomId, input.dayOfWeek, input.startTime, input.endTime);

        const slot = new ScheduleSlot();
        slot.teacher = teacher;
        slot.subject = subject;
        slot.classroom = classroom;
        slot.group = group;
        slot.dayOfWeek = input.dayOfWeek;
        slot.startTime = input.startTime;
        slot.endTime = input.endTime;
        slot.subgroup = input.subgroup ?? null;
        slot.isPublished = input.isPublished ?? false;
        slot.createdBy = currentUser ?? null;

        return await this.scheduleRepo.save(slot);
    }

    /**
     * Actualiza un slot de horario existente con validación de colisiones.
     */
    async Update(input: UpdateScheduleSlotInput): Promise<ScheduleSlot>
    {
        const slot = await this.scheduleRepo.findOne({ where: { id: input.id } });
        if (!slot) throw new NotFoundException(`Horario con ID ${input.id} no encontrado`);

        // Preparar valores finales (usar existentes si no se proveen)
        const teacherId = input.teacherId ?? slot.teacher.id;
        const classroomId = input.classroomId ?? slot.classroom.id;
        const dayOfWeek = input.dayOfWeek ?? slot.dayOfWeek;
        const startTime = input.startTime ?? slot.startTime;
        const endTime = input.endTime ?? slot.endTime;

        // Validar tiempos si cambiaron
        if (input.startTime || input.endTime)
        {
            this.ValidateTimes(startTime, endTime);
        }

        // Verificar colisiones excluyendo el slot actual
        await this.CheckCollisions(teacherId, classroomId, dayOfWeek, startTime, endTime, input.id);

        // Actualizar relaciones si cambiaron
        if (input.teacherId && input.teacherId !== slot.teacher.id)
        {
            const teacher = await this.teacherRepo.findOne({ where: { id: input.teacherId } });
            if (!teacher) throw new NotFoundException(`Profesor con ID ${input.teacherId} no encontrado`);
            slot.teacher = teacher;
        }
        if (input.subjectId && input.subjectId !== slot.subject.id)
        {
            const subject = await this.subjectRepo.findOne({ where: { id: input.subjectId } });
            if (!subject) throw new NotFoundException(`Materia con ID ${input.subjectId} no encontrada`);
            slot.subject = subject;
        }
        if (input.classroomId && input.classroomId !== slot.classroom.id)
        {
            const classroom = await this.classroomRepo.findOne({ where: { id: input.classroomId } });
            if (!classroom) throw new NotFoundException(`Salón con ID ${input.classroomId} no encontrado`);
            slot.classroom = classroom;
        }
        if (input.groupId && input.groupId !== slot.group.id)
        {
            const group = await this.groupRepo.findOne({ where: { id: input.groupId } });
            if (!group) throw new NotFoundException(`Grupo con ID ${input.groupId} no encontrado`);
            slot.group = group;
        }

        if (input.dayOfWeek !== undefined) slot.dayOfWeek = input.dayOfWeek;
        if (input.startTime !== undefined) slot.startTime = input.startTime;
        if (input.endTime !== undefined) slot.endTime = input.endTime;
        if (input.subgroup !== undefined) slot.subgroup = input.subgroup;
        if (input.isPublished !== undefined) slot.isPublished = input.isPublished;

        return await this.scheduleRepo.save(slot);
    }

    /**
     * Elimina un slot de horario.
     */
    async Remove(id: number): Promise<boolean>
    {
        const result = await this.scheduleRepo.delete(id);
        return (result.affected ?? 0) > 0;
    }

    /**
     * Publica o despublica un conjunto de horarios.
     */
    async SetPublished(ids: number[], isPublished: boolean): Promise<number>
    {
        const result = await this.scheduleRepo
            .createQueryBuilder()
            .update(ScheduleSlot)
            .set({ isPublished })
            .whereInIds(ids)
            .execute();
        return result.affected ?? 0;
    }

    /**
     * Valida que startTime sea menor que endTime.
     */
    private ValidateTimes(startTime: string, endTime: string): void
    {
        const start = this.TimeToMinutes(startTime);
        const end = this.TimeToMinutes(endTime);
        if (start >= end)
        {
            throw new BadRequestException('La hora de inicio debe ser menor que la hora de fin');
        }
    }

    /**
     * Convierte un string HH:mm o HH:mm:ss a minutos desde medianoche.
     */
    private TimeToMinutes(time: string): number
    {
        const parts = time.split(':');
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }

    /**
     * Verifica si hay colisiones de horario para el mismo profesor o salón.
     * @param excludeId ID del slot a excluir (para updates)
     */
    private async CheckCollisions(
        teacherId: number,
        classroomId: number,
        dayOfWeek: number,
        startTime: string,
        endTime: string,
        excludeId?: number,
    ): Promise<void>
    {
        // Buscar slots que se solapen en tiempo para el mismo día
        // Solapamiento: (start1 < end2) AND (end1 > start2)
        const qb = this.scheduleRepo.createQueryBuilder('slot')
            .where('slot.dayOfWeek = :dayOfWeek', { dayOfWeek })
            .andWhere('slot.startTime < :endTime', { endTime })
            .andWhere('slot.endTime > :startTime', { startTime });

        if (excludeId)
        {
            qb.andWhere('slot.id != :excludeId', { excludeId });
        }

        // Verificar colisión con el mismo profesor
        const teacherConflict = await qb.clone()
            .andWhere('slot.teacher_id = :teacherId', { teacherId })
            .getOne();

        if (teacherConflict)
        {
            throw new ConflictException(
                `El profesor ya tiene un horario asignado el día ${dayOfWeek} de ${teacherConflict.startTime} a ${teacherConflict.endTime}`
            );
        }

        // Verificar colisión con el mismo salón
        const classroomConflict = await qb.clone()
            .andWhere('slot.classroom_id = :classroomId', { classroomId })
            .getOne();

        if (classroomConflict)
        {
            throw new ConflictException(
                `El salón ya está ocupado el día ${dayOfWeek} de ${classroomConflict.startTime} a ${classroomConflict.endTime}`
            );
        }
    }
}
