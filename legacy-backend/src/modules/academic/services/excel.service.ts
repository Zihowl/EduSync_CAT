import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as xlsx from 'xlsx';

import { Teacher } from '../entities/teacher.entity';
import { Subject } from '../entities/subject.entity';
import { Classroom } from '../entities/classroom.entity';
import { Building } from '../entities/building.entity';
import { Group } from '../entities/group.entity';
import { ScheduleSlot } from '../entities/schedule-slot.entity';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class ExcelService
{
    constructor(
        @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
        @InjectRepository(Subject) private subjectRepo: Repository<Subject>,
        @InjectRepository(Classroom) private classroomRepo: Repository<Classroom>,
        @InjectRepository(Building) private buildingRepo: Repository<Building>,
        @InjectRepository(Group) private groupRepo: Repository<Group>,
        @InjectRepository(ScheduleSlot) private scheduleRepo: Repository<ScheduleSlot>,
    ) 
    {}

    async ProcessScheduleFile(buffer: Buffer, uploadedBy?: User) 
    {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const rawData = (xlsx.utils as any).sheet_to_json(sheet) as Array<Record<string, unknown>>;

        if (rawData.length === 0) 
        {
            throw new BadRequestException('El archivo Excel está vacío.');
        }

        return this.ProcessScheduleRows(rawData, uploadedBy);
    }

    private async ProcessScheduleRows(rawData: Array<Record<string, unknown>>, uploadedBy?: User) 
    {
        const errors: string[] = [];
        let processedCount = 0;

        for (const [index, row] of rawData.entries()) 
        {
            const ok = await this.ProcessSingleRow(index, row, errors, uploadedBy);
            if (ok) processedCount++;
        }

        return { success: true, processed: processedCount, errors };
    }

    private async ProcessSingleRow(index: number, row: Record<string, unknown>, errors: string[], uploadedBy?: User): Promise<boolean> 
    {
        try 
        {
            await this.ImportRow(row, uploadedBy);
            return true;
        }
        catch (err: unknown) 
        {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Error en fila ${index + 2}:`, msg);
            errors.push(`Fila ${index + 2}: ${msg}`);
            return false;
        }
    }

    private async ImportRow(row: Record<string, unknown>, uploadedBy?: User) 
    {
        const parsed = this.getParsedRowValues(row);
        this.EnsureRequiredScheduleFields(parsed, row);

        const subject = await this.findOrCreateSubject(parsed.claveMateria, parsed.materiaName);
        const teacher = await this.findOrCreateTeacher(parsed.noEmpleado, parsed.docenteName);
        const classroom = await this.findOrCreateClassroom(parsed.aulaName, parsed.edificio);
        const group = await this.findOrCreateGroup(parsed.grupoName);

        await this.CreateScheduleSlot(subject, teacher, classroom, group, parsed.dia, parsed.horaInicio, parsed.horaFin, uploadedBy);
    }

    private async CreateScheduleSlot(
        subject: Subject, 
        teacher: Teacher, 
        classroom: Classroom, 
        group: Group, 
        dia: string, 
        horaInicio: string, 
        horaFin: string,
        uploadedBy?: User
    ) 
    {
        const dayNumber = this.ParseDay(dia);
        const start = this.FormatTime(horaInicio);
        const end = this.FormatTime(horaFin);

        const slot = new ScheduleSlot();
        slot.subject = subject;
        slot.teacher = teacher;
        slot.classroom = classroom;
        slot.group = group;
        slot.dayOfWeek = dayNumber;
        slot.startTime = start;
        slot.endTime = end;
        slot.subgroup = null;
        slot.isPublished = false; // Los horarios importados empiezan como borrador
        slot.createdBy = uploadedBy ?? null;

        await this.scheduleRepo.save(slot);
    }

    private normalizeCell(val: unknown): string 
    {
        if (typeof val === 'string') return val.trim();
        if (typeof val === 'number') return String(val).trim();
        if (val === undefined || val === null) return '';
        if (typeof val === 'object') 
        {
            try 
            {
                return JSON.stringify(val); 
            }
            catch 
            {
                return ''; 
            }
        }
        return '';
    }

    private getParsedRowValues(row: Record<string, unknown>) 
    {
        return {
            claveMateria: this.normalizeCell(row['ClaveMateria']),
            materiaName: this.normalizeCell(row['Materia']),
            noEmpleado: this.normalizeCell(row['NoEmpleado']),
            docenteName: this.normalizeCell(row['Docente']),
            grupoName: this.normalizeCell(row['Grupo']),
            aulaName: this.normalizeCell(row['Aula']),
            edificio: this.normalizeCell(row['Edificio']),
            dia: this.normalizeCell(row['Dia']),
            horaInicio: this.normalizeCell(row['HoraInicio']),
            horaFin: this.normalizeCell(row['HoraFin']),
        };
    }

    private EnsureRequiredScheduleFields(parsed: { claveMateria: string; grupoName: string; dia: string; horaInicio: string }, row: Record<string, unknown>) 
    {
        if (!parsed.claveMateria || !parsed.grupoName || !parsed.dia || !parsed.horaInicio) 
        {
            throw new Error(
                `Datos incompletos. Se requiere ClaveMateria, Grupo, Dia y HoraInicio. Recibido: ${JSON.stringify(row)}`,
            );
        }
    }

    private async findOrCreateSubject(code: string, name: string) 
    {
        let subject = await this.subjectRepo.findOneBy({ code });
        if (!subject) 
        {
            subject = this.subjectRepo.create({ code, name: name || 'Materia Sin Nombre' });
            await this.subjectRepo.save(subject);
        }
        return subject;
    }

    private async findOrCreateTeacher(empNumRaw: string, name: string) 
    {
        const empNum = empNumRaw || 'SIN_NUM_' + Date.now();
        let teacher = await this.teacherRepo.findOneBy({ employeeNumber: empNum });
        if (!teacher) 
        {
            teacher = this.teacherRepo.create({ employeeNumber: empNum, name: name || 'Docente Por Asignar' });
            await this.teacherRepo.save(teacher);
        }
        return teacher;
    }

    private async findOrCreateClassroom(name: string, buildingName: string) 
    {
        const finalAula = name || 'VIRTUAL';
        let classroom = await this.classroomRepo.findOne({ where: { name: finalAula }, relations: ['building'] });
        if (!classroom) 
        {
            let building: Building | null = null;
            if (buildingName) 
            {
                building = await this.buildingRepo.findOne({ where: { name: buildingName } });
                if (!building) 
                {
                    const newBuilding = this.buildingRepo.create({ name: buildingName });
                    building = await this.buildingRepo.save(newBuilding);
                }
            }

            classroom = this.classroomRepo.create({ name: finalAula, building: (building as Building) || undefined });
            await this.classroomRepo.save(classroom);
        }
        return classroom;
    }

    private async findOrCreateGroup(name: string) 
    {
        let group = await this.groupRepo.findOneBy({ name });
        if (!group) 
        {
            group = this.groupRepo.create({ name });
            await this.groupRepo.save(group);
        }
        return group;
    }

    private ParseDay(day: string | number): number 
    {
        if (typeof day === 'number') return day;
        const d = day.toString().toLowerCase().trim();
        if (d.includes('lun')) return 1;
        if (d.includes('mar')) return 2;
        if (d.includes('mié') || d.includes('mie')) return 3;
        if (d.includes('jue')) return 4;
        if (d.includes('vie')) return 5;
        if (d.includes('sáb') || d.includes('sab')) return 6;
        return 0;
    }

    private FormatTime(time: string | number): string 
    {
        if (time === undefined || time === null) return '00:00:00';
        const t = typeof time === 'number' ? String(time) : time;
        if (!t) return '00:00:00';
        return t.includes(':') ? t : '00:00:00';
    }
}
