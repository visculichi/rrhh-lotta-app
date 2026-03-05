
export enum Tab {
  HOME = 'inicio',
  STAFF = 'personal',
  PROFILE = 'perfil',
  ASSISTANT = 'asistente',
  REQUESTS = 'solicitudes',
  DOCS = 'documentación',
  CHECKIN = 'ingreso',
  SETTINGS = 'ajustes',
  SCHEDULES = 'horarios',
  TELEGRAM = 'telegram'
}

export type UserRole = 'admin' | 'manager' | 'empleado';

export interface UserPermissions {
  canManageStaff?: boolean;
  canApproveRequests?: boolean;
  canManageDocs?: boolean;
  canViewSchedules?: boolean;
  canViewAssistant?: boolean;
  canViewTelegram?: boolean;
  canViewSettings?: boolean;
  canRegisterAttendance?: boolean;
}

export interface BankAccount {
  bankName: string;
  cvu_cbu: string;
}

export interface User {
  id?: string;
  name: string;
  role: UserRole;
  email?: string;
  dni?: string;
  cuil?: string;
  phone?: string;
  address?: string;
  birthDate?: string;
  bankAccounts?: BankAccount[];
  permissions: UserPermissions;
}

export interface Employee {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
  dni?: string;
  cuil?: string;
  phone?: string;
  address?: string;
  birthDate?: string;
  bankAccounts: BankAccount[];
  pin?: string;
  status: 'presente' | 'ausente' | 'franco' | 'licencia';
  checkIn: string | null;
  checkOut: string | null;
  expectedCheckIn: string;
  weeklyHours: string;
  permissions: UserPermissions;
}

export type RequestType = 'vacaciones' | 'licencia médica' | 'cambio de turno';

export interface Request {
  id: string;
  userId: string;
  userName: string;
  type: RequestType;
  reason: string;
  status: 'pendiente' | 'aprobado' | 'rechazado';
  date: string;
  peerId?: string;
  peerName?: string;
  peerAccepted?: boolean;
  metadata?: {
    certificateUrl?: string;
    startDate?: string;
    endDate?: string;
    totalDays?: number;
    rejectionReason?: string;
    dateA?: string;
    timeStartA?: string;
    timeEndA?: string;
    dateB?: string;
    timeStartB?: string;
    timeEndB?: string;
  };
}

export interface HRDocument {
  id: string;
  userId: string;
  userName?: string;
  targetUserId?: string;
  targetUserName?: string;
  title: string;
  description: string;
  fileUrl: string;
  category: 'recibo de sueldo' | 'memo' | 'tutoriales' | 'otros';
  visibility: 'public' | 'private';
  requiresSignature: boolean;
  signatureData?: string;
  date: string;
  allSignatures?: {
    id: string;
    user_id: string;
    signature_data: string;
    signed_at: string;
    profiles?: { full_name: string };
  }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
}