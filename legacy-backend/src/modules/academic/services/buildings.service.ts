import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Building } from '../entities/building.entity';
import { CreateBuildingInput } from '../dto/create-building.input';
import { UpdateBuildingInput } from '../dto/update-building.input';

@Injectable()
export class BuildingsService
{
    constructor(
        @InjectRepository(Building)
        private readonly buildingRepo: Repository<Building>,
    ) 
    {}

    async FindAll(): Promise<Building[]> 
    {
        return await this.buildingRepo.find({ order: { name: 'ASC' } });
    }

    async FindOne(id: number): Promise<Building | null> 
    {
        return await this.buildingRepo.findOne({ where: { id } });
    }

    async Create(input: CreateBuildingInput): Promise<Building> 
    {
        const existing = await this.buildingRepo.findOne({ where: { name: input.name } });
        if (existing) 
        {
            throw new ConflictException('Building already exists');
        }
        const b = this.buildingRepo.create({ name: input.name, description: input.description });
        return await this.buildingRepo.save(b);
    }

    async Update(input: UpdateBuildingInput): Promise<Building> 
    {
        const b = await this.buildingRepo.findOne({ where: { id: input.id } });
        if (!b) 
        {
            throw new NotFoundException('Building not found');
        }
        if (input.name && input.name !== b.name) 
        {
            const conflict = await this.buildingRepo.findOne({ where: { name: input.name } });
            if (conflict) throw new ConflictException('Building name already in use');
            b.name = input.name;
        }
        if (input.description !== undefined) b.description = input.description;
        return await this.buildingRepo.save(b);
    }

    async Remove(id: number): Promise<boolean> 
    {
        const res = await this.buildingRepo.delete(id);
        return (res.affected ?? 0) > 0;
    }
}
