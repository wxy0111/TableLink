import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../auth/roles.decorator';
import { StaffOrdersController } from './orders.staff.controller';

describe('StaffOrdersController', () => {
  it('limits reopen to owner and manager roles', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, StaffOrdersController.prototype.reopenOrder);

    expect(roles).toEqual(['owner', 'manager']);
    expect(roles).not.toContain('cashier');
    expect(roles).not.toContain('waiter');
  });
});
