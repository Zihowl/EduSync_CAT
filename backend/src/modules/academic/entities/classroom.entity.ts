import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Building } from './building.entity';

@ObjectType()
@Entity('classrooms')
export class Classroom
{
    @Field(() => ID)
    @PrimaryGeneratedColumn()
    id: number;

    @Field()
    @Column()
    name: string;

    @Field(() => Building, { nullable: true })
    @ManyToOne(() => Building, building => building.classrooms, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'building_id' })
    building?: Building;
}
