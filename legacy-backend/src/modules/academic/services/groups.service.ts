import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from '../entities/group.entity';
import { CreateGroupInput } from '../dto/create-group.input';
import { UpdateGroupInput } from '../dto/update-group.input';

@Injectable()
export class GroupsService
{
    constructor(
        @InjectRepository(Group)
        private readonly groupRepo: Repository<Group>,
    ) 
    {}

    async FindAll(): Promise<Group[]> 
    {
        return await this.groupRepo.find({ relations: ['parent'], order: { name: 'ASC' } });
    }

    async FindOne(id: number): Promise<Group | null> 
    {
        return await this.groupRepo.findOne({ where: { id }, relations: ['parent', 'children'] });
    }

    async Create(input: CreateGroupInput): Promise<Group> 
    {
        const existing = await this.groupRepo.findOne({ where: { name: input.name } });
        if (existing) throw new ConflictException('Group already exists');

        const group = this.groupRepo.create({ name: input.name });
        if (input.parentId) 
        {
            const parent = await this.groupRepo.findOne({ where: { id: input.parentId } });
            if (!parent) throw new BadRequestException('Parent group not found');
            group.parent = parent;
        }
        return await this.groupRepo.save(group);
    }

    async Update(input: UpdateGroupInput): Promise<Group> 
    {
        const g = await this.groupRepo.findOne({ where: { id: input.id } });
        if (!g) throw new NotFoundException('Group not found');
        if (input.name && input.name !== g.name) 
        {
            const conflict = await this.groupRepo.findOne({ where: { name: input.name } });
            if (conflict) throw new ConflictException('Group name already in use');
            g.name = input.name;
        }
        if (input.parentId !== undefined) 
        {
            if (input.parentId === null) 
            {
                g.parent = undefined;
            }
            else 
            {
                const parent = await this.groupRepo.findOne({ where: { id: input.parentId } });
                if (!parent) throw new BadRequestException('Parent group not found');
                g.parent = parent;
            }
        }
        return await this.groupRepo.save(g);
    }

    async Remove(id: number): Promise<boolean> 
    {
        const res = await this.groupRepo.delete(id);
        return (res.affected ?? 0) > 0;
    }
}
