import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Teacher } from '../entities/teacher.entity';
import { CreateTeacherInput } from '../dto/create-teacher.input';
import { UpdateTeacherInput } from '../dto/update-teacher.input';

@Injectable()
export class TeachersService
{
    constructor(
        @InjectRepository(Teacher)
        private readonly teacherRepo: Repository<Teacher>,
    ) 
    {}

    async FindAll(): Promise<Teacher[]> 
    {
        const all = await this.teacherRepo.find({ order: { name: 'ASC' } });
        return all;
    }

    async FindOne(id: number): Promise<Teacher | null>
    {
        return await this.teacherRepo.findOne({ where: { id } });
    }

    async Create(input: CreateTeacherInput): Promise<Teacher>
    {
        const existing = await this.teacherRepo.findOne({ where: { employeeNumber: input.employeeNumber } });
        if (existing)
        {
            throw new ConflictException('Teacher with that employee number already exists');
        }

        const t = this.teacherRepo.create({ employeeNumber: input.employeeNumber, name: input.name, email: input.email });
        return await this.teacherRepo.save(t);
    }

    async Update(input: UpdateTeacherInput): Promise<Teacher>
    {
        const t = await this.teacherRepo.findOne({ where: { id: input.id } });
        if (!t)
        {
            throw new NotFoundException('Teacher not found');
        }

        if (input.employeeNumber && input.employeeNumber !== t.employeeNumber)
        {
            const conflict = await this.teacherRepo.findOne({ where: { employeeNumber: input.employeeNumber } });
            if (conflict) throw new ConflictException('Employee number already in use');
            t.employeeNumber = input.employeeNumber;
        }

        if (input.name !== undefined) t.name = input.name;
        if (input.email !== undefined) t.email = input.email;

        return await this.teacherRepo.save(t);
    }

    async Remove(id: number): Promise<boolean>
    {
        const res = await this.teacherRepo.delete(id);
        return (res.affected ?? 0) > 0;
    }
}
