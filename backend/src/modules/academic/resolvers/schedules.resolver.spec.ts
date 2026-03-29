import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesResolver } from './schedules.resolver';
import { SchedulesService } from '../services/schedules.service';
import { ScheduleSlot } from '../entities/schedule-slot.entity';
import { User, UserRole } from '../../users/entities/user.entity';

describe('SchedulesResolver', () =>
{
    let resolver: SchedulesResolver;
    let service: jest.Mocked<SchedulesService>;

    const mockScheduleSlot = {
        id: 1,
        teacher: { id: 1, name: 'Juan Pérez' },
        subject: { id: 1, name: 'Matemáticas' },
        classroom: { id: 1, name: 'A101' },
        group: { id: 1, name: '1A' },
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
        subgroup: null,
        isPublished: false,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    } as unknown as ScheduleSlot;

    const mockUser = {
        id: 'user-uuid',
        email: 'admin@example.com',
        role: UserRole.ADMIN_HORARIOS,
    } as User;

    beforeEach(async () =>
    {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SchedulesResolver,
                {
                    provide: SchedulesService,
                    useValue: {
                        FindAll: jest.fn(),
                        FindOne: jest.fn(),
                        Create: jest.fn(),
                        Update: jest.fn(),
                        Remove: jest.fn(),
                        SetPublished: jest.fn(),
                    },
                },
            ],
        }).compile();

        resolver = module.get<SchedulesResolver>(SchedulesResolver);
        service = module.get(SchedulesService);
    });

    it('should be defined', () =>
    {
        expect(resolver).toBeDefined();
    });

    describe('GetSchedules', () =>
    {
        it('should return all schedules', async () =>
        {
            service.FindAll.mockResolvedValue([mockScheduleSlot]);

            const result = await resolver.GetSchedules();

            expect(result).toEqual([mockScheduleSlot]);
            expect(service.FindAll).toHaveBeenCalledWith(undefined);
        });

        it('should pass filter to service', async () =>
        {
            service.FindAll.mockResolvedValue([mockScheduleSlot]);
            const filter = { groupId: 1, dayOfWeek: 1 };

            await resolver.GetSchedules(filter);

            expect(service.FindAll).toHaveBeenCalledWith(filter);
        });
    });

    describe('GetSchedule', () =>
    {
        it('should return a schedule by id', async () =>
        {
            service.FindOne.mockResolvedValue(mockScheduleSlot);

            const result = await resolver.GetSchedule(1);

            expect(result).toEqual(mockScheduleSlot);
            expect(service.FindOne).toHaveBeenCalledWith(1);
        });

        it('should return null if not found', async () =>
        {
            service.FindOne.mockResolvedValue(null);

            const result = await resolver.GetSchedule(999);

            expect(result).toBeNull();
        });
    });

    describe('CreateScheduleSlot', () =>
    {
        it('should create a new schedule slot', async () =>
        {
            const input = {
                teacherId: 1,
                subjectId: 1,
                classroomId: 1,
                groupId: 1,
                dayOfWeek: 1,
                startTime: '08:00',
                endTime: '09:00',
            };
            service.Create.mockResolvedValue(mockScheduleSlot);

            const result = await resolver.CreateScheduleSlot(input, mockUser);

            expect(result).toEqual(mockScheduleSlot);
            expect(service.Create).toHaveBeenCalledWith(input, mockUser);
        });
    });

    describe('UpdateScheduleSlot', () =>
    {
        it('should update a schedule slot', async () =>
        {
            const input = { id: 1, dayOfWeek: 2 };
            const updatedSlot = { ...mockScheduleSlot, dayOfWeek: 2 };
            service.Update.mockResolvedValue(updatedSlot as ScheduleSlot);

            const result = await resolver.UpdateScheduleSlot(input);

            expect(result.dayOfWeek).toBe(2);
            expect(service.Update).toHaveBeenCalledWith(input);
        });
    });

    describe('RemoveScheduleSlot', () =>
    {
        it('should remove a schedule slot', async () =>
        {
            service.Remove.mockResolvedValue(true);

            const result = await resolver.RemoveScheduleSlot(1);

            expect(result).toBe(true);
            expect(service.Remove).toHaveBeenCalledWith(1);
        });
    });

    describe('SetSchedulesPublished', () =>
    {
        it('should set published status for multiple schedules', async () =>
        {
            service.SetPublished.mockResolvedValue(3);

            const result = await resolver.SetSchedulesPublished([1, 2, 3], true);

            expect(result).toBe(3);
            expect(service.SetPublished).toHaveBeenCalledWith([1, 2, 3], true);
        });
    });
});
