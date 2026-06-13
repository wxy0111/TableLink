import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { UpsertCategoryDto } from './dto/category.dto';
import { UpsertMenuItemDto } from './dto/menu-item.dto';
import { CreateTableDto } from './dto/table.dto';

@Controller('admin')
@UseGuards(AuthGuard)
@Roles('owner', 'manager')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('categories')
  findCategories() {
    return this.adminService.findCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: UpsertCategoryDto) {
    return this.adminService.createCategory(dto);
  }

  @Patch('categories/:categoryId')
  updateCategory(@Param('categoryId') categoryId: string, @Body() dto: Partial<UpsertCategoryDto>) {
    return this.adminService.updateCategory(categoryId, dto);
  }

  @Get('menu-items')
  findMenuItems() {
    return this.adminService.findMenuItems();
  }

  @Post('menu-items')
  createMenuItem(@Body() dto: UpsertMenuItemDto) {
    return this.adminService.createMenuItem(dto);
  }

  @Patch('menu-items/:menuItemId')
  updateMenuItem(@Param('menuItemId') menuItemId: string, @Body() dto: Partial<UpsertMenuItemDto>) {
    return this.adminService.updateMenuItem(menuItemId, dto);
  }

  @Post('menu-images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), '..', '..', 'data', 'uploads', 'menu'),
        filename: (_request: Request, file: Express.Multer.File, callback: (error: Error | null, filename: string) => void) => {
          const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`;
          callback(null, safeName);
        },
      }),
      fileFilter: (_request: Request, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => {
        callback(null, file.mimetype.startsWith('image/'));
      },
    }),
  )
  uploadMenuImage(@UploadedFile() file: any) {
    return this.adminService.createImageResponse(file);
  }

  @Get('tables')
  findTables() {
    return this.adminService.findTables();
  }

  @Post('tables')
  createTable(@Body() dto: CreateTableDto) {
    return this.adminService.createTable(dto);
  }
}
