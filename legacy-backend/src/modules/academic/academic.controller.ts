import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    UseGuards,
    Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ExcelService } from './services/excel.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/guards/roles.decorator';
import { UserRole, User } from '../users/entities/user.entity';

@Controller('academic')
export class AcademicController 
{
    constructor(private readonly excelService: ExcelService) 
    {}

    @Post('upload-schedule')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    @UseInterceptors(FileInterceptor('file'))
    async UploadSchedule(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: { user: User }
    ) 
    {
        this.ValidateUploadFile(file);

        const result = await this.excelService.ProcessScheduleFile(file.buffer, req.user);

        return {
            message: 'Procesamiento completado',
            details: result,
        };
    }

    private ValidateUploadFile(file: Express.Multer.File) 
    {
        if (!file) 
        {
            throw new BadRequestException('No se subió ningún archivo');
        }

        if (!file.originalname.match(/\.(xlsx|xls)$/)) 
        {
            throw new BadRequestException('Solo se permiten archivos Excel (.xlsx)');
        }
    }
}
