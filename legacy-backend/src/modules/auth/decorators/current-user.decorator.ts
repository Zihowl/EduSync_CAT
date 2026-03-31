import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { User } from '../../users/entities/user.entity';

/**
 * Decorador para obtener el usuario autenticado en resolvers GraphQL.
 * Uso: @CurrentUser() user: User
 */
export const CurrentUser = createParamDecorator(
    (data: unknown, context: ExecutionContext): User =>
    {
        const ctx = GqlExecutionContext.create(context);
        return ctx.getContext().req.user;
    },
);
