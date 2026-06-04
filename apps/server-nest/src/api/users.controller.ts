import { Controller, Get, Param } from '@nestjs/common';
import { UserModel, userModel } from './model';
import { ResourceResolver } from './resource-resolver.service';

@Controller('users')
export class UsersController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get(':userId')
  async getUser(@Param('userId') userId: string): Promise<UserModel> {
    const user = await this.resolver.requireUser(userId);
    return userModel(user);
  }
}
