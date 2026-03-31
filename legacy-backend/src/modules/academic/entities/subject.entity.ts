import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@ObjectType()
@Entity('subjects')
export class Subject
{
    @Field(() => ID)
    @PrimaryGeneratedColumn()
        id: number;

    @Field()
    @Column({ unique: true })
        code: string;

    @Field()
    @Column()
        name: string;
}
