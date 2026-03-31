import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { CreateAdminInput } from './dto/create-user.input';
import { ConfigService } from '../config/config.service';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

@Injectable()
export class UsersService
{
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly configService: ConfigService,
    ) 
    {}

    async FindAll(): Promise<User[]> 
    {
        return await this.userRepository.find();
    }

    async FindOneByEmail(email: string): Promise<User | null> 
    {
        return await this.userRepository.findOneBy({ email });
    }

    async CreateAdmin(input: CreateAdminInput): Promise<User> 
    {
        await this.EnsureNotExists(input.email);
        this.EnsureEmailFormat(input.email);
        await this.EnsureDomainAllowed(input.email);
        const tempPassword = this.GenerateTempPassword(16);
        const hash = await argon2.hash(tempPassword);
        const savedUser = await this.CreateAndSaveAdmin(input, hash);
        this.SendWelcomeEmail(input.email, tempPassword);

        return savedUser;
    }

    private async EnsureNotExists(email: string) 
    {
        const existing = await this.userRepository.findOneBy({ email });
        if (existing) 
        {
            throw new ConflictException('El correo ya está registrado.');
        }
    }

    private async EnsureDomainAllowed(email: string) 
    {
        const parts = email.split('@');
        if (parts.length !== 2) throw new BadRequestException('Email inválido');
        const domain = parts[1];
        const allowedDomains = await this.configService.getAllowedDomains();
        const isAllowed = allowedDomains.some(d => d.domain === domain);
        if (!isAllowed) 
        {
            throw new BadRequestException(
                `El dominio @${domain} no está permitido en esta institución.`,
            );
        }
    }

    private EnsureEmailFormat(email: string) 
    {
        const emailPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
        if (!emailPattern.test(email)) 
        {
            throw new BadRequestException('Email inválido');
        }
    }

    private GenerateTempPassword(length: number) 
    {
        return this.GenerateComplexPassword(length);
    }

    private GenerateComplexPassword(length: number) 
    {
        if (length < 4) 
        {
            throw new BadRequestException('La longitud de la contraseña es inválida.');
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

    private PickRequiredChars(charset: ReturnType<UsersService['GetPasswordCharset']>) 
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

    private async CreateAndSaveAdmin(input: CreateAdminInput, hash: string) 
    {
        const newUser = this.userRepository.create({
            email: input.email,
            fullName: input.fullName,
            password: hash,
            role: UserRole.ADMIN_HORARIOS,
            isTempPassword: true,
            isActive: true,
        });

        return await this.userRepository.save(newUser);
    }

    private SendWelcomeEmail(email: string, pass: string) 
    {
        console.log('\n===================[SIMULACIÓN]===================');
        console.log(' CORREO ENVIADO A: ' + email);
        console.log(' Asunto: Bienvenido a EduSync!');
        console.log(` Contraseña Temporal: ${pass}`);
        console.log(' Nota: tendrá que cambiar su contraseña');
        console.log('       después del primer inicio de sesión.');
        console.log('==================================================\n');
    }
}
