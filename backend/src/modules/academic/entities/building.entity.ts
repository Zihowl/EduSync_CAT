import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Classroom } from './classroom.entity';

@ObjectType()
@Entity('buildings')
export class Building
{
    @Field(() => ID)
    @PrimaryGeneratedColumn()
    id: number;

    @Field()
    @Column({ unique: true })
    name: string;

    @Field({ nullable: true })
    @Column({ nullable: true })
    description?: string;

    @Field(() => [Classroom], { nullable: true })
    @OneToMany(() => Classroom, classroom => classroom.building)
    classrooms?: Classroom[];
}
