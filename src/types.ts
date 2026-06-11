export interface Saldo {
  origin: string; // 'Aguas' | 'PepsiCo' | 'Trenque Lauquen' | 'Salliquelo' | 'Digip'
  client: string;
  clientCode: string;
  amount: number;
  originalAmount?: number;
  paidAmount?: number;
  week: string;
  invoice: string;
  date: string | number;
  dueDate: string | number;
  situacion: string;
}

export interface StockItem {
  codigo: string;
  producto: string;
  categoria?: string;
  lote?: string;
  cantidad: number;
  fechaVencimiento: string; // YYYY-MM-DD
}

export interface SyncStatus {
  Aguas: string | null;
  PepsiCo: string | null;
  'Trenque Lauquen': string | null;
  Salliquelo: string | null;
  Digip: string | null;
  Serenisima: string | null;
}

export interface ModulePermissions {
  visible: boolean;
  writable: boolean;
}

export interface UserPermissions {
  dashboard: ModulePermissions;
  stockExpiration: ModulePermissions;
  usersManagement: ModulePermissions;
}

export interface User {
  username: string;
  displayName: string;
  role: 'admin' | 'custom';
  permissions: UserPermissions;
}
