import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { UserRole } from '../../users/entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate
{
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean
    {
        const roles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!roles || roles.length === 0)
        {
            return true;
        }

        const request = this.getRequest(context);
        const user = request?.user as { role?: UserRole } | undefined;

        return !!user?.role && roles.includes(user.role);
    }

    private getRequest(context: ExecutionContext)
    {
        if (context.getType<string>() === 'http')
        {
            return context.switchToHttp().getRequest();
        }

        const ctx = GqlExecutionContext.create(context);
        return ctx.getContext().req;
    }
}
