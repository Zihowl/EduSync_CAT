import { ObjectType, Field, ID } from '@nestjs/graphql';
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
    SUPER_ADMIN = 'SUPER_ADMIN',
    ADMIN_HORARIOS = 'ADMIN_HORARIOS',
}

@ObjectType()
@Entity('users')
export class User
{
    @Field(() => ID)
    @PrimaryGeneratedColumn('uuid')
        id: string;

    @Field()
    @Column({ unique: true })
        email: string;

    @Field({ nullable: true })
    @Column({ nullable: true })
        fullName: string;

    @Column()
        password: string;

    @Field()
    @Column({ type: 'enum', enum: UserRole, default: UserRole.ADMIN_HORARIOS })
        role: UserRole;

    @Field()
    @Column({ default: true })
        isActive: boolean;

    @Column({ default: false })
        isTempPassword: boolean;

    @Field()
    @CreateDateColumn()
        createdAt: Date;

    @Field()
    @UpdateDateColumn()
        updatedAt: Date;
}
