import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@ObjectType()
@Entity('allowed_domains')
export class AllowedDomain 
{
    @Field(() => ID)
    @PrimaryGeneratedColumn()
        id: number;

    @Field()
    @Column({ unique: true })
        domain: string;
}
