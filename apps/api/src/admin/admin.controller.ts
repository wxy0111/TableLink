import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { UpsertCategoryDto } from './dto/category.dto';
import { UpsertMenuItemDto } from './dto/menu-item.dto';
import { UpdateMenuItemOptionDto, UpsertMenuItemOptionDto } from './dto/menu-item-option.dto';
import { UpdateMenuItemStatusDto } from './dto/menu-item-status.dto';
import { CreateTableDto } from './dto/table.dto';
import { CreateUserDto, ResetUserPinDto, UpdateUserDto } from './dto/user.dto';

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

  @Patch('menu-items/:menuItemId/status')
  updateMenuItemStatus(@Param('menuItemId') menuItemId: string, @Body() dto: UpdateMenuItemStatusDto) {
    return this.adminService.updateMenuItemStatus(menuItemId, dto.status);
  }

  @Get('menu-items/:menuItemId/options')
  findMenuItemOptions(@Req() request: AuthenticatedRequest, @Param('menuItemId') menuItemId: string) {
    return this.adminService.findMenuItemOptions(request.user!, menuItemId);
  }

  @Post('menu-items/:menuItemId/options')
  createMenuItemOption(@Req() request: AuthenticatedRequest, @Param('menuItemId') menuItemId: string, @Body() dto: UpsertMenuItemOptionDto) {
    return this.adminService.createMenuItemOption(request.user!, menuItemId, dto);
  }

  @Patch('menu-item-options/:optionId')
  updateMenuItemOption(@Req() request: AuthenticatedRequest, @Param('optionId') optionId: string, @Body() dto: UpdateMenuItemOptionDto) {
    return this.adminService.updateMenuItemOption(request.user!, optionId, dto);
  }

  @Delete('menu-item-options/:optionId')
  deleteMenuItemOption(@Req() request: AuthenticatedRequest, @Param('optionId') optionId: string) {
    return this.adminService.deleteMenuItemOption(request.user!, optionId);
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

  @Post('tables/:tableId/regenerate-code')
  regenerateTableCode(@Param('tableId') tableId: string) {
    return this.adminService.regenerateTableCode(tableId);
  }

  @Get('users')
  findUsers(@Req() request: AuthenticatedRequest) {
    return this.adminService.findUsers(request.user!);
  }

  @Post('users')
  createUser(@Req() request: AuthenticatedRequest, @Body() dto: CreateUserDto) {
    return this.adminService.createUser(request.user!, dto);
  }

  @Patch('users/:userId')
  updateUser(@Req() request: AuthenticatedRequest, @Param('userId') userId: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(request.user!, userId, dto);
  }

  @Post('users/:userId/reset-pin')
  resetUserPin(@Req() request: AuthenticatedRequest, @Param('userId') userId: string, @Body() dto: ResetUserPinDto) {
    return this.adminService.resetUserPin(request.user!, userId, dto);
  }

  @Post('users/:userId/deactivate')
  deactivateUser(@Req() request: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.adminService.deactivateUser(request.user!, userId);
  }

  @Post('users/:userId/activate')
  activateUser(@Req() request: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.adminService.activateUser(request.user!, userId);
  }
}

@Controller('staff/menu-items')
@UseGuards(AuthGuard)
@Roles('owner', 'manager', 'cashier')
export class StaffMenuItemsController {
  constructor(private readonly adminService: AdminService) {}

  @Patch(':menuItemId/status')
  updateMenuItemStatus(@Param('menuItemId') menuItemId: string, @Body() dto: UpdateMenuItemStatusDto) {
    return this.adminService.updateMenuItemStatus(menuItemId, dto.status);
  }
}
