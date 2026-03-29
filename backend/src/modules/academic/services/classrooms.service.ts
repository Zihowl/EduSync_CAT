import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Classroom } from '../entities/classroom.entity';
import { Building } from '../entities/building.entity';
import { CreateClassroomInput } from '../dto/create-classroom.input';
import { UpdateClassroomInput } from '../dto/update-classroom.input';

@Injectable()
export class ClassroomsService
{
    constructor(
        @InjectRepository(Classroom)
        private readonly classroomRepo: Repository<Classroom>,
        @InjectRepository(Building)
        private readonly buildingRepo: Repository<Building>,
    ) {}

    async FindAll(): Promise<Classroom[]> {
        return await this.classroomRepo.find({ relations: ['building'], order: { name: 'ASC' } });
    }

    async FindOne(id: number): Promise<Classroom | null> {
        return await this.classroomRepo.findOne({ where: { id }, relations: ['building'] });
    }

    async Create(input: CreateClassroomInput): Promise<Classroom> {
        const existing = await this.classroomRepo.findOne({ where: { name: input.name } });
        if (existing) throw new ConflictException('Classroom already exists');
        const c = this.classroomRepo.create({ name: input.name });
        if (input.buildingId) {
            const b = await this.buildingRepo.findOne({ where: { id: input.buildingId } });
            if (!b) throw new BadRequestException('Building not found');
            c.building = b;
        }
        return await this.classroomRepo.save(c);
    }

    async Update(input: UpdateClassroomInput): Promise<Classroom> {
        const c = await this.classroomRepo.findOne({ where: { id: input.id }, relations: ['building'] });
        if (!c) throw new NotFoundException('Classroom not found');
        if (input.name && input.name !== c.name) {
            const conflict = await this.classroomRepo.findOne({ where: { name: input.name } });
            if (conflict) throw new ConflictException('Classroom name already in use');
            c.name = input.name;
        }
        if (input.buildingId !== undefined) {
            if (input.buildingId === null) {
                c.building = undefined;
            } else {
                const b = await this.buildingRepo.findOne({ where: { id: input.buildingId } });
                if (!b) throw new BadRequestException('Building not found');
                c.building = b;
            }
        }
        return await this.classroomRepo.save(c);
    }

    async Remove(id: number): Promise<boolean> {
        const res = await this.classroomRepo.delete(id);
        return (res.affected ?? 0) > 0;
    }
}
