import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { ScheduleSlot } from '../entities/schedule-slot.entity';
import { Teacher } from '../entities/teacher.entity';
import { Subject } from '../entities/subject.entity';
import { Classroom } from '../entities/classroom.entity';
import { Group } from '../entities/group.entity';

describe('SchedulesService', () =>
{
    let service: SchedulesService;
    let scheduleRepo: jest.Mocked<Repository<ScheduleSlot>>;
    let teacherRepo: jest.Mocked<Repository<Teacher>>;
    let subjectRepo: jest.Mocked<Repository<Subject>>;
    let classroomRepo: jest.Mocked<Repository<Classroom>>;
    let groupRepo: jest.Mocked<Repository<Group>>;

    const mockTeacher = { id: 1, employeeNumber: 'EMP001', name: 'Juan Pérez', email: 'juan@example.com' } as Teacher;
    const mockSubject = { id: 1, name: 'Matemáticas', code: 'MAT101' } as Subject;
    const mockClassroom = { id: 1, name: 'A101', capacity: 30 } as Classroom;
    const mockGroup = { id: 1, name: '1A', semester: 1 } as Group;

    const mockScheduleSlot = {
        id: 1,
        teacher: mockTeacher,
        subject: mockSubject,
        classroom: mockClassroom,
        group: mockGroup,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
        subgroup: null,
        isPublished: false,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    } as ScheduleSlot;

    const createMockQueryBuilder = () => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockScheduleSlot]),
        clone: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
    });

    beforeEach(async () =>
    {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SchedulesService,
                {
                    provide: getRepositoryToken(ScheduleSlot),
                    useValue: {
                        find: jest.fn(),
                        findOne: jest.fn(),
                        create: jest.fn(),
                        save: jest.fn(),
                        delete: jest.fn(),
                        createQueryBuilder: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(Teacher),
                    useValue: { findOne: jest.fn() },
                },
                {
                    provide: getRepositoryToken(Subject),
                    useValue: { findOne: jest.fn() },
                },
                {
                    provide: getRepositoryToken(Classroom),
                    useValue: { findOne: jest.fn() },
                },
                {
                    provide: getRepositoryToken(Group),
                    useValue: { findOne: jest.fn() },
                },
            ],
        }).compile();

        service = module.get<SchedulesService>(SchedulesService);
        scheduleRepo = module.get(getRepositoryToken(ScheduleSlot));
        teacherRepo = module.get(getRepositoryToken(Teacher));
        subjectRepo = module.get(getRepositoryToken(Subject));
        classroomRepo = module.get(getRepositoryToken(Classroom));
        groupRepo = module.get(getRepositoryToken(Group));
    });

    it('should be defined', () =>
    {
        expect(service).toBeDefined();
    });

    describe('FindAll', () =>
    {
        it('should return all schedules with default pagination', async () =>
        {
            const qb = createMockQueryBuilder();
            scheduleRepo.createQueryBuilder.mockReturnValue(qb as any);

            const result = await service.FindAll();

            expect(result).toEqual([mockScheduleSlot]);
            expect(qb.skip).toHaveBeenCalledWith(0);
            expect(qb.take).toHaveBeenCalledWith(50);
        });

        it('should filter by groupId', async () =>
        {
            const qb = createMockQueryBuilder();
            scheduleRepo.createQueryBuilder.mockReturnValue(qb as any);

            await service.FindAll({ groupId: 1 });

            expect(qb.andWhere).toHaveBeenCalledWith('slot.group_id = :groupId', { groupId: 1 });
        });

        it('should filter by isPublished', async () =>
        {
            const qb = createMockQueryBuilder();
            scheduleRepo.createQueryBuilder.mockReturnValue(qb as any);

            await service.FindAll({ isPublished: true });

            expect(qb.andWhere).toHaveBeenCalledWith('slot.isPublished = :isPublished', { isPublished: true });
        });
    });

    describe('FindOne', () =>
    {
        it('should return a schedule by id', async () =>
        {
            scheduleRepo.findOne.mockResolvedValue(mockScheduleSlot);

            const result = await service.FindOne(1);

            expect(result).toEqual(mockScheduleSlot);
            expect(scheduleRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
        });

        it('should return null if not found', async () =>
        {
            scheduleRepo.findOne.mockResolvedValue(null);

            const result = await service.FindOne(999);

            expect(result).toBeNull();
        });
    });

    describe('Create', () =>
    {
        const validInput = {
            teacherId: 1,
            subjectId: 1,
            classroomId: 1,
            groupId: 1,
            dayOfWeek: 1,
            startTime: '08:00',
            endTime: '09:00',
        };

        beforeEach(() =>
        {
            teacherRepo.findOne.mockResolvedValue(mockTeacher);
            subjectRepo.findOne.mockResolvedValue(mockSubject);
            classroomRepo.findOne.mockResolvedValue(mockClassroom);
            groupRepo.findOne.mockResolvedValue(mockGroup);

            const qb = createMockQueryBuilder();
            scheduleRepo.createQueryBuilder.mockReturnValue(qb as any);
            scheduleRepo.save.mockResolvedValue(mockScheduleSlot);
        });

        it('should create a schedule slot', async () =>
        {
            const result = await service.Create(validInput);

            expect(result).toEqual(mockScheduleSlot);
            expect(scheduleRepo.save).toHaveBeenCalled();
        });

        it('should throw BadRequestException if startTime >= endTime', async () =>
        {
            await expect(service.Create({ ...validInput, startTime: '10:00', endTime: '09:00' }))
                .rejects.toThrow(BadRequestException);
        });

        it('should throw NotFoundException if teacher not found', async () =>
        {
            teacherRepo.findOne.mockResolvedValue(null);

            await expect(service.Create(validInput))
                .rejects.toThrow(NotFoundException);
        });

        it('should throw ConflictException on teacher collision', async () =>
        {
            const qb = createMockQueryBuilder();
            qb.clone.mockReturnValue({
                andWhere: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(mockScheduleSlot),
            });
            scheduleRepo.createQueryBuilder.mockReturnValue(qb as any);

            await expect(service.Create(validInput))
                .rejects.toThrow(ConflictException);
        });
    });

    describe('Update', () =>
    {
        it('should update a schedule slot', async () =>
        {
            scheduleRepo.findOne.mockResolvedValue({ ...mockScheduleSlot });
            const qb = createMockQueryBuilder();
            scheduleRepo.createQueryBuilder.mockReturnValue(qb as any);
            scheduleRepo.save.mockResolvedValue({ ...mockScheduleSlot, dayOfWeek: 2 });

            const result = await service.Update({ id: 1, dayOfWeek: 2 });

            expect(result.dayOfWeek).toBe(2);
        });

        it('should throw NotFoundException if slot not found', async () =>
        {
            scheduleRepo.findOne.mockResolvedValue(null);

            await expect(service.Update({ id: 999 }))
                .rejects.toThrow(NotFoundException);
        });
    });

    describe('Remove', () =>
    {
        it('should delete a schedule and return true', async () =>
        {
            scheduleRepo.delete.mockResolvedValue({ affected: 1, raw: {} });

            const result = await service.Remove(1);

            expect(result).toBe(true);
        });

        it('should return false if nothing deleted', async () =>
        {
            scheduleRepo.delete.mockResolvedValue({ affected: 0, raw: {} });

            const result = await service.Remove(999);

            expect(result).toBe(false);
        });
    });
});
