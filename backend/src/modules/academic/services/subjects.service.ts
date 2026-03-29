import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from '../entities/subject.entity';
import { CreateSubjectInput } from '../dto/create-subject.input';
import { UpdateSubjectInput } from '../dto/update-subject.input';

@Injectable()
export class SubjectsService
{
    constructor(
        @InjectRepository(Subject)
        private readonly subjectRepo: Repository<Subject>,
    ) {}

    async FindAll(): Promise<Subject[]> {
        return await this.subjectRepo.find({ order: { name: 'ASC' } });
    }

    async FindOne(id: number): Promise<Subject | null> {
        return await this.subjectRepo.findOne({ where: { id } });
    }

    async Create(input: CreateSubjectInput): Promise<Subject> {
        const existing = await this.subjectRepo.findOne({ where: { code: input.code } });
        if (existing) throw new ConflictException('Subject code already exists');
        const s = this.subjectRepo.create({ code: input.code, name: input.name });
        return await this.subjectRepo.save(s);
    }

    async Update(input: UpdateSubjectInput): Promise<Subject> {
        const s = await this.subjectRepo.findOne({ where: { id: input.id } });
        if (!s) throw new NotFoundException('Subject not found');
        if (input.code && input.code !== s.code) {
            const conflict = await this.subjectRepo.findOne({ where: { code: input.code } });
            if (conflict) throw new ConflictException('Subject code already in use');
            s.code = input.code;
        }
        if (input.name !== undefined) s.name = input.name;
        return await this.subjectRepo.save(s);
    }

    async Remove(id: number): Promise<boolean> {
        const res = await this.subjectRepo.delete(id);
        return (res.affected ?? 0) > 0;
    }
}
