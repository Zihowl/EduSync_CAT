import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../users/entities/user.entity';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap
{
    private readonly logger = new Logger(BootstrapService.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) 
    {}

    async onApplicationBootstrap() 
    {
        await this.CheckAndCreateSuperAdmin();
    }

    private async CheckAndCreateSuperAdmin() 
    {
        const count = await this.userRepository.count();

        if (count === 0) 
        {
            this.logger.warn('Empty database detected. Starting Genesis Protocol...');
            await this.CreateGenesisAdmin();
        }
    }

    private async CreateGenesisAdmin() 
    {
        const randomHex = crypto.randomBytes(4).toString('hex');
        const email = `admin-${randomHex}@setup.local`;

        const { password, hash } = await this.GenerateTempPassword(32);

        const superAdmin = this.userRepository.create({
            email,
            password: hash,
            fullName: 'Super Administrator',
            role: UserRole.SUPER_ADMIN,
            isTempPassword: true,
            isActive: true,
        });

        await this.userRepository.save(superAdmin);
        this.PrintCredentials(email, password);
    }

    private async GenerateTempPassword(length: number) 
    {
        const password = this.GenerateComplexPassword(length);
        const hash = await argon2.hash(password);
        return { password, hash };
    }

    private GenerateComplexPassword(length: number) 
    {
        if (length < 4) 
        {
            throw new Error('Password length must be at least 4.');
        }

        const charset = this.GetPasswordCharset();
        const required = this.PickRequiredChars(charset);
        const remaining = this.FillRandomChars(
            charset.all,
            length - required.length,
        );
        const combined = this.ShuffleArray([...required, ...remaining]);
        return combined.join('');
    }

    private GetPasswordCharset() 
    {
        const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lower = 'abcdefghijklmnopqrstuvwxyz';
        const numbers = '0123456789';
        const symbols = '!@#$%^&*()-_=+[]{}<>?';
        return { upper, lower, numbers, symbols, all: upper + lower + numbers + symbols };
    }

    private PickRequiredChars(charset: ReturnType<BootstrapService['GetPasswordCharset']>) 
    {
        return [
            charset.upper[crypto.randomInt(charset.upper.length)],
            charset.lower[crypto.randomInt(charset.lower.length)],
            charset.numbers[crypto.randomInt(charset.numbers.length)],
            charset.symbols[crypto.randomInt(charset.symbols.length)],
        ];
    }

    private FillRandomChars(pool: string, count: number) 
    {
        return Array.from({ length: count }, () => pool[crypto.randomInt(pool.length)]);
    }

    private ShuffleArray<T>(items: T[]) 
    {
        for (let i = items.length - 1; i > 0; i--) 
        {
            const j = crypto.randomInt(i + 1);
            [items[i], items[j]] = [items[j], items[i]];
        }

        return items;
    }

    private PrintCredentials(email: string, password: string) 
    {
        console.log('\n==================================================');
        console.log(' SUPER ADMIN TEMPORARY CREDENTIALS');
        console.log('==================================================');
        console.log(` Email:    ${email}`);
        console.log(` Password: ${password}`);
        console.log('==================================================\n');
    }
}
