import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@ObjectType()
@Entity('school_years')
export class SchoolYear 
{
    @Field(() => ID)
    @PrimaryGeneratedColumn()
        id: number;

    @Field()
    @Column({ type: 'date' })
        startDate: string;

    @Field()
    @Column({ type: 'date' })
        endDate: string;

    @Field()
    @CreateDateColumn({ type: 'timestamptz' })
        createdAt: Date;
}
