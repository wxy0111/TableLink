import { BackupClient } from './backup-client';
import { AuthRequired } from '../../auth-required';
import { hasAuthToken } from '../../auth-session';

export default async function AdminBackupsPage() {
  if (!(await hasAuthToken())) return <AuthRequired title="备份恢复需要登录" />;
  return <BackupClient />;
}
