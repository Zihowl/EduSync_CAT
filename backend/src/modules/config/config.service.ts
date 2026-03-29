import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AllowedDomain } from './entities/allowed-domain.entity';
import { SchoolYear } from './entities/school-year.entity';

@Injectable()
export class ConfigService 
{
    constructor(
        @InjectRepository(AllowedDomain)
        private readonly domainRepository: Repository<AllowedDomain>,

        @InjectRepository(SchoolYear)
        private readonly schoolYearRepository: Repository<SchoolYear>,
    ) 
    {}

    async createDomain(domain: string): Promise<AllowedDomain> 
    {
        domain = this.normalizeDomain(domain);

        this.validateDomainFormat(domain);

        const existing = await this.domainRepository.findOneBy({ domain });
        if (existing)
        {
            throw new ConflictException('Domain already exists');
        }

        const newDomain = this.domainRepository.create({ domain });
        return await this.domainRepository.save(newDomain);
    }

    private normalizeDomain(domain: string): string
    {
        return (domain || '').trim().toLowerCase();
    }

    private validateDomainFormat(domain: string): void
    {
        if (!domain)
        {
            throw new BadRequestException('Domain is required.');
        }

        if (!domain.includes('.'))
        {
            throw new BadRequestException('Domain must contain a dot.');
        }

        const DOMAIN_REGEX = /^(?=.{1,255}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
        if (!DOMAIN_REGEX.test(domain))
        {
            throw new BadRequestException('Invalid domain format.');
        }
    }

    async getAllowedDomains(): Promise<AllowedDomain[]> 
    {
        return await this.domainRepository.find();
    }

    async removeDomain(id: number): Promise<boolean> 
    {
        const result = await this.domainRepository.delete(id);
        return (result.affected ?? 0) > 0;
    }

    // School year / ciclo escolar methods - single current cycle
    async setCurrentSchoolYear(startDate: string, endDate: string): Promise<SchoolYear>
    {
        if (!startDate || !endDate)
        {
            throw new BadRequestException('Start and end dates are required.');
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.valueOf()) || isNaN(end.valueOf()))
        {
            throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
        }

        if (start > end)
        {
            throw new BadRequestException('Start date must be before or equal to end date.');
        }

        // Use single record as the "current" cycle: update if exists, otherwise create
        const existingList = await this.schoolYearRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
        const existing = (existingList && existingList.length > 0) ? existingList[0] : null;
        if (existing)
        {
            existing.startDate = startDate;
            existing.endDate = endDate;
            return await this.schoolYearRepository.save(existing);
        }

        const newCycle = this.schoolYearRepository.create({ startDate, endDate });
        return await this.schoolYearRepository.save(newCycle);
    }

    async getCurrentSchoolYear(): Promise<SchoolYear | null>
    {
        // Use find with take:1 to avoid TypeORM error when using findOne without conditions
        const list = await this.schoolYearRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
        return (list && list.length > 0) ? list[0] : null;
    }
}
