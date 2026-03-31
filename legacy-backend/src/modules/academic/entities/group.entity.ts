import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';

@ObjectType()
@Entity('groups')
export class Group
{
    @Field(() => ID)
    @PrimaryGeneratedColumn()
        id: number;

    @Field()
    @Column({ unique: true })
        name: string;

    @Field(() => Group, { nullable: true })
    @ManyToOne(() => Group, group => group.children, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'parent_id' })
        parent?: Group;

    @Field(() => [Group], { nullable: true })
    @OneToMany(() => Group, group => group.parent)
        children?: Group[];
}
