import { Controller, Get, Inject, Param } from '@nestjs/common';
import { USERS } from '../domain';
import type { Users } from '../domain';
import { findUser } from './loaders';
import { UserModel, userModel } from './model';

@Controller('users')
export class UsersController {
  constructor(@Inject(USERS) private readonly users: Users) {}

  @Get(':userId')
  async getUser(@Param('userId') userId: string): Promise<UserModel> {
    const user = await findUser(this.users, userId);
    return userModel(user);
  }
}
