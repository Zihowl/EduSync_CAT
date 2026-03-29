import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Teacher } from './teacher.entity';
import { Subject } from './subject.entity';
import { Classroom } from './classroom.entity';
import { Group } from './group.entity';
import { User } from '../../users/entities/user.entity';

@ObjectType()
@Entity('schedule_slots')
@Index(['group', 'dayOfWeek'])
@Index(['teacher', 'dayOfWeek'])
@Index(['classroom', 'dayOfWeek'])
export class ScheduleSlot
{
    @Field(() => ID)
    @PrimaryGeneratedColumn()
    id: number;

    @Field(() => Teacher)
    @ManyToOne(() => Teacher, { eager: true })
    @JoinColumn({ name: 'teacher_id' })
    teacher: Teacher;

    @Field(() => Subject)
    @ManyToOne(() => Subject, { eager: true })
    @JoinColumn({ name: 'subject_id' })
    subject: Subject;

    @Field(() => Classroom)
    @ManyToOne(() => Classroom, { eager: true })
    @JoinColumn({ name: 'classroom_id' })
    classroom: Classroom;

    @Field(() => Group)
    @ManyToOne(() => Group, { eager: true })
    @JoinColumn({ name: 'group_id' })
    group: Group;

    /** Día de la semana: 1=Lunes, 2=Martes, ..., 7=Domingo */
    @Field(() => Int)
    @Column()
    dayOfWeek: number;

    @Field()
    @Column({ type: 'time' })
    startTime: string;

    @Field()
    @Column({ type: 'time' })
    endTime: string;

    @Field(() => String, { nullable: true })
    @Column({ type: 'varchar', nullable: true })
    subgroup: string | null;

    /** Indica si el horario es visible públicamente */
    @Field()
    @Column({ default: false })
    isPublished: boolean;

    @Field(() => User, { nullable: true })
    @ManyToOne(() => User, { nullable: true, eager: true })
    @JoinColumn({ name: 'created_by_id' })
    createdBy: User | null;

    @Field()
    @CreateDateColumn()
    createdAt: Date;

    @Field()
    @UpdateDateColumn()
    updatedAt: Date;
}
