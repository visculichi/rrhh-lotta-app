import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import {
  Home,
  FileText,
  User as UserIcon,
  MessageSquare,
  Clock,
  MapPin,
  Send,
  Loader2,
  Sparkles,
  Users,
  Briefcase,
  Database,
  X,
  Plus,
  LogOut,
  FilePlus,
  CheckSquare,
  CheckCircle,
  Upload,
  Settings,
  Shield,
  Trash2,
  Lock,
  ChevronRight,
  UserCheck,
  Calendar,
  Coffee,
  AlertCircle,
  Navigation,
  Phone,
  Home as HomeIcon,
  CreditCard,
  Landmark,
  Wallet,
  Copy,
  Check,
  Save,
  RefreshCw,
  Stethoscope,
  ArrowLeftRight,
  FileUp,
  Search,
  CalendarDays,
  Clock3,
  ArrowRightLeft,
  AlertTriangle,
  Bell,
  MessageCircle,
  FileSearch,
  PenTool,
  Download,
  Eye,
  FileBadge,
  UserPlus,
  ClipboardList,
  Fingerprint,
  Cake,
  Smartphone,
  Pencil,
  UserMinus,
  ShieldCheck,
  Paperclip,
  ArrowDownUp,
  FolderOpen,
  Files,
  ExternalLink,
  Lock as LockIcon,
  Globe,
  Stamp,
  ShieldAlert,
  Target,
  Radar,
  History,
  Timer,
  SendHorizontal,
  Power,
  Umbrella,
  Menu,
  Beaker,
  TestTube,
  Image as ImageIcon,
  FileSpreadsheet
} from 'lucide-react';
import { Layout } from './components/Layout';
import { ClockInButton } from './components/ClockInButton';
import { Tab, User, ChatMessage, Employee, Request, UserRole, UserPermissions, BankAccount, RequestType, HRDocument } from './types';
import { generateHRResponse } from './services/geminiService';
import { supabase } from './services/supabaseClient';

const SQL_VERSION = "3.8.8 (date-timezone-fix)";

// Helper para corregir visualización de fechas (evita el delay de zona horaria al usar new Date)
const formatDateDisplay = (dateStr: string | undefined | null) => {
  if (!dateStr) return '';
  // Se agrega T00:00:00 para forzar interpretación local y no UTC
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('es-AR');
};

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

const DAYS_OF_WEEK = [
  'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'
];

const getInitials = (name: string) => {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toLowerCase();
  return (parts[0][0] + (parts[parts.length - 1]?.[0] || '')).toLowerCase();
};

const getSupabaseSQL = () => {
  return `-- NEXO HR REPAIR SCRIPT v${SQL_VERSION}
-- 1. Tablas Base
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  pin text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_index integer NOT NULL, -- 0-6 (Lunes-Domingo)
  start_time text DEFAULT '09:00',
  end_time text DEFAULT '18:00',
  is_off boolean DEFAULT false,
  UNIQUE(user_id, day_index)
);

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- NUEVA TABLA PARA FIRMAS MÚLTIPLES
CREATE TABLE IF NOT EXISTS public.document_signatures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  signature_data text NOT NULL,
  signed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(document_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  check_in timestamp with time zone NOT NULL,
  check_out timestamp with time zone,
  status text DEFAULT 'en curso',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ELIMINAR RESTRICCIÓN QUE CAUSA ERROR 23514
DO $$ 
BEGIN 
    ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_status_check;
END $$;

CREATE TABLE IF NOT EXISTS public.requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  reason text,
  peer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'pendiente',
  peer_accepted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla de Configuración Global (Geo-fencing y Telegram)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);

INSERT INTO public.app_settings (key, value) 
VALUES ('office_location', '{"lat": -34.6037, "lng": -58.3816, "radius": 100}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value) 
VALUES ('telegram_config', '{"botToken": "", "chatId": "", "enabled": false}')
ON CONFLICT (key) DO NOTHING;

-- 2. Reparación de columnas en 'profiles'
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dni text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cuil text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'empleado';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_accounts jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{"canManageStaff": false, "canApproveRequests": false, "canManageDocs": false, "canViewSchedules": true, "canViewAssistant": true, "canViewTelegram": false, "canViewSettings": false, "canRegisterAttendance": true}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'ausente';

-- 3. Reparación de columnas en 'documents'
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_url text; 
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS category text DEFAULT 'otros';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS requires_signature boolean DEFAULT false;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS signature_data text; -- (Legacy, se mantiene por compatibilidad)

-- 4. Deshabilitar RLS
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signatures DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules DISABLE ROW LEVEL SECURITY;`;
};

// Componente para manejar el contador de tiempo en vivo
const LiveTimer = memo(({ startTime, getNow }: { startTime: string, getNow: () => Date }) => {
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    const update = () => {
      const now = getNow();
      const start = new Date(startTime);
      const diff = Math.max(0, now.getTime() - start.getTime());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [startTime, getNow]);

  return <span className="font-mono text-sm text-emerald-600 tabular-nums font-bold">{elapsed}</span>;
});

const RequestItem = memo(({
  req,
  currentUser,
  hasPermission,
  handlePeerAccept,
  handlePeerReject,
  handleApproveRequest,
  openDeleteRequestModal,
  setRejectingRequestId,
  setApprovingMedicalRequestId
}: {
  req: Request,
  currentUser: User | null,
  hasPermission: (perm: keyof UserPermissions) => boolean,
  handlePeerAccept: (id: string) => void,
  handlePeerReject: (id: string) => void,
  handleApproveRequest: (id: string, status: string, reason?: string) => void,
  openDeleteRequestModal: (id: string) => void,
  setRejectingRequestId: (id: string) => void,
  setApprovingMedicalRequestId: (id: string) => void
}) => {
  const isPeer = req.peerId && currentUser?.id && String(req.peerId) === String(currentUser.id);
  const needsPeerAction = isPeer && !req.peerAccepted && req.status === 'pendiente';

  const canApprove = (
    (currentUser?.role === 'admin' || currentUser?.role === 'manager') &&
    (req.type !== 'cambio de turno' || req.peerAccepted) &&
    req.status === 'pendiente'
  );

  const canDelete = currentUser?.role === 'admin' && (req.status === 'rechazado' || req.status === 'aprobado');

  return (
    <div key={req.id} className="bg-white/80 backdrop-blur-xl p-8 rounded-[48px] border border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center shadow-lg transition-all hover:shadow-2xl gap-8 animate-in slide-in-from-bottom duration-500">
      <div className="flex-1 w-full">
        <div className="flex items-center gap-6 mb-4">
          <div className={`p-4 rounded-[24px] shadow-sm ${req.type === 'cambio de turno' ? 'bg-amber-500 text-white' :
            req.type === 'licencia médica' ? 'bg-rose-500 text-white' :
              'bg-indigo-600 text-white'
            }`}>
            {req.type === 'cambio de turno' ? <ArrowRightLeft size={24} /> : <CalendarDays size={24} />}
          </div>
          <div>
            <p className="font-bold text-midnight text-xl tracking-tight capitalize">{req.type} <span className="text-slate-300 font-light mx-2">|</span> {req.userName}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">creado el {req.date}</p>
          </div>
        </div>
        <div className="space-y-3 mt-5 ml-2">
          {req.type === 'vacaciones' && req.metadata?.startDate && (
            <div className="flex items-center gap-3 mb-2 bg-indigo-50/50 p-3 rounded-2xl w-fit">
              <Calendar size={14} className="text-indigo-500" />
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                {req.metadata.startDate} al {req.metadata.endDate} ({req.metadata.totalDays} días)
              </span>
            </div>
          )}
          {req.type === 'licencia médica' && req.metadata?.startDate && (
            <div className="flex items-center gap-3 mb-2 bg-rose-50/50 p-3 rounded-2xl w-fit">
              <Calendar size={14} className="text-rose-500" />
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">
                periodo solicitado: {req.metadata.startDate} {req.metadata.endDate ? `al ${req.metadata.endDate}` : ''}
              </span>
            </div>
          )}
          {req.type === 'cambio de turno' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest block mb-1">turno {req.userName}</span>
                <span className="text-[10px] font-bold text-midnight">{req.metadata?.dateA} | {req.metadata?.timeStartA}-{req.metadata?.timeEndA}hs</span>
              </div>
              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
                <span className="text-[8px] text-amber-500 font-bold uppercase tracking-widest block mb-1">turno {req.peerName || 'compañero'}</span>
                <span className="text-[10px] font-bold text-midnight">{req.metadata?.dateB} | {req.metadata?.timeStartB}-{req.metadata?.timeEndB}hs</span>
              </div>
            </div>
          )}
          <p className="text-sm text-slate-500 font-medium italic mb-4 opacity-80 lowercase">"{req.reason || 'sin detalle adicional'}"</p>
          {req.status === 'rechazado' && req.metadata?.rejectionReason && (
            <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 mt-4">
              <span className="text-[8px] text-rose-400 font-bold uppercase tracking-widest block mb-1">motivo de rechazo</span>
              <p className="text-xs text-rose-600 font-medium lowercase">"{req.metadata.rejectionReason}"</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-5 min-w-[200px] w-full md:w-auto">
        <div className="flex items-center gap-3">
          {req.type === 'cambio de turno' && req.status === 'pendiente' && (
            <span className={`px-4 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest border ${req.peerAccepted ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
              {req.peerAccepted ? 'compañero aceptó ✓' : 'esperando compañero ⏳'}
            </span>
          )}
          {canDelete && (
            <button onClick={() => openDeleteRequestModal(req.id)} className="p-3 text-rose-400 hover:bg-rose-50 rounded-xl transition-all shadow-sm"><Trash2 size={22} /></button>
          )}
          <span className={`px-6 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-sm ${req.status === 'aprobado' ? 'bg-emerald-500 text-white' :
            req.status === 'rechazado' ? 'bg-rose-500 text-white' :
              'bg-slate-100 text-slate-400'
            }`}> {req.status} </span>
        </div>
        <div className="flex gap-3">
          {needsPeerAction && (
            <div className="flex gap-2">
              <button
                onClick={() => handlePeerAccept(req.id)}
                className="px-6 py-4 bg-emerald-500 text-white rounded-[24px] text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-xl flex items-center gap-2"
              >
                <Check size={16} /> aceptar
              </button>
              <button
                onClick={() => handlePeerReject(req.id)}
                className="px-6 py-4 bg-rose-500 text-white rounded-[24px] text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-xl flex items-center gap-2"
              >
                <X size={16} /> rechazar
              </button>
            </div>
          )}
          {canApprove && (
            <>
              <button
                onClick={() => req.type === 'licencia médica' ? setApprovingMedicalRequestId(req.id) : handleApproveRequest(req.id, 'aprobado')}
                title="autorizar (gestión)"
                className="p-4 bg-midnight text-white rounded-[24px] hover:scale-110 shadow-lg transition-all flex items-center gap-2 px-6"
              >
                <CheckCircle size={20} /> <span className="text-[9px] font-bold uppercase tracking-widest">autorizar</span>
              </button>
              <button onClick={() => setRejectingRequestId(req.id)} title="rechazar (gestión)" className="p-4 bg-rose-100 text-rose-500 rounded-[24px] hover:scale-110 shadow-lg transition-all"><X size={24} /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [docs, setDocs] = useState<HRDocument[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [myShifts, setMyShifts] = useState<any[]>([]);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [isClocking, setIsClocking] = useState(false);
  const [myCheckInTime, setMyCheckInTime] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [officeLocation, setOfficeLocation] = useState({ lat: -34.6037, lng: -58.3816, radius: 100 });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [distanceToOffice, setDistanceToOffice] = useState<number | null>(null);

  const [telegramConfig, setTelegramConfig] = useState({ botToken: '', chatId: '', enabled: false });
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);

  const [notifyEmail, setNotifyEmail] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const [exportDates, setExportDates] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [exportSelectedUserId, setExportSelectedUserId] = useState('');

  const [isLabMode, setIsLabMode] = useState(false);
  const [simulatedDateTime, setSimulatedDateTime] = useState<string>('');
  const [simulatedLat, setSimulatedLat] = useState<string>('');
  const [simulatedLng, setSimulatedLng] = useState<string>('');

  const [showLicensesModal, setShowLicensesModal] = useState(false);

  const getNow = useCallback(() => {
    if (isLabMode && simulatedDateTime) {
      return new Date(simulatedDateTime);
    }
    return new Date();
  }, [isLabMode, simulatedDateTime]);

  const getPosition = useCallback(async (): Promise<GeolocationPosition> => {
    if (isLabMode && simulatedLat && simulatedLng) {
      return {
        coords: {
          latitude: parseFloat(simulatedLat),
          longitude: parseFloat(simulatedLng),
          accuracy: 1,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      } as GeolocationPosition;
    }

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("gps no disponible"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      });
    });
  }, [isLabMode, simulatedLat, simulatedLng]);

  const [employeeSchedules, setEmployeeSchedules] = useState<any[]>([]);
  const [allSchedules, setAllSchedules] = useState<any[]>([]);
  const [scheduleSelectedUserId, setScheduleSelectedUserId] = useState<string>('');

  const [showSqlModal, setShowSqlModal] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [signingDocId, setSigningDocId] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [historySelectedUserId, setHistorySelectedUserId] = useState<string>('');
  const [showEditShiftModal, setShowEditShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState<any>(null);

  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string; name: string; type: 'employee' | 'request' | 'document' | 'shift' }>({
    isOpen: false, id: '', name: '', type: 'employee'
  });

  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [approvingMedicalRequestId, setApprovingMedicalRequestId] = useState<string | null>(null);
  const [approvalStartDate, setApprovalStartDate] = useState('');
  const [approvalEndDate, setApprovalEndDate] = useState('');

  const [toasts, setToasts] = useState<Notification[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const hasNotified = useRef(false);

  const [newEmployee, setNewEmployee] = useState({
    name: '', email: '', dni: '', cuil: '', phone: '', address: '', birthDate: '', role: 'empleado' as UserRole, pin: '',
    bankAccounts: [{ bankName: '', cvu_cbu: '' }] as BankAccount[],
    permissions: {
      canManageStaff: false,
      canApproveRequests: false,
      canManageDocs: false,
      canViewSchedules: true,
      canViewAssistant: true,
      canViewTelegram: false,
      canViewSettings: false,
      canRegisterAttendance: true
    } as UserPermissions
  });
  const [newRequest, setNewRequest] = useState({
    type: 'vacaciones' as RequestType, reason: '', peerId: '', metadata: {
      startDate: '', endDate: '', totalDays: 0, certificateUrl: '',
      dateA: '', timeStartA: '09:00', timeEndA: '17:30',
      dateB: '', timeStartB: '09:00', timeEndB: '17:30'
    } as any
  });
  const [newDoc, setNewDoc] = useState({
    title: '',
    description: '',
    fileUrl: '',
    category: 'otros' as any,
    visibility: 'public' as 'public' | 'private',
    targetUserId: '',
    requiresSignature: false
  });
  const [isSaving, setIsSaving] = useState(false);

  const addToast = useCallback((title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addToast("copiado", `${label} listo para pegar`, "success");
  };

  useEffect(() => {
    fetchEmployees();
    fetchAppSettings();
    fetchAllSchedules();
    const timer = setInterval(() => setCurrentTime(getNow()), 1000);
    return () => clearInterval(timer);
  }, [getNow]);

  useEffect(() => {
    if (currentUser) {
      setHistorySelectedUserId(currentUser.id || '');
      setScheduleSelectedUserId(currentUser.id || '');
    }
  }, [currentUser]);

  useEffect(() => {
    if (historySelectedUserId) {
      fetchMyShifts(historySelectedUserId);
    }
  }, [historySelectedUserId]);

  useEffect(() => {
    if (scheduleSelectedUserId) {
      fetchSchedule(scheduleSelectedUserId);
    }
  }, [scheduleSelectedUserId]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser || !isClockedIn) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = (isLabMode && simulatedLat) ? parseFloat(simulatedLat) : pos.coords.latitude;
        const lng = (isLabMode && simulatedLng) ? parseFloat(simulatedLng) : pos.coords.longitude;

        const dist = calculateDistance(
          lat, lng,
          officeLocation.lat, officeLocation.lng
        );
        setDistanceToOffice(dist);
      },
      (err) => console.debug("GPS Monitor Standby"),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isLoggedIn, currentUser, isClockedIn, officeLocation, isLabMode, simulatedLat, simulatedLng]);

  useEffect(() => {
    if (isLoggedIn && dataLoaded && !hasNotified.current && currentUser) {
      const pendingPeerReview = requests.filter(r => r.peerId === currentUser.id && r.status === 'pendiente' && !r.peerAccepted);
      if (pendingPeerReview.length > 0) {
        addToast("novedades", `tienes ${pendingPeerReview.length} solicitud(es) de cambio de turno pendientes`, "info");
      }

      if (currentUser.role === 'admin' || currentUser.role === 'manager') {
        const pendingApprovals = requests.filter(r => r.status === 'pendiente' && (r.type !== 'cambio de turno' || r.peerAccepted));
        if (pendingApprovals.length > 0) {
          addToast("gestión", `hay ${pendingApprovals.length} trámite(s) esperando autorización`, "warning");
        }
      }

      const pendingSignatures = docs.filter(d => d.visibility === 'private' && d.targetUserId === currentUser.id && d.requiresSignature && !d.signatureData);
      if (pendingSignatures.length > 0) {
        addToast("documentación", `tienes ${pendingSignatures.length} documento(s) pendiente(s) de firma`, "warning");
      }

      hasNotified.current = true;
    }
  }, [dataLoaded, isLoggedIn, currentUser, requests, docs, addToast]);

  useEffect(() => {
    if (!isLoggedIn) {
      hasNotified.current = false;
      setDataLoaded(false);
    }
  }, [isLoggedIn]);

  const hasPermission = useCallback((perm: keyof UserPermissions) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return !!currentUser.permissions[perm];
  }, [currentUser]);

  const fetchAppSettings = async () => {
    if (!supabase) return;
    try {
      const { data: locData } = await supabase.from('app_settings').select('value').eq('key', 'office_location').maybeSingle();
      if (locData) setOfficeLocation(locData.value);

      const { data: telData } = await supabase.from('app_settings').select('value').eq('key', 'telegram_config').maybeSingle();
      if (telData) setTelegramConfig(telData.value);

      const { data: emailData } = await supabase.from('app_settings').select('value').eq('key', 'notify_email').maybeSingle();
      if (emailData && emailData.value?.email) setNotifyEmail(emailData.value.email);
    } catch (e) { console.error(e); }
  };

  const fetchSchedule = async (userId: string) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('schedules').select('*').eq('user_id', userId).order('day_index', { ascending: true });
      if (error) throw error;

      const fullSchedule = DAYS_OF_WEEK.map((_, index) => {
        const existing = data?.find(s => s.day_index === index);
        const st = existing?.start_time || '09:00';
        const et = existing?.end_time || '18:00';
        const is_double = st.includes(',') || et.includes(',');

        return {
          user_id: userId,
          day_index: index,
          start_time: is_double ? st.split(',')[0] : st,
          end_time: is_double ? et.split(',')[0] : et,
          start_time_2: is_double ? (st.split(',')[1] || '14:00') : '14:00',
          end_time_2: is_double ? (et.split(',')[1] || '18:00') : '18:00',
          is_double_shift: is_double,
          is_off: existing?.is_off || false
        };
      });
      setEmployeeSchedules(fullSchedule);
    } catch (e) { console.error(e); }
  };

  const fetchAllSchedules = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('schedules').select('*');
      if (error) throw error;
      const parsedData = (data || []).map(s => {
        const st = s.start_time || '09:00';
        const et = s.end_time || '18:00';
        const is_double = st.includes(',') || et.includes(',');
        return {
          ...s,
          start_time: is_double ? st.split(',')[0] : st,
          end_time: is_double ? et.split(',')[0] : et,
          start_time_2: is_double ? (st.split(',')[1] || '14:00') : '14:00',
          end_time_2: is_double ? (et.split(',')[1] || '18:00') : '18:00',
          is_double_shift: is_double
        };
      });
      setAllSchedules(parsedData);
    } catch (e) { console.error(e); }
  };

  const handleSaveSchedule = async () => {
    if (!supabase || !scheduleSelectedUserId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('schedules').upsert(
        employeeSchedules.map(s => ({
          user_id: scheduleSelectedUserId,
          day_index: s.day_index,
          start_time: s.is_double_shift ? `${s.start_time},${s.start_time_2}` : s.start_time,
          end_time: s.is_double_shift ? `${s.end_time},${s.end_time_2}` : s.end_time,
          is_off: s.is_off
        })),
        { onConflict: 'user_id,day_index' }
      );
      if (error) throw error;
      addToast("horarios", "cronograma actualizado correctamente", "success");
      await fetchSchedule(scheduleSelectedUserId);
      await fetchAllSchedules();
    } catch (e) { addToast("error", "no se pudo guardar el horario", "error"); }
    finally { setIsSaving(false); }
  };

  const handleSaveAppSettings = async () => {
    if (!supabase || currentUser?.role !== 'admin') return;
    setIsSavingSettings(true);
    try {
      const cleanLocation = {
        ...officeLocation,
        lat: parseFloat(officeLocation.lat as any) || 0,
        lng: parseFloat(officeLocation.lng as any) || 0
      };
      const { error } = await supabase.from('app_settings').upsert({ key: 'office_location', value: cleanLocation });
      if (error) throw error;
      setOfficeLocation(cleanLocation);
      addToast("ajustes", "ubicación del local actualizada", "success");
    } catch (e) { addToast("error", "no se pudo guardar la ubicación", "error"); }
    finally { setIsSavingSettings(false); }
  };

  const handleSaveTelegramConfig = async () => {
    if (!supabase || currentUser?.role !== 'admin') return;
    setIsSavingTelegram(true);
    try {
      const { error } = await supabase.from('app_settings').upsert({ key: 'telegram_config', value: telegramConfig });
      if (error) throw error;
      addToast("telegram", "configuración del bot actualizada", "success");
    } catch (e) { addToast("error", "no se pudo guardar la configuración", "error"); }
    finally { setIsSavingTelegram(false); }
  };

  const handleSaveNotifyEmail = async () => {
    if (!supabase || currentUser?.role !== 'admin') return;
    setIsSavingEmail(true);
    try {
      const { error } = await supabase.from('app_settings').upsert({ key: 'notify_email', value: { email: notifyEmail } });
      if (error) throw error;
      addToast("ajustes", "correo guardado correctamente", "success");
    } catch (e) { addToast("error", "no se pudo guardar el correo", "error"); }
    finally { setIsSavingEmail(false); }
  };

  const sendTelegramNotification = async (message: string) => {
    if (!telegramConfig.enabled || !telegramConfig.botToken || !telegramConfig.chatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
    } catch (e) { console.error("telegram notify error:", e); }
  };

  const handleTestTelegram = async () => {
    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      addToast("datos incompletos", "ingresa el token y el id del chat", "warning");
      return;
    }
    setIsTestingTelegram(true);
    try {
      const resp = await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text: `🔔 <b>nexo hr: prueba de conexión exitosa</b>\nestás recibiendo este mensaje porque la configuración del bot es correcta.\n\n👤 configurado por: ${currentUser?.name}\n🕒 hora: ${getNow().toLocaleTimeString()}`,
          parse_mode: 'HTML'
        })
      });
      const data = await resp.json();
      if (data.ok) addToast("telegram", "mensaje de prueba enviado con éxito", "success");
      else throw new Error(data.description);
    } catch (e: any) { addToast("error telegram", e.message || "falló el envío de prueba", "error"); }
    finally { setIsTestingTelegram(false); }
  };

  const fetchEmployees = async () => {
    if (!supabase) return;
    try {
      const { data: emps, error } = await supabase.from('profiles').select('*').order('full_name', { ascending: true });
      const { data: activeShifts } = await supabase.from('shifts').select('*').is('check_out', null);
      if (error) throw error;
      const employeesList: Employee[] = (emps || []).map(e => {
        const activeShift = activeShifts?.find(s => s.user_id === e.id);
        return {
          id: e.id, name: e.full_name, role: (e.role as UserRole) || 'empleado', email: e.email, dni: e.dni, cuil: e.cuil, phone: e.phone, address: e.address, birthDate: e.birth_date, bankAccounts: e.bank_accounts || [], pin: e.pin, status: activeShift ? 'presente' : (e.status || 'ausente'), checkIn: activeShift ? activeShift.check_in : null, checkOut: null, expectedCheckIn: '09:00', weeklyHours: '0h', permissions: e.permissions || { canApproveRequests: false, canManageStaff: false, canManageDocs: false, canViewSchedules: true, canViewAssistant: true, canViewTelegram: false, canViewSettings: false, canRegisterAttendance: true }
        };
      });
      setEmployees(employeesList);

      if (currentUser) {
        const me = employeesList.find(e => e.id === currentUser.id);
        if (me) {
          setIsClockedIn(me.status === 'presente');
          setMyCheckInTime(me.checkIn);
        }
      }
    } catch (e) { console.error(e); }
  };

  const fetchMyShifts = async (userId: string) => {
    if (!supabase) return;
    try {
      const oneMonthAgo = getNow();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 31);

      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
        .gte('check_in', oneMonthAgo.toISOString())
        .order('check_in', { ascending: false });

      if (data) setMyShifts(data);
    } catch (e) { console.error(e); }
  };

  const calculateAttendanceTotals = (shifts: any[]) => {
    const now = getNow();
    const todayStr = now.toLocaleDateString('es-AR');
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let hoursToday = 0;
    let hoursMonth = 0;

    shifts.forEach(s => {
      const cin = new Date(s.check_in);
      const cout = s.check_out ? new Date(s.check_out) : null;
      if (!cout) return;

      const durationHours = (cout.getTime() - cin.getTime()) / 3600000;

      if (cin.toLocaleDateString('es-AR') === todayStr) {
        hoursToday += durationHours;
      }

      if (cin >= monthStart) {
        hoursMonth += durationHours;
      }
    });

    return { today: hoursToday.toFixed(1), month: hoursMonth.toFixed(1) };
  };

  const handleUpdateShift = async () => {
    if (!editingShift || !supabase) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('shifts')
        .update({
          check_in: editingShift.check_in,
          check_out: editingShift.check_out,
          status: editingShift.check_out ? 'completo' : 'en curso'
        })
        .eq('id', editingShift.id);

      if (error) throw error;
      addToast("asistencia", "registro actualizado", "success");
      setShowEditShiftModal(false);
      setEditingShift(null);
      await fetchMyShifts(historySelectedUserId);
      await fetchEmployees();
    } catch (e) { addToast("error", "no se pudo actualizar el registro", "error"); }
    finally { setIsSaving(false); }
  };

  const handleManualCheckout = async (userId: string) => {
    if (!supabase || (!hasPermission('canManageStaff') && currentUser?.role !== 'manager' && currentUser?.role !== 'admin')) return;
    setIsSaving(true);
    try {
      const now = getNow();
      const { data: openShift } = await supabase.from('shifts').select('*').eq('user_id', userId).is('check_out', null).order('check_in', { ascending: false }).limit(1).maybeSingle();

      if (openShift) {
        const checkInDate = new Date(openShift.check_in);
        const dayIndex = (checkInDate.getDay() + 6) % 7;
        const sched = allSchedules.find(s => s.user_id === userId && s.day_index === dayIndex);

        let checkoutTimestamp = now.toISOString();
        if (sched && !sched.is_off && sched.end_time) {
          const [h, m] = sched.end_time.split(':').map(Number);
          const targetDate = new Date(checkInDate);
          targetDate.setHours(h, m, 0, 0);
          checkoutTimestamp = targetDate.toISOString();
        }

        const { error: shiftErr } = await supabase.from('shifts').update({
          check_out: checkoutTimestamp,
          status: 'completo (manual)'
        }).eq('id', openShift.id);

        if (shiftErr) throw shiftErr;

        const { error: profileErr } = await supabase.from('profiles').update({ status: 'ausente' }).eq('id', userId);
        if (profileErr) throw profileErr;

        setEmployees(prev => prev.map(emp => {
          if (emp.id === userId) {
            return { ...emp, status: 'ausente', checkIn: null };
          }
          return emp;
        }));

        if (currentUser && userId === currentUser.id) {
          setIsClockedIn(false);
          setMyCheckInTime(null);
        }

        const outTimeStr = new Date(checkoutTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        addToast("asistencia", `egreso manual registrado (${outTimeStr}hs)`, 'info');
        const emp = employees.find(e => e.id === userId);
        sendTelegramNotification(`🚪 <b>MARCÓ SALIDA (MANUAL): ${emp?.name.toUpperCase()}</b>\n📅 FECHA: ${checkInDate.toLocaleDateString('es-AR')}\n🕒 HORA: ${outTimeStr}`);

        if (historySelectedUserId === userId) {
          await fetchMyShifts(userId);
        }
      }
    } catch (e) {
      console.error(e);
      addToast("error", "no se pudo cerrar el turno", "error");
    }
    finally { setIsSaving(false); }
  };

  const handleExportAttendance = async (format: 'csv' | 'xlsx') => {
    if (!supabase) return;
    setIsSaving(true);
    try {
      let query = supabase
        .from('shifts')
        .select('*, profiles(full_name)')
        .gte('check_in', `${exportDates.from}T00:00:00Z`)
        .lte('check_in', `${exportDates.to}T23:59:59Z`);

      if (exportSelectedUserId) {
        query = query.eq('user_id', exportSelectedUserId);
      }

      const { data, error } = await query.order('check_in', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        addToast("reporte", "no hay novedades en el rango seleccionado", "warning");
        return;
      }

      const rows = data.map(s => {
        const cin = new Date(s.check_in);
        const cout = s.check_out ? new Date(s.check_out) : null;
        let duration = '--';
        if (cout) {
          const diff = (cout.getTime() - cin.getTime()) / 3600000;
          duration = `${diff.toFixed(2)} hs`;
        }
        return {
          Nombre: s.profiles?.full_name || 'anónimo',
          Fecha: cin.toLocaleDateString('es-AR'),
          Ingreso: cin.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          Egreso: cout ? cout.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
          Estado: s.status,
          Total: duration
        };
      });

      const headers = Object.keys(rows[0]);
      const csvContent = [
        headers.join(';'),
        ...rows.map(row => headers.map(h => `"${row[h as keyof typeof row]}"`).join(';'))
      ].join('\n');

      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `asistencia_${exportDates.from}_al_${exportDates.to}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addToast("reporte", "descarga CSV compatible con Excel iniciada", "success");
    } catch (e) {
      addToast("error", "falló la generación del reporte", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const fetchDocuments = async (currentU?: User) => {
    const user = currentU || currentUser;
    if (!supabase || !user) return;
    try {
      const { data: dcs, error } = await supabase.from('documents').select(`*`).order('created_at', { ascending: false });

      let allSigs: any[] = [];
      if (user.role === 'admin' || user.role === 'manager') {
        const { data } = await supabase.from('document_signatures').select('*, profiles(full_name)');
        if (data) allSigs = data;
      } else {
        const { data } = await supabase.from('document_signatures').select('document_id, signature_data, signed_at').eq('user_id', user.id);
        if (data) allSigs = data.map(s => ({ ...s, user_id: user.id }));
      }

      if (error) throw error;
      if (dcs) {
        const mappedDocs: HRDocument[] = dcs
          .filter(d => {
            if (user.role === 'admin') return true;
            if (d.visibility === 'public') return true;
            if (user && d.user_id === user.id) return true;
            if (user && d.target_user_id === user.id) return true;
            return false;
          })
          .map(d => {
            const author = employees.find(e => e.id === d.user_id);
            const targetUser = employees.find(e => e.id === d.target_user_id);

            const docSigs = allSigs.filter(s => s.document_id === d.id);
            const mySig = docSigs.find(s => s.user_id === user.id);
            const legacySig = d.visibility === 'private' && d.target_user_id === user.id ? d.signature_data : null;

            return {
              id: d.id,
              userId: d.user_id,
              userName: author?.name || 'anónimo',
              targetUserId: d.target_user_id,
              targetUserName: targetUser?.name,
              title: d.title,
              description: d.description,
              fileUrl: d.file_url,
              category: d.category,
              visibility: d.visibility || 'public',
              requiresSignature: d.requires_signature || false,
              signatureData: mySig ? mySig.signature_data : legacySig,
              date: new Date(d.created_at).toLocaleDateString(),
              allSignatures: (user.role === 'admin' || user.role === 'manager') ? docSigs : undefined
            };
          });
        setDocs(mappedDocs);
      }
    } catch (err) { console.error(err); }
  };

  const handleSignDocument = async () => {
    if (!currentUser || !signingDocId) return;
    setIsSaving(true);
    try {
      const signatureStamp = `FIRMA ELECTRÓNICA REGISTRADA - ${currentUser.name.toUpperCase()} - DNI: ${currentUser.dni || 'NO REGISTRADO'} - DECLARO MI TOTAL CONFORMIDAD CON EL DOCUMENTO ID: ${signingDocId.substring(0, 8)} - FECHA: ${getNow().toLocaleString('es-AR')}`;

      const { error } = await supabase.from('document_signatures').insert({
        document_id: signingDocId,
        user_id: currentUser.id,
        signature_data: signatureStamp
      });

      const doc = docs.find(d => d.id === signingDocId);
      if (doc && doc.visibility === 'private') {
        await supabase.from('documents').update({ signature_data: signatureStamp }).eq('id', signingDocId);
      }

      if (error) throw error;
      addToast("documentación", "firma con validez legal registrada", "success");
      setSigningDocId(null);
      await fetchDocuments();
    } catch (e: any) {
      if (e.code === '23505') {
        addToast("aviso", "ya has firmado este documento previamente", "info");
        setSigningDocId(null);
      } else {
        addToast("error", "falló el proceso de firma", "error");
      }
    }
    finally { setIsSaving(false); }
  };

  const loadInitialData = async (user: User) => {
    if (!supabase) return;
    try {
      const { data: reqs, error } = await supabase.from('requests').select(`*`).order('created_at', { ascending: false });
      if (error) throw error;
      if (reqs) {
        const mappedReqs = reqs.map(r => {
          const author = employees.find(e => e.id === r.user_id);
          const peer = employees.find(e => e.id === r.peer_id);
          return {
            id: r.id, userId: r.user_id, userName: author?.name || 'desconocido', type: r.type as any, reason: r.reason, status: r.status as any, peerId: r.peer_id, peerName: peer?.name, peerAccepted: r.peer_accepted, metadata: r.metadata, date: new Date(r.created_at).toLocaleDateString()
          };
        });
        setRequests(mappedReqs);
      }
      await fetchDocuments(user);
      if (user.id) {
        await fetchMyShifts(user.id);
        await fetchSchedule(user.id);
      }
      setDataLoaded(true);
    } catch (err) { console.error(err); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isAdminMode) {
      if (loginPin === '2025') {
        setLoginError(''); setIsLoggingIn(true);
        try {
          const masterAdmin: User = {
            id: 'master-admin',
            name: 'Administrador Maestro',
            role: 'admin',
            permissions: {
              canManageStaff: true,
              canApproveRequests: true,
              canManageDocs: true,
              canViewSchedules: true,
              canViewAssistant: true,
              canViewTelegram: true,
              canViewSettings: true,
              canRegisterAttendance: true
            }
          };
          setCurrentUser(masterAdmin);
          setIsLoggedIn(true);
          addToast("bienvenido", "Acceso Maestro Activado", 'success');
          return;
        } finally { setIsLoggingIn(false); }
      } else {
        setLoginError('pin maestro incorrecto');
        return;
      }
    }

    if (!selectedUserId) { setLoginError('seleccionar personal'); return; }
    setLoginError(''); setIsLoggingIn(true); setDataLoaded(false); hasNotified.current = false;
    try {
      const selectedEmployee = employees.find(emp => emp.id === selectedUserId);
      if (selectedEmployee && String(selectedEmployee.pin) === String(loginPin)) {
        const loggedUser: User = { id: selectedEmployee.id, name: selectedEmployee.name, role: selectedEmployee.role, email: selectedEmployee.email, dni: selectedEmployee.dni, cuil: selectedEmployee.cuil, phone: selectedEmployee.phone, address: selectedEmployee.address, birthDate: selectedEmployee.birthDate, permissions: selectedEmployee.permissions };
        setCurrentUser(loggedUser);
        setIsClockedIn(selectedEmployee.status === 'presente');
        setMyCheckInTime(selectedEmployee.checkIn);
        setIsLoggedIn(true);
        await loadInitialData(loggedUser);
        addToast("bienvenido", `${selectedEmployee.name.split(' ')[0]}, iniciado`, 'success');
      } else { setLoginError('pin incorrecto'); }
    } catch (err) { setLoginError('error conexión'); } finally { setIsLoggingIn(false); }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = parseFloat(lat1 as any) * Math.PI / 180;
    const φ2 = parseFloat(lat2 as any) * Math.PI / 180;
    const Δφ = (parseFloat(lat2 as any) - parseFloat(lat1 as any)) * Math.PI / 180;
    const Δλ = (parseFloat(lon2 as any) - parseFloat(lon1 as any)) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleClockAction = async (type: 'in' | 'out') => {
    if (isClocking || !currentUser?.id) return;
    if (type === 'in' && isClockedIn) return;
    if (type === 'out' && !isClockedIn) return;

    setIsClocking(true);

    try {
      let position: GeolocationPosition | null = null;
      try {
        position = await getPosition();
      } catch (geoErr) {
        console.warn("GPS failed", geoErr);
        if (type === 'out') {
          addToast("error", "no puedes dar egreso. comunícate con tu supervisor por estar fuera de rango", "error");
          setIsClocking(false);
          return;
        } else {
          throw new Error("Se requiere ubicación GPS válida para registrar el ingreso.");
        }
      }

      let dist = calculateDistance(
        position.coords.latitude, position.coords.longitude,
        officeLocation.lat, officeLocation.lng
      );
      setDistanceToOffice(dist);

      const effectiveRadius = type === 'out' ? officeLocation.radius * 1.5 : officeLocation.radius;

      if (dist > effectiveRadius) {
        if (type === 'out') {
          addToast("error", "no puedes dar egreso. comunícate con tu supervisor por estar fuera de rango", "error");
          setIsClocking(false);
          return;
        } else {
          const errorMsg = `estás a ${Math.round(dist)}m del local. límite permitido: ${officeLocation.radius}m`;
          addToast("error de ubicación", errorMsg, "error");
          setIsClocking(false);
          return;
        }
      }

      const now = getNow();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = now.toLocaleDateString('es-AR');

      if (type === 'in') {
        await supabase.from('shifts').insert([{ user_id: currentUser.id, check_in: now.toISOString(), status: 'en curso' }]);
        await supabase.from('profiles').update({ status: 'presente' }).eq('id', currentUser.id);
        setIsClockedIn(true);
        setMyCheckInTime(now.toISOString());
        addToast("asistencia", "ingreso registrado exitosamente", 'success');
        sendTelegramNotification(`✅ <b>MARCÓ ENTRADA: ${currentUser.name.toUpperCase()}</b>\n📅 FECHA: ${dateStr}\n🕒 HORA: ${timeStr}`);
      } else {
        if (myCheckInTime) {
          const checkInDate = new Date(myCheckInTime);
          const hoursSinceEntry = (now.getTime() - checkInDate.getTime()) / (1000 * 60 * 60);
          if (hoursSinceEntry > 14) {
            addToast("atención", "olvidó marcar salida hace muchas horas. el supervisor deberá validar su egreso manualmente.", "warning");
            setIsClocking(false);
            return;
          }
        }

        const { data: shifts } = await supabase.from('shifts').select('id').eq('user_id', currentUser.id).is('check_out', null).order('check_in', { ascending: false });
        const openShift = shifts && shifts.length > 0 ? shifts[0] : null;

        if (openShift) {
          await supabase.from('shifts').update({ check_out: now.toISOString(), status: 'completo' }).eq('id', openShift.id);
        }
        await supabase.from('profiles').update({ status: 'ausente' }).eq('id', currentUser.id);
        setIsClockedIn(false);
        setMyCheckInTime(null);
        addToast("asistencia", "egreso registrado exitosamente", 'info');
        sendTelegramNotification(`🚪 <b>MARCÓ SALIDA: ${currentUser.name.toUpperCase()}</b>\n📅 FECHA: ${dateStr}\n🕒 HORA: ${timeStr}`);
      }
      await fetchEmployees();
      await fetchMyShifts(currentUser.id);
    } catch (err: any) {
      console.error(err);
      addToast("error", err.message || "fallo al registrar presentismo", "error");
    } finally {
      setIsClocking(false);
    }
  };

  const handleSaveDocument = async () => {
    if (!newDoc.title || !currentUser?.id || !newDoc.fileUrl) {
      addToast("incompleto", "asigna un título y selecciona un archivo", "warning");
      return;
    }

    if (currentUser?.role !== 'admin' && currentUser?.role !== 'manager' && !hasPermission('canManageDocs')) {
      addToast("error", "acción no autorizada", "error");
      return;
    }

    setIsSaving(true);
    try {
      const payload: any = {
        user_id: currentUser.id,
        title: newDoc.title,
        file_url: newDoc.fileUrl,
        description: newDoc.description || '',
        category: newDoc.category,
        visibility: newDoc.visibility,
        target_user_id: newDoc.visibility === 'private' ? newDoc.targetUserId : null,
        requires_signature: newDoc.requiresSignature
      };
      const { error } = await supabase.from('documents').insert([payload]);
      if (error) throw error;
      addToast("documentación", "archivo subido", "success");
      setShowAddDoc(false);
      setNewDoc({ title: '', description: '', fileUrl: '', category: 'otros', visibility: 'public', targetUserId: '', requiresSignature: false });
      await fetchDocuments();
    } catch (e: any) { addToast("error", "falló la subida", "error"); } finally { setIsSaving(false); }
  };

  const handleSaveRequest = async () => {
    if (!currentUser?.id) return;

    if (newRequest.type === 'cambio de turno' && (!newRequest.peerId || !newRequest.metadata.dateA || !newRequest.metadata.dateB)) {
      addToast("incompleto", "define ambos turnos e integra a un compañero", "warning");
      return;
    }

    if (newRequest.type === 'licencia médica' && !newRequest.metadata.startDate) {
      addToast("incompleto", "indica la fecha de inicio de la carpeta médica", "warning");
      return;
    }

    setIsSaving(true);
    try {
      if (newRequest.type === 'licencia médica' && newRequest.metadata.certificateUrl) {
        await supabase.from('documents').insert([{
          user_id: currentUser.id,
          title: `Certificado Médico - ${getNow().toLocaleDateString()}`,
          file_url: newRequest.metadata.certificateUrl,
          description: `Vinculado a la solicitud de licencia médica del ${getNow().toLocaleDateString()}`,
          category: 'otros',
          visibility: 'private',
          target_user_id: null,
          requires_signature: false
        }]);
      }

      const { error } = await supabase.from('requests').insert([{
        user_id: currentUser.id,
        type: newRequest.type,
        reason: newRequest.reason || null,
        peer_id: newRequest.peerId || null,
        metadata: newRequest.metadata,
        status: 'pendiente'
      }]);
      if (error) throw error;

      addToast("trámite", "solicitud enviada con éxito", "success");

      if (notifyEmail) {
        fetch(`https://formsubmit.co/ajax/${notifyEmail}`, {
          method: "POST",
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            _subject: `Nueva solicitud en Nexo HR - ${newRequest.type}`,
            empleado: currentUser?.name || 'Desconocido',
            tipo: newRequest.type,
            motivo: newRequest.reason || 'Sin motivo especificado',
            fechas: newRequest.metadata?.startDate ? `Desde ${newRequest.metadata.startDate} hasta ${newRequest.metadata.endDate || 'N/A'}` : 'N/A'
          })
        }).catch(err => console.error("Error email", err));
      }

      setShowAddRequest(false);
      setNewRequest({ type: 'vacaciones', reason: '', peerId: '', metadata: { startDate: '', endDate: '', totalDays: 0, certificateUrl: '', dateA: '', timeStartA: '09:00', timeEndA: '17:30', dateB: '', timeStartB: '09:00', timeEndB: '17:30' } });
      if (currentUser) await loadInitialData(currentUser);
      await fetchDocuments();
    } catch (e) { addToast("error", "falló el envío", "error"); } finally { setIsSaving(false); }
  };

  const handleApproveMedicalLicense = async () => {
    if (!approvingMedicalRequestId || !approvalStartDate || !approvalEndDate || (currentUser?.role !== 'admin' && currentUser?.role !== 'manager')) {
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'manager') addToast("gestión", "solo el administrador o gerente puede autorizar trámites", "warning");
      else addToast("incompleto", "indica las fechas de inicio y fin", "warning");
      return;
    }
    setIsSaving(true);
    try {
      const { data: reqData } = await supabase.from('requests').select('metadata').eq('id', approvingMedicalRequestId).single();
      const totalDays = calculateTotalDays(approvalStartDate, approvalEndDate);
      const updatedMetadata = {
        ...(reqData?.metadata || {}),
        startDate: approvalStartDate,
        endDate: approvalEndDate,
        totalDays: totalDays
      };

      const { error } = await supabase.from('requests').update({ status: 'aprobado', metadata: updatedMetadata }).eq('id', approvingMedicalRequestId);
      if (error) throw error;

      addToast("gestión", "licencia médica aprobada y periodizada", "success");
      setApprovingMedicalRequestId(null);
      setApprovalStartDate('');
      setApprovalEndDate('');
      if (currentUser) await loadInitialData(currentUser);
    } catch (e) { addToast("error", "falló la aprobación", "error"); }
    finally { setIsSaving(false); }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete.id || !supabase) return;

    if (confirmDelete.type === 'document' && currentUser?.role !== 'admin' && currentUser?.role !== 'manager') {
      addToast("error", "acción no autorizada", "error");
      setConfirmDelete({ isOpen: false, id: '', name: '', type: 'employee' });
      return;
    }

    setIsSaving(true);
    try {
      const table = confirmDelete.type === 'employee' ? 'profiles' :
        confirmDelete.type === 'request' ? 'requests' :
          confirmDelete.type === 'document' ? 'documents' : 'shifts';

      const { error } = await supabase.from(table).delete().eq('id', confirmDelete.id);
      if (error) throw error;
      addToast("borrado", `${confirmDelete.name} eliminado`, "info");
      setConfirmDelete({ isOpen: false, id: '', name: '', type: 'employee' });

      if (confirmDelete.type === 'shift') {
        await fetchMyShifts(historySelectedUserId);
        await fetchEmployees();
      } else {
        await fetchEmployees();
        if (currentUser) await loadInitialData(currentUser);
      }
    } catch (e) { addToast("error", "no se pudo eliminar", "error"); } finally { setIsSaving(false); }
  };

  const processFile = (file: File) => {
    if (file.size > 3.0 * 1024 * 1024) {
      addToast("archivo pesado", "límite 3mb", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewDoc(prev => ({ ...prev, fileUrl: reader.result as string }));
      addToast("documento", "archivo cargado correctamente", "success");
    };
    reader.readAsDataURL(file);
  };

  const processCertificate = (file: File) => {
    if (file.size > 3.0 * 1024 * 1024) {
      addToast("archivo pesado", "límite 3mb", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewRequest(prev => ({ ...prev, metadata: { ...prev.metadata, certificateUrl: reader.result as string } }));
      addToast("certificado", "archivo adjunto correctamente", "success");
    };
    reader.readAsDataURL(file);
  };

  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleCertificateDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processCertificate(file);
  };

  const handlePeerAccept = async (id: string) => {
    if (!supabase || !id) return;
    try {
      const { error } = await supabase.from('requests').update({ peer_accepted: true }).eq('id', id);
      if (error) throw error;
      addToast("solicitud", "intercambio aceptado por tu parte. esperando autorización administrativa.", "success");
      if (currentUser) await loadInitialData(currentUser);
    } catch (e) { addToast("error", "no se pudo procesar intercambio", "error"); }
  };

  const handlePeerReject = async (id: string) => {
    if (!supabase || !id) return;
    try {
      const { data: reqData } = await supabase.from('requests').select('metadata').eq('id', id).single();
      const updatedMetadata = {
        ...(reqData?.metadata || {}),
        rejectionReason: `rechazado por el compañero (${currentUser?.name})`
      };
      const { error } = await supabase.from('requests').update({
        status: 'rechazado',
        metadata: updatedMetadata,
        peer_accepted: false
      }).eq('id', id);

      if (error) throw error;
      addToast("solicitud", "has rechazado el intercambio. el trámite se ha cerrado.", "info");
      if (currentUser) await loadInitialData(currentUser);
    } catch (e) { addToast("error", "no se pudo rechazar", "error"); }
  };

  const handleApproveRequest = async (id: string, status: string, reason?: string) => {
    if (!supabase || !id || (currentUser?.role !== 'admin' && currentUser?.role !== 'manager')) {
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'manager') addToast("gestión", "solo el administrador o gerente puede autorizar trámites", "warning");
      return;
    }
    setIsSaving(true);
    try {
      const { data: reqData } = await supabase.from('requests').select('metadata').eq('id', id).single();
      const updatedMetadata = { ...(reqData?.metadata || {}), ...(reason ? { rejectionReason: reason } : {}) };
      const { error } = await supabase.from('requests').update({ status, metadata: updatedMetadata }).eq('id', id);
      if (error) throw error;
      addToast("gestión", `solicitud ${status}`, status === 'aprobado' ? "success" : "info");
      if (currentUser) await loadInitialData(currentUser);
      if (status === 'rechazado') {
        setRejectingRequestId(null);
        setRejectionReason('');
      }
    } catch (e) { addToast("error", "falló la actualización", "error"); } finally { setIsSaving(false); }
  };

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = (dataUrl: string) => {
    try {
      if (!dataUrl.startsWith('data:')) {
        window.open(dataUrl, '_blank');
        return;
      }
      const parts = dataUrl.split(';base64,');
      const contentType = parts[0].split(':')[1];
      const raw = window.atob(parts[1]);
      const rawLength = raw.length;
      const uInt8Array = new Uint8Array(rawLength);
      for (let i = 0; i < rawLength; ++i) uInt8Array[i] = raw.charCodeAt(i);
      const blob = new Blob([uInt8Array], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      addToast("vista previa", "abriendo documento", "info");
    } catch (e) { addToast("error", "no se pudo previsualizar", "error"); }
  };

  const formatForDatetimeLocal = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const calculateTotalDays = (start: string, end: string) => {
    if (!start || !end) return 0;
    const d1 = new Date(start);
    const d2 = new Date(end);
    const diff = d2.getTime() - d1.getTime();
    const days = Math.ceil(diff / (1000 * 3600 * 24)) + 1;
    return days > 0 ? days : 0;
  };

  const calculateScheduleHours = (start: string, end: string) => {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let startMins = h1 * 60 + m1;
    let endMins = h2 * 60 + m2;
    if (endMins < startMins) endMins += 1440;
    const totalMinutes = endMins - startMins;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const checkLateArrival = (checkIn: string | null, scheduledStart: string) => {
    if (!checkIn) return null;
    const checkInDate = new Date(checkIn);
    const [h, m] = scheduledStart.split(':').map(Number);
    const scheduledDate = new Date(checkInDate);
    scheduledDate.setHours(h, m, 0, 0);
    const diff = checkInDate.getTime() - scheduledDate.getTime();
    if (diff <= 60000) return null;
    const diffMins = Math.floor(diff / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return hours > 0 ? `${hours}h ${mins}m tarde` : `${mins}m tarde`;
  };

  const handleUpdateEmployee = async () => {
    if (!editingEmployeeId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: newEmployee.name,
        email: newEmployee.email || null,
        dni: newEmployee.dni || null,
        cuil: newEmployee.cuil || null,
        phone: newEmployee.phone || null,
        address: newEmployee.address || null,
        birth_date: newEmployee.birthDate || null,
        role: newEmployee.role,
        pin: newEmployee.pin,
        bank_accounts: newEmployee.bankAccounts.filter(b => b.bankName && b.cvu_cbu),
        permissions: newEmployee.permissions
      }).eq('id', editingEmployeeId);
      if (error) throw error;
      addToast("equipo", "ficha actualizada", "success");
      setShowEditEmployeeModal(false);
      setEditingEmployeeId(null);
      await fetchEmployees();
    } catch (e) { addToast("error", "falló la actualización", "error"); } finally { setIsSaving(false); }
  };

  const handleSaveEmployee = async () => {
    if (!newEmployee.name || !newEmployee.pin) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('profiles').insert([{
        full_name: newEmployee.name,
        email: newEmployee.email || null,
        dni: newEmployee.dni || null,
        cuil: newEmployee.cuil || null,
        phone: newEmployee.phone || null,
        address: newEmployee.address || null,
        birth_date: newEmployee.birthDate || null,
        role: newEmployee.role,
        pin: newEmployee.pin,
        bank_accounts: newEmployee.bankAccounts.filter(b => b.bankName && b.cvu_cbu),
        permissions: newEmployee.permissions
      }]);
      if (error) throw error;
      addToast("equipo", "integrante añadido", "success");
      setShowAddEmployee(false);
      setNewEmployee({ name: '', email: '', dni: '', cuil: '', phone: '', address: '', birthDate: '', role: 'empleado', pin: '', bankAccounts: [{ bankName: '', cvu_cbu: '' }], permissions: { canManageStaff: false, canApproveRequests: false, canManageDocs: false, canViewSchedules: true, canViewAssistant: true, canViewTelegram: false, canViewSettings: false, canRegisterAttendance: true } });
      await fetchEmployees();
    } catch (e) { addToast("error", "falló el guardado", "error"); } finally { setIsSaving(false); }
  };

  const getEmployeeStatusLabel = (emp: Employee) => {
    const today = getNow();
    today.setHours(0, 0, 0, 0);
    const activeRequest = requests.find(r => r.status === 'aprobado' && String(r.userId) === String(emp.id) && (r.type === 'licencia médica' || r.type === 'vacaciones') && new Date(r.metadata?.startDate || '') <= today && new Date(r.metadata?.endDate || r.metadata?.startDate || '') >= today);
    if (activeRequest) {
      return {
        text: activeRequest.type === 'licencia médica' ? 'licencia médica' : 'vacaciones',
        class: activeRequest.type === 'licencia médica' ? 'bg-rose-100 text-rose-600 border border-rose-200' : 'bg-amber-100 text-amber-600 border border-amber-200'
      };
    }
    const todayIndex = (getNow().getDay() + 6) % 7;
    const sched = allSchedules.find(s => s.user_id === emp.id && s.day_index === todayIndex);
    if (sched?.is_off) return { text: 'de franco hoy', class: 'bg-sky-100 text-sky-600 border border-sky-200' };
    return { text: emp.status, class: 'bg-slate-300 text-white' };
  };

  if (!isLoggedIn) {
    return (
      <div className="relative w-full h-screen overflow-hidden font-montserrat lowercase flex items-center justify-center">
        <div className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-1000" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=2000')` }}><div className="absolute inset-0 bg-white/40 backdrop-blur-xl"></div></div>
        <div className="relative z-10 w-full max-w-sm px-8">
          <div className="bg-white/80 backdrop-blur-2xl p-12 rounded-[56px] shadow-2xl border border-white">
            <div className="mb-12 text-center"><div className="w-20 h-20 bg-midnight text-white flex items-center justify-center rounded-[28px] font-bold mx-auto mb-8 shadow-2xl">rh</div><h1 className="text-3xl font-light tracking-tighter text-midnight">minimal.</h1></div>
            <form onSubmit={handleLogin} className="space-y-5">
              {!isAdminMode && (
                <select className="w-full bg-white/60 border border-slate-100 rounded-[24px] py-5 px-6 text-sm font-medium outline-none" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                  <option value="">seleccionar personal</option>
                  {employees.map(emp => (<option key={emp.id} value={emp.id}>{emp.name}</option>))}
                </select>
              )}
              <input type="password" placeholder={isAdminMode ? "pin maestro" : "pin de acceso"} maxLength={8} className="w-full bg-white/60 border border-slate-100 rounded-[24px] py-5 px-6 text-sm text-center tracking-[0.6em] font-bold outline-none" value={loginPin} onChange={(e) => setLoginPin(e.target.value)} />
              {loginError && <p className="text-rose-500 text-[9px] text-center font-bold uppercase tracking-widest">{loginError}</p>}
              <button type="submit" disabled={isLoggingIn} className="w-full bg-midnight text-white rounded-[28px] py-5 font-bold shadow-2xl mt-6 transition-all hover:bg-slate-800">{isLoggingIn ? <Loader2 size={20} className="animate-spin mx-auto" /> : 'ingresar'}</button>
              <div className="text-center pt-4">
                <button type="button" onClick={() => { setIsAdminMode(!isAdminMode); setSelectedUserId(''); setLoginPin(''); setLoginError(''); }} className="text-[9px] font-bold uppercase tracking-widest text-slate-400 hover:text-midnight transition-colors">
                  {isAdminMode ? 'volver a personal' : 'soy administrador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const activeLicenses = requests.filter(r => r.status === 'aprobado' && (r.type === 'licencia médica' || r.type === 'vacaciones') && (new Date(r.metadata?.startDate || '') <= currentTime && new Date(r.metadata?.endDate || r.metadata?.startDate || '') >= new Date(new Date(currentTime).setHours(0, 0, 0, 0))));

  // Filter for the "Novedades" card: Active OR Future approved licenses
  const licenseNews = requests.filter(r =>
    r.status === 'aprobado' &&
    (r.type === 'licencia médica' || r.type === 'vacaciones') &&
    new Date(r.metadata?.endDate || '') >= new Date(new Date().setHours(0, 0, 0, 0))
  ).sort((a, b) => new Date(a.metadata?.startDate || '').getTime() - new Date(b.metadata?.startDate || '').getTime());

  const getDocFolder = (doc: HRDocument) => {
    if (doc.visibility === 'public') return 'General';
    if (doc.targetUserName) return doc.targetUserName;
    return doc.userName || 'Desconocido';
  };

  const docFolders: Record<string, HRDocument[]> = {};
  docs.forEach(doc => {
    const folder = getDocFolder(doc);
    if (!docFolders[folder]) docFolders[folder] = [];
    docFolders[folder].push(doc);
  });

  return (
    <Layout>
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-midnight/20 backdrop-blur-sm z-[100] md:hidden animate-in fade-in duration-300" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-[110] w-72 bg-white/95 backdrop-blur-3xl border-r border-slate-100 h-full p-8 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col md:relative md:translate-x-0 md:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex items-center justify-between mb-14">
          <div className="flex items-center gap-4"><div className="w-10 h-10 bg-midnight text-white flex items-center justify-center rounded-2xl font-bold shadow-lg shadow-midnight/20">rh</div><span className="text-2xl font-light text-midnight tracking-tighter lowercase">minimal.</span></div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-2 text-slate-400 hover:text-rose-500 transition-colors"><X size={24} /></button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto no-scrollbar pb-10">
          {[Tab.HOME, Tab.CHECKIN, Tab.SCHEDULES, Tab.STAFF, Tab.REQUESTS, Tab.DOCS, Tab.TELEGRAM, Tab.SETTINGS].map((t) => {
            if (currentUser?.role !== 'admin') {
              if (t === Tab.STAFF && !hasPermission('canManageStaff') && currentUser?.role !== 'manager') return null;
              if (t === Tab.DOCS && !hasPermission('canManageDocs') && currentUser?.role !== 'manager' && docs.filter(d => d.userId === currentUser?.id || d.targetUserId === currentUser?.id || d.visibility === 'public').length === 0) return null;
              if (t === Tab.SCHEDULES && !hasPermission('canViewSchedules')) return null;
              if (t === Tab.TELEGRAM && !hasPermission('canViewTelegram') && currentUser?.role !== 'manager') return null;
              if (t === Tab.SETTINGS && !hasPermission('canViewSettings') && currentUser?.role !== 'manager') return null;
              if (t === Tab.CHECKIN && !hasPermission('canRegisterAttendance')) return null;
            }

            return (
              <button key={t} onClick={() => { setActiveTab(t); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] transition-all lowercase ${activeTab === t ? 'bg-white shadow-xl text-midnight font-bold' : 'text-slate-400 hover:bg-white/80 hover:text-slate-600'}`}>
                {t === Tab.HOME && <HomeIcon size={20} />}
                {t === Tab.CHECKIN && <Fingerprint size={20} />}
                {t === Tab.SCHEDULES && <Timer size={20} />}
                {t === Tab.STAFF && <Users size={20} />}
                {t === Tab.REQUESTS && <CheckSquare size={20} />}
                {t === Tab.DOCS && <Files size={20} />}
                {t === Tab.TELEGRAM && <Bell size={20} />}
                {t === Tab.SETTINGS && <Settings size={20} />}
                <span>{t}</span>
              </button>
            );
          })}
        </nav>

        <div className="pt-8 border-t border-slate-100 space-y-3">
          <button onClick={() => { setShowSqlModal(true); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-4 px-6 py-3 rounded-2xl text-slate-300 hover:text-midnight transition-all lowercase"><Database size={18} /> <span className="text-[10px] font-bold uppercase tracking-widest">esquema sql</span></button>
          <div className="mt-6 flex items-center gap-4 px-4 py-4 bg-white/80 rounded-[28px] shadow-sm"><div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold uppercase">{getInitials(currentUser?.name || '')}</div><div className="flex-1 overflow-hidden"><p className="text-sm font-bold text-midnight truncate">{currentUser?.name}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{currentUser?.role}</p></div><button onClick={() => window.location.reload()} className="text-slate-200 hover:text-rose-400"><LogOut size={20} /></button></div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden h-full flex flex-col relative">
        <header className="md:hidden flex items-center justify-between p-6 bg-white/80 backdrop-blur-md border-b border-slate-50 sticky top-0 z-40 shrink-0">
          <div className="flex items-center gap-3"><div className="w-8 h-8 bg-midnight text-white flex items-center justify-center rounded-xl font-bold shadow-md shadow-midnight/10">rh</div><span className="text-xl font-light text-midnight tracking-tighter">minimal.</span></div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-3 bg-slate-50 text-midnight rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors shadow-sm"><Menu size={20} /></button>
        </header>

        {activeTab === Tab.HOME && (
          <div className="p-8 h-full overflow-y-auto no-scrollbar animate-in fade-in duration-700 space-y-10">
            <div className="flex flex-col lg:flex-row justify-between items-center lg:items-end mb-4 gap-6">
              <div className="text-center lg:text-left"><h1 className="text-3xl font-light text-midnight mb-1 tracking-tight">panel de control</h1><p className="text-slate-500 font-medium opacity-60">asistencia en tiempo real {isLabMode && <span className="text-rose-500 font-bold ml-2"> [modo laboratorio]</span>}</p></div>
              <div className="bg-white/80 backdrop-blur-xl px-10 py-6 rounded-[40px] shadow-xl border border-white flex items-center gap-6">
                <div className="text-right"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">fecha de hoy</p><p className="text-lg font-light text-midnight">{currentTime.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
                <div className="w-px h-10 bg-slate-100"></div>
                <div className="text-right"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">hora actual</p><p className="text-2xl font-bold text-midnight tabular-nums">{currentTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p></div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-[24px] border-l-4 border-emerald-400 shadow-sm"><CheckCircle size={16} className="text-emerald-500 mb-2" /><p className="text-2xl font-light text-midnight">{employees.filter(e => e.role !== 'admin' && e.status === 'presente').length}</p><span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">presentes</span></div>
              <div className="bg-white p-6 rounded-[24px] border-l-4 border-rose-400 shadow-sm"><AlertCircle size={16} className="text-rose-500 mb-2" /><p className="text-2xl font-light text-midnight">{employees.filter(e => e.role !== 'admin' && e.status === 'ausente').length}</p><span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">ausentes</span></div>
              <div className="bg-white p-6 rounded-[24px] border-l-4 border-sky-400 shadow-sm"><Coffee size={16} className="text-sky-500 mb-2" /><p className="text-2xl font-light text-midnight">{employees.filter(e => { if (e.role === 'admin') return false; const todayIndex = (currentTime.getDay() + 6) % 7; const sched = allSchedules.find(s => s.user_id === e.id && s.day_index === todayIndex); return sched?.is_off; }).length}</p><span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">francos</span></div>
              <div onClick={() => setShowLicensesModal(true)} className="bg-white p-6 rounded-[24px] border-l-4 border-amber-400 shadow-sm cursor-pointer hover:shadow-md transition-all active:scale-95 group"><Calendar size={16} className="text-amber-500 mb-2 group-hover:scale-110 transition-transform" /><p className="text-2xl font-light text-midnight">{activeLicenses.length}</p><span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">licencias</span></div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-[40px] border border-white shadow-xl overflow-hidden w-full">
              <div className="px-10 py-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/20"><h2 className="text-sm font-semibold text-midnight">gestión de equipo</h2><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div><span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 lowercase">monitor en vivo</span></div></div>
              <div className="divide-y divide-slate-50">
                {employees.filter(e => e.role !== 'admin' && e.status === 'presente').map((emp) => {
                  const todayIndex = (currentTime.getDay() + 6) % 7;
                  const sched = allSchedules.find(s => s.user_id === emp.id && s.day_index === todayIndex);
                  const lateInfo = sched ? checkLateArrival(emp.checkIn, sched.start_time) : null;
                  return (
                    <div key={emp.id} className="px-10 py-6 flex items-center justify-between hover:bg-emerald-50/30 transition-colors">
                      <div className="flex items-center gap-5"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold uppercase bg-emerald-100 text-emerald-600 shadow-sm">{getInitials(emp.name)}</div><div><span className="font-medium text-slate-800 text-sm block">{emp.name}</span><div className="flex gap-2 items-center mt-1"><span className="px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest bg-emerald-500 text-white">presente</span>{lateInfo && <span className="px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest bg-rose-50 text-rose-600 border border-rose-100 flex items-center gap-1"><AlertTriangle size={10} /> {lateInfo}</span>}</div></div></div>
                      <div className="flex items-center gap-8"><div className="text-right flex items-center gap-6">{sched && !sched.is_off && <div className="text-right border-r border-slate-100 pr-6"><span className="text-[9px] text-slate-400 uppercase block font-bold mb-1 tracking-wider opacity-60 lowercase">turno hoy</span><span className="text-xs font-bold text-slate-600 tabular-nums">{sched.start_time} - {sched.end_time} hs</span></div>}<div className="text-right"><span className="text-[9px] text-slate-400 uppercase block font-bold mb-1 tracking-wider opacity-60 lowercase">tiempo activo</span>{emp.checkIn ? <LiveTimer startTime={emp.checkIn} getNow={getNow} /> : <span className="font-mono text-sm text-slate-400">--:--</span>}</div></div>{(hasPermission('canManageStaff') || currentUser?.role === 'manager' || currentUser?.role === 'admin') && <button onClick={() => handleManualCheckout(emp.id)} title="cerrar turno manual" className="p-3 text-rose-400 hover:bg-rose-50 rounded-xl transition-all shadow-sm group"><Power size={20} className="group-hover:scale-110" /></button>}</div>
                    </div>
                  );
                })}
                {employees.filter(e => e.role !== 'admin' && e.status !== 'presente').map((emp) => {
                  const statusLabel = getEmployeeStatusLabel(emp);
                  const todayIndex = (currentTime.getDay() + 6) % 7;
                  const sched = allSchedules.find(s => s.user_id === emp.id && s.day_index === todayIndex);
                  return (
                    <div key={emp.id} className="px-10 py-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors opacity-70">
                      <div className="flex items-center gap-5"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold uppercase bg-slate-100 text-slate-400">{getInitials(emp.name)}</div><div><span className="font-medium text-slate-800 text-sm block">{emp.name}</span><span className={`px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest inline-block mt-1 ${statusLabel.class}`}>{statusLabel.text}</span></div></div>
                      {sched && !sched.is_off && <div className="text-right pr-6"><span className="text-[9px] text-slate-300 uppercase block font-bold mb-1 tracking-wider lowercase">horario previsto</span><span className="text-xs font-bold text-slate-400 tabular-nums">{sched.start_time} - {sched.end_time} hs</span></div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 bg-amber-50/50 p-10 rounded-[40px] border border-amber-100/50 shadow-lg animate-in slide-in-from-bottom duration-700">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-4 bg-amber-500 text-white rounded-2xl shadow-lg"><Calendar size={24} /></div>
                <h3 className="text-xl font-bold text-midnight tracking-tight">novedades de licencias</h3>
              </div>
              <div className="space-y-4">
                {licenseNews.map(req => (
                  <div key={req.id} className="bg-white p-6 rounded-3xl border border-amber-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:scale-[1.01] transition-transform">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold uppercase shadow-sm ${req.type === 'licencia médica' ? 'bg-rose-100 text-rose-600' : 'bg-sky-100 text-sky-600'}`}>
                        {getInitials(req.userName)}
                      </div>
                      <div>
                        <span className="font-bold text-midnight text-sm uppercase tracking-wide block">{req.userName}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg mt-1 inline-block ${req.type === 'licencia médica' ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600'}`}>{req.type}</span>
                      </div>
                    </div>
                    <div className="text-right pl-14 md:pl-0">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">vigencia autorizada</p>
                      <p className="text-xs font-bold text-slate-600">
                        desde {formatDateDisplay(req.metadata?.startDate)} hasta {formatDateDisplay(req.metadata?.endDate)}
                      </p>
                    </div>
                  </div>
                ))}
                {licenseNews.length === 0 && <div className="text-center py-8"><p className="text-slate-400 text-xs italic font-medium">no hay licencias activas ni próximas registradas</p></div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === Tab.CHECKIN && (
          <div className="p-8 h-full overflow-y-auto no-scrollbar animate-in slide-in-from-bottom duration-700">
            <div className="max-w-4xl mx-auto space-y-12">
              <div className="text-center"><h1 className="text-4xl font-light text-midnight tracking-tighter mb-4">registro de ingreso</h1><p className="text-slate-500 max-w-md mx-auto lowercase">el sistema validará tu ubicación actual para permitir el registro de entrada o salida del local.</p></div>
              <div className="flex flex-col items-center">
                <ClockInButton onClockIn={() => handleClockAction('in')} onClockOut={() => handleClockAction('out')} isClockedIn={isClockedIn} isLoading={isClocking} startTime={myCheckInTime} />
                <div className="mt-8 bg-white/50 backdrop-blur-xl px-12 py-8 rounded-[48px] border border-white shadow-xl flex flex-wrap justify-center gap-10">
                  <div className="flex flex-col items-center"><div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-2 shadow-inner"><Radar size={20} /></div><span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-1">localización</span><span className={`text-[10px] font-bold uppercase tracking-widest ${distanceToOffice !== null && distanceToOffice <= officeLocation.radius ? 'text-emerald-500' : 'text-slate-400'}`}>{distanceToOffice !== null ? `${Math.round(distanceToOffice)}m del local` : 'verificando...'}</span></div>
                  <div className="hidden sm:block w-px h-12 bg-slate-100"></div>
                  <div className="flex flex-col items-center"><div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-2 shadow-inner"><Clock3 size={20} /></div><span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-1">estado</span><span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">{isClockedIn ? 'en servicio' : 'fuera de turno'}</span></div>
                  <div className="hidden sm:block w-px h-12 bg-slate-100"></div>
                  <div className="flex flex-col items-center"><div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mb-2 shadow-inner"><CheckCircle size={20} /></div><span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-1">hoy</span><span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">{calculateAttendanceTotals(myShifts).today}hs</span></div>
                  <div className="hidden sm:block w-px h-12 bg-slate-100"></div>
                  <div className="flex flex-col items-center"><div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-2 shadow-inner"><Calendar size={20} /></div><span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-1">mes</span><span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">{calculateAttendanceTotals(myShifts).month}hs</span></div>
                </div>
              </div>

              {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                <div className="bg-white/80 backdrop-blur-xl rounded-[48px] border border-white shadow-xl overflow-hidden p-10 animate-in fade-in duration-700">
                  <div className="flex items-center gap-4 mb-8">
                    <FileSpreadsheet size={24} className="text-midnight" />
                    <h2 className="text-sm font-bold text-midnight lowercase">exportar novedades</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div>
                      <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">personal</label>
                      <select className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-6 py-4 text-xs font-bold outline-none cursor-pointer" value={exportSelectedUserId} onChange={e => setExportSelectedUserId(e.target.value)}>
                        <option value="">todos</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">desde</label>
                      <input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-4 text-sm font-bold text-midnight outline-none focus:ring-2 ring-indigo-100" value={exportDates.from} onChange={e => setExportDates({ ...exportDates, from: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">hasta</label>
                      <input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-4 text-sm font-bold text-midnight outline-none focus:ring-2 ring-indigo-100" value={exportDates.to} onChange={e => setExportDates({ ...exportDates, to: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleExportAttendance('csv')} disabled={isSaving} className="flex-1 py-4 bg-midnight text-white rounded-3xl text-[10px] font-bold uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} descargar reporte
                      </button>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-4 lowercase px-4">* el reporte se descarga en formato .csv compatible con excel (usa delimitadores ";" y codificación utf-8).</p>
                </div>
              )}

              <div className="bg-white/80 backdrop-blur-xl rounded-[48px] border border-white shadow-xl overflow-hidden">
                <div className="px-10 py-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-4"><div className="flex items-center gap-4"><History size={20} className="text-midnight" /><h2 className="text-sm font-bold text-midnight lowercase">historial reciente</h2></div>{(currentUser?.role === 'admin' || currentUser?.role === 'manager') && <div className="flex items-center gap-4 bg-slate-50 px-6 py-2 rounded-full border border-slate-100"><span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">gestionar:</span><select className="bg-transparent text-[10px] font-bold text-indigo-600 outline-none cursor-pointer" value={historySelectedUserId} onChange={(e) => setHistorySelectedUserId(e.target.value)}>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>}</div>
                <div className="divide-y divide-slate-50">
                  {myShifts.length > 0 ? myShifts.map((shift) => (
                    <div key={shift.id} className="px-10 py-6 flex flex-col md:flex-row items-center justify-between hover:bg-slate-50/50 transition-colors gap-6"><div className="flex items-center gap-5 w-full md:w-auto"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold uppercase ${shift.status?.includes('manual') ? 'bg-amber-50 text-amber-600' : shift.status === 'completo' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>{shift.status?.includes('manual') ? <AlertCircle size={20} /> : shift.status === 'completo' ? <History size={20} /> : <Clock size={20} />}</div><div><p className="font-bold text-midnight text-sm tracking-tight">{new Date(shift.check_in).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{shift.status}</p></div></div><div className="flex items-center justify-between md:justify-end gap-8 md:gap-12 w-full md:w-auto flex-1"><div className="text-right"><span className="text-[8px] text-slate-400 uppercase block font-bold mb-0.5 tracking-wider">ingreso</span><span className="font-mono text-sm text-midnight tabular-nums font-bold">{new Date(shift.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}hs</span></div><div className="text-right"><span className="text-[8px] text-slate-400 uppercase block font-bold mb-0.5 tracking-wider">egreso {shift.status?.includes('manual') ? '(manual)' : ''}</span><span className="font-mono text-sm text-midnight tabular-nums font-bold">{shift.check_out ? `${new Date(shift.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}hs` : '--:--'}</span></div>{(currentUser?.role === 'admin' || currentUser?.role === 'manager') && <div className="flex items-center gap-2 pl-4 border-l border-slate-100"><button onClick={() => { setEditingShift(shift); setShowEditShiftModal(true); }} className="p-3 text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all"><Pencil size={18} /></button><button onClick={() => setConfirmDelete({ isOpen: true, id: shift.id, name: 'este registro de asistencia', type: 'shift' })} className="p-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={18} /></button></div>}</div></div>
                  )) : <div className="py-20 text-center"><Clock size={48} className="mx-auto text-slate-200 mb-4" /><p className="text-slate-400 font-medium lowercase">aún no hay registros para mostrar</p></div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === Tab.SCHEDULES && (
          <div className="p-8 h-full overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-700">
            <div className="max-w-5xl mx-auto space-y-10 pb-20">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6"><div><h1 className="text-3xl font-light text-midnight tracking-tight">gestión de horarios</h1><p className="text-slate-500 lowercase">configuración de carga horaria semanal y puntualidad</p></div>{(currentUser?.role === 'admin' || currentUser?.role === 'manager') && <div className="bg-white/80 backdrop-blur-xl px-6 py-4 rounded-[32px] border border-white shadow-xl flex items-center gap-4"><span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">empleado:</span><select className="bg-transparent text-sm font-bold text-midnight outline-none cursor-pointer capitalize" value={scheduleSelectedUserId} onChange={(e) => setScheduleSelectedUserId(e.target.value)}>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/80 backdrop-blur-xl p-8 rounded-[48px] border border-white shadow-xl">
                  <div className="flex items-center gap-4 mb-6"><div className="p-3 bg-amber-50 text-amber-500 rounded-2xl"><Timer size={24} /></div><h2 className="text-sm font-bold text-midnight lowercase">estado de puntualidad hoy</h2></div>
                  {(() => { const todayIndex = (getNow().getDay() + 6) % 7; const todaySchedule = employeeSchedules.find(s => s.day_index === todayIndex); const todayShift = myShifts.find(s => { const d = new Date(s.check_in); return d.toLocaleDateString() === getNow().toLocaleDateString(); }); if (!todaySchedule || todaySchedule.is_off) return <p className="text-xs text-slate-400 italic py-4">hoy es día de franco o no hay horario definido</p>; const lateInfo = checkLateArrival(todayShift?.check_in, todaySchedule.start_time); return (<div className="space-y-4"><div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">horario esperado</span><span className="text-sm font-bold text-midnight">{todaySchedule.start_time} hs</span></div><div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ingreso real</span><span className="text-sm font-bold text-midnight">{todayShift ? new Date(todayShift.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'} hs</span></div>{lateInfo && <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 flex items-center gap-3"><AlertTriangle size={18} /><span className="text-[10px] font-bold uppercase tracking-widest">llegada tarde: {lateInfo}</span></div>}{!lateInfo && todayShift && <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 flex items-center gap-3"><CheckCircle size={18} /><span className="text-[10px] font-bold uppercase tracking-widest">ingreso puntual</span></div>}</div>); })()}
                </div>
              </div>
              <div className="bg-white/90 backdrop-blur-xl rounded-[56px] border border-white shadow-2xl overflow-hidden">
                <div className="px-12 py-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30"><div className="flex items-center gap-4"><Calendar size={20} className="text-indigo-500" /><h2 className="text-sm font-bold text-midnight lowercase">configuración de días</h2></div>{(currentUser?.role === 'admin' || currentUser?.role === 'manager') && <button onClick={handleSaveSchedule} disabled={isSaving} className="flex items-center gap-2 bg-midnight text-white px-8 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-xl active:scale-95 disabled:opacity-50">{isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}<span>guardar cronograma</span></button>}</div>
                <div className="divide-y divide-slate-50">
                  {employeeSchedules.map((day, idx) => (
                    <div key={idx} className={`px-12 py-8 flex flex-col md:flex-row items-center justify-between gap-8 transition-colors ${day.is_off ? 'bg-slate-50/50 grayscale-[0.5]' : 'hover:bg-slate-50/30'}`}>
                      <div className="flex items-center gap-6 w-full md:w-48">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xs font-bold uppercase shadow-sm ${day.is_off ? 'bg-slate-200 text-slate-500' : 'bg-indigo-50 text-indigo-600'}`}>{DAYS_OF_WEEK[idx].substring(0, 2)}</div>
                        <div><p className="font-bold text-midnight capitalize">{DAYS_OF_WEEK[idx]}</p><span className={`text-[9px] font-bold uppercase tracking-widest ${day.is_off ? 'text-slate-400' : 'text-emerald-500'}`}>{day.is_off ? 'franco' : 'laboral'}</span></div>
                      </div>
                      <div className="flex-1 flex flex-wrap items-center justify-center md:justify-end gap-10">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center"><span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest w-14 text-right mr-3">ingreso</span><input type="time" disabled={day.is_off || (currentUser?.role !== 'admin' && currentUser?.role !== 'manager')} className={`bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-midnight outline-none transition-all ${day.is_off ? 'opacity-20' : 'focus:ring-2 ring-indigo-100'}`} value={day.start_time} onChange={e => { const newSched = [...employeeSchedules]; newSched[idx].start_time = e.target.value; setEmployeeSchedules(newSched); }} /></div>
                            <div className="w-2 h-px bg-slate-300"></div>
                            <div className="flex items-center"><span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest w-14 text-right mr-3">egreso</span><input type="time" disabled={day.is_off || (currentUser?.role !== 'admin' && currentUser?.role !== 'manager')} className={`bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-midnight outline-none transition-all ${day.is_off ? 'opacity-20' : 'focus:ring-2 ring-indigo-100'}`} value={day.end_time} onChange={e => { const newSched = [...employeeSchedules]; newSched[idx].end_time = e.target.value; setEmployeeSchedules(newSched); }} /></div>
                          </div>
                          {day.is_double_shift && (
                            <div className="flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                              <div className="flex items-center"><span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest w-14 text-right mr-3">ingreso 2</span><input type="time" disabled={day.is_off || (currentUser?.role !== 'admin' && currentUser?.role !== 'manager')} className={`bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-midnight outline-none transition-all ${day.is_off ? 'opacity-20' : 'focus:ring-2 ring-indigo-100'}`} value={day.start_time_2} onChange={e => { const newSched = [...employeeSchedules]; newSched[idx].start_time_2 = e.target.value; setEmployeeSchedules(newSched); }} /></div>
                              <div className="w-2 h-px bg-slate-300"></div>
                              <div className="flex items-center"><span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest w-14 text-right mr-3">egreso 2</span><input type="time" disabled={day.is_off || (currentUser?.role !== 'admin' && currentUser?.role !== 'manager')} className={`bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-midnight outline-none transition-all ${day.is_off ? 'opacity-20' : 'focus:ring-2 ring-indigo-100'}`} value={day.end_time_2} onChange={e => { const newSched = [...employeeSchedules]; newSched[idx].end_time_2 = e.target.value; setEmployeeSchedules(newSched); }} /></div>
                            </div>
                          )}
                        </div>
                        <div className="text-center min-w-[60px]"><span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-1">total hs</span><span className={`text-sm font-mono font-bold ${day.is_off ? 'text-slate-200' : 'text-indigo-600'}`}>{day.is_off ? '0.0' : (parseFloat(calculateScheduleHours(day.start_time, day.end_time) || "0") + (day.is_double_shift ? parseFloat(calculateScheduleHours(day.start_time_2, day.end_time_2) || "0") : 0)).toFixed(1)}</span></div>
                        {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                          <div className="pl-6 border-l border-slate-100 flex items-center gap-6">
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">doble turno</span>
                              <button onClick={() => { const newSched = [...employeeSchedules]; newSched[idx].is_double_shift = !newSched[idx].is_double_shift; setEmployeeSchedules(newSched); }} title="Alternar Doble Turno" className={`w-14 h-7 rounded-full relative transition-all duration-300 ${day.is_double_shift ? 'bg-amber-500' : 'bg-slate-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${day.is_double_shift ? 'right-1' : 'left-1'}`}></div></button>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">franco</span>
                              <button onClick={() => { const newSched = [...employeeSchedules]; newSched[idx].is_off = !newSched[idx].is_off; setEmployeeSchedules(newSched); }} className={`w-14 h-7 rounded-full relative transition-all duration-300 ${day.is_off ? 'bg-indigo-500' : 'bg-slate-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${day.is_off ? 'right-1' : 'left-1'}`}></div></button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === Tab.STAFF && (
          <div className="p-8 h-full overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500">
            <div className="flex justify-between items-center mb-10"><div><h1 className="text-3xl font-light text-midnight mb-1 tracking-tight">gestión de equipo</h1><p className="text-slate-500 font-medium opacity-60">administración de fichas y jerarquías</p></div>{(hasPermission('canManageStaff') || currentUser?.role === 'manager' || currentUser?.role === 'admin') && <button onClick={() => { setShowAddEmployee(true); setShowEditEmployeeModal(false); }} className="px-8 py-4 bg-midnight text-white rounded-[24px] text-sm flex items-center gap-3 shadow-2xl hover:scale-105 transition-all"><Plus size={20} /><span className="font-semibold">nuevo integrante</span></button>}</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-20">
              {employees.map((emp) => (
                <div key={emp.id} className="bg-white/90 backdrop-blur-xl rounded-[48px] border border-white shadow-lg p-10 group transition-all hover:shadow-2xl relative flex flex-col md:flex-row gap-8"><div className="flex flex-col items-center gap-4"><div className={`w-24 h-24 rounded-[32px] flex items-center justify-center text-3xl font-bold uppercase shadow-inner ${emp.status === 'presente' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{getInitials(emp.name)}</div><span className="px-4 py-1.5 bg-midnight text-white rounded-full text-[9px] font-bold uppercase tracking-widest shadow-lg">{emp.role}</span></div><div className="flex-1 space-y-6"><div className="flex justify-between items-start"><div><h3 className="font-bold text-midnight text-2xl mb-1 tracking-tight capitalize">{emp.name}</h3><div className="flex items-center gap-4 text-slate-400"><div className="flex items-center gap-1.5"><Fingerprint size={12} /><span className="text-[10px] font-bold uppercase tracking-widest">{emp.dni || '--'}</span></div><div className="flex items-center gap-1.5"><Stamp size={12} /><span className="text-[10px] font-bold uppercase tracking-widest">CUIL: {emp.cuil || '--'}</span></div></div></div><div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">{(hasPermission('canManageStaff') || currentUser?.role === 'manager' || currentUser?.role === 'admin') && <><button onClick={() => { setEditingEmployeeId(emp.id); setNewEmployee({ name: emp.name, email: emp.email || '', dni: emp.dni || '', cuil: emp.cuil || '', phone: emp.phone || '', address: emp.address || '', birthDate: emp.birthDate || '', role: emp.role, pin: emp.pin || '', bankAccounts: emp.bankAccounts.length > 0 ? emp.bankAccounts : [{ bankName: '', cvu_cbu: '' }], permissions: emp.permissions }); setShowEditEmployeeModal(true); }} title="editar" className="p-3 bg-indigo-50 text-indigo-500 rounded-2xl hover:bg-indigo-500 hover:text-white transition-all shadow-sm"><Pencil size={18} /></button><button onClick={() => setConfirmDelete({ isOpen: true, id: emp.id, name: emp.name, type: 'employee' })} title="eliminar" className="p-3 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all shadow-sm"><UserMinus size={18} /></button></>}</div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="space-y-3"><div className="flex items-center gap-3 text-slate-500 bg-slate-50 p-3 rounded-2xl border border-slate-100/50"><MapPin size={16} className="text-slate-400 shrink-0" /><span className="text-xs font-medium truncate">{emp.address || 'domicilio no registrado'}</span></div><div className="flex items-center gap-3 text-slate-500 bg-slate-50 p-3 rounded-2xl border border-slate-100/50"><Cake size={16} className="text-slate-400 shrink-0" /><span className="text-xs font-medium">{emp.birthDate ? formatDateDisplay(emp.birthDate) : 'fecha no registrada'}</span></div><div className="flex items-center justify-between bg-emerald-50 p-3 rounded-2xl border border-emerald-100/50"><div className="flex items-center gap-3 text-emerald-600"><Smartphone size={16} className="shrink-0" /><span className="text-xs font-bold tracking-tight">{emp.phone || 'sin número'}</span></div>{emp.phone && <a href={`https://wa.me/${emp.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="p-1.5 bg-emerald-500 text-white rounded-lg hover:scale-110 transition-transform"><MessageCircle size={14} /></a>}</div></div><div className="space-y-2 bg-indigo-50/30 p-4 rounded-[32px] border border-indigo-100/50"><div className="flex items-center gap-2 mb-2"><Wallet size={14} className="text-indigo-500" /><span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest">Cuentas Bancarias</span></div>{emp.bankAccounts && emp.bankAccounts.length > 0 ? emp.bankAccounts.map((acc, i) => (<div key={i} className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-indigo-100 shadow-sm group/acc"><div className="overflow-hidden"><p className="text-[8px] font-bold text-slate-400 uppercase truncate">{acc.bankName}</p><p className="text-[10px] font-mono font-bold text-midnight truncate">{acc.cvu_cbu}</p></div><button onClick={() => copyToClipboard(acc.cvu_cbu, 'CBU/CVU')} className="p-1.5 text-indigo-400 hover:text-indigo-600 opacity-0 group-hover/acc:opacity-100 transition-opacity"><Copy size={12} /></button></div>)) : <p className="text-[10px] text-slate-400 italic text-center py-2">sin cuentas registradas</p>}</div></div></div></div>
              ))}
            </div>
          </div>
        )}

        {activeTab === Tab.REQUESTS && (
          <div className="p-10 h-full overflow-y-auto no-scrollbar animate-in slide-in-from-bottom duration-700">
            <div className="flex justify-between items-center mb-12"><div><h1 className="text-3xl font-light text-midnight tracking-tight lowercase">gestión de trámites</h1><p className="text-slate-500 opacity-60 lowercase">vacaciones, cambios y licencias médicas</p></div><button onClick={() => setShowAddRequest(true)} className="px-10 py-5 bg-midnight text-white rounded-[28px] flex items-center gap-4 shadow-xl hover:scale-105 transition-all"><FilePlus size={22} /> <span className="font-bold lowercase">nueva gestión</span></button></div>
            <div className="space-y-6 pb-20">{requests.filter(req => { if (currentUser?.role === 'admin' || currentUser?.role === 'manager') return true; if (String(req.userId) === String(currentUser?.id)) return true; if (String(req.peerId) === String(currentUser?.id)) return true; return false; }).map(req => (<RequestItem key={req.id} req={req} currentUser={currentUser} hasPermission={hasPermission} handlePeerAccept={handlePeerAccept} handlePeerReject={handlePeerReject} handleApproveRequest={handleApproveRequest} openDeleteRequestModal={(id) => setConfirmDelete({ isOpen: true, id, name: 'esta solicitud', type: 'request' })} setRejectingRequestId={setRejectingRequestId} setApprovingMedicalRequestId={setApprovingMedicalRequestId} />))}</div>
          </div>
        )}

        {activeTab === Tab.DOCS && (
          <div className="p-10 h-full overflow-y-auto no-scrollbar animate-in slide-in-from-bottom duration-700">
            <div className="flex justify-between items-center mb-12"><div><h1 className="text-3xl font-light text-midnight tracking-tight lowercase">documentación</h1><p className="text-slate-500 opacity-60 lowercase">archivos corporativos y privados</p></div>{(currentUser?.role === 'admin' || currentUser?.role === 'manager' || hasPermission('canManageDocs')) && <button onClick={() => setShowAddDoc(true)} className="px-10 py-5 bg-midnight text-white rounded-[28px] flex items-center gap-4 shadow-xl hover:scale-105 transition-all"><Upload size={22} /> <span className="font-bold lowercase">subir documento</span></button>}</div>

            {!selectedFolder ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pb-20">
                {Object.entries(docFolders).map(([folderName, folderDocs]) => (
                  <div key={folderName} onClick={() => setSelectedFolder(folderName)} className="bg-white/80 backdrop-blur-xl p-8 rounded-[40px] border border-slate-50 shadow-lg transition-all hover:shadow-2xl hover:scale-105 cursor-pointer flex flex-col items-center justify-center gap-4 group text-center min-h-[200px]">
                    <div className={`p-5 rounded-3xl transition-transform group-hover:scale-110 ${folderName === 'General' ? 'bg-indigo-50 text-indigo-500 shadow-indigo-100' : 'bg-amber-50 text-amber-500 shadow-amber-100'}`}>
                      <FolderOpen size={40} />
                    </div>
                    <div>
                      <h3 className="font-bold text-midnight text-lg tracking-tight capitalize break-words line-clamp-2">{folderName}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{folderDocs.length} archivo/s</p>
                    </div>
                  </div>
                ))}
                {Object.keys(docFolders).length === 0 && (
                  <div className="col-span-full py-20 text-center"><FolderOpen size={48} className="mx-auto text-slate-200 mb-4" /><p className="text-slate-400 font-medium lowercase">no hay documentos cargados aún o no tienes permisos para verlos</p></div>
                )}
              </div>
            ) : (
              <div className="pb-20">
                <div className="flex items-center gap-4 mb-8">
                  <button onClick={() => setSelectedFolder(null)} className="p-3 bg-white text-slate-400 rounded-full hover:bg-slate-100 hover:text-midnight transition-colors shadow-sm">
                    <ChevronRight size={20} className="rotate-180" />
                  </button>
                  <h2 className="text-xl font-bold text-midnight flex items-center gap-3">
                    <FolderOpen size={24} className={selectedFolder === 'General' ? 'text-indigo-500' : 'text-amber-500'} />
                    <span className="capitalize">{selectedFolder}</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in slide-in-from-right duration-500">
                  {docFolders[selectedFolder]?.map(doc => (
                    <div key={doc.id} className="bg-white/80 backdrop-blur-xl p-8 rounded-[48px] border border-slate-50 flex flex-col shadow-lg transition-all hover:shadow-2xl animate-in slide-in-from-bottom duration-500 group relative">
                      <div className="absolute top-6 right-8 flex gap-2">
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm ${doc.visibility === 'private' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          {doc.visibility === 'private' ? <LockIcon size={10} /> : <Globe size={10} />}
                          <span className="text-[8px] font-bold uppercase tracking-widest">{doc.visibility === 'private' ? 'privado' : 'todos'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="p-4 bg-midnight/5 text-midnight rounded-[20px] shadow-inner"><Files size={24} /></div>
                        <div className="flex-1 min-w-0 pr-12">
                          <h3 className="font-bold text-midnight text-lg truncate lowercase">{doc.title}</h3>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{doc.category} <span className="mx-2 opacity-30">|</span> {doc.date}</p>
                        </div>
                      </div>
                      {doc.signatureData ? (
                        <div className="mb-6 p-4 bg-emerald-50 border-2 border-dashed border-emerald-200 rounded-2xl flex items-center gap-3 shadow-inner">
                          <Stamp size={24} className="text-emerald-500 shrink-0" />
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-600">CERTIFICADO DE FIRMA ELECTRÓNICA</span>
                            <span className="text-[9px] font-medium text-emerald-700 italic leading-tight break-all">{doc.signatureData}</span>
                          </div>
                        </div>
                      ) : doc.requiresSignature ? (
                        <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Stamp size={20} className="text-amber-500" />
                            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">pendiente de firma</span>
                          </div>
                          <button onClick={() => setSigningDocId(doc.id)} className="px-4 py-2 bg-amber-500 text-white rounded-xl text-[8px] font-bold uppercase tracking-widest shadow-sm hover:scale-105 active:scale-95 transition-all">firmar ahora</button>
                        </div>
                      ) : null}
                      {doc.allSignatures && doc.allSignatures.length > 0 && (
                        <div className="mt-6 border-t border-slate-100 pt-4">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                            <CheckCircle size={12} className="text-emerald-500" />firmas registradas ({doc.allSignatures.length})
                          </p>
                          <div className="space-y-2 max-h-40 overflow-y-auto no-scrollbar bg-slate-50/50 p-2 rounded-xl">
                            {doc.allSignatures.map((sig, i) => (
                              <div key={i} className="flex items-center gap-2 text-[10px]">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                                <span className="font-bold text-slate-600 capitalize">{sig.profiles?.full_name || 'usuario'}</span>
                                <span className="text-slate-400 ml-auto font-mono">{new Date(sig.signed_at).toLocaleDateString('es-AR')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="text-sm text-slate-500 line-clamp-2 mb-8 flex-1 lowercase mt-4">{doc.description || 'sin descripción adicional'}</p>
                      <div className="flex items-center justify-between mt-auto bg-slate-50/50 p-4 rounded-[28px] border border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">{getInitials(doc.userName || '')}</div>
                          <span className="text-[10px] font-bold text-slate-400 lowercase truncate max-w-[80px]">{doc.userName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDownload(doc.fileUrl, doc.title)} title="descargar" className="p-3 bg-white text-indigo-600 rounded-2xl hover:bg-indigo-600 hover:text-white shadow-sm transition-all active:scale-95"><Download size={18} /></button>
                          <button onClick={() => handlePreview(doc.fileUrl)} title="ver en pestaña" className="p-3 bg-white text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white shadow-sm transition-all active:scale-95"><ExternalLink size={18} /></button>
                          {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                            <button onClick={() => setConfirmDelete({ isOpen: true, id: doc.id, name: doc.title, type: 'document' })} className="p-3 bg-white text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white shadow-sm transition-all opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(activeTab === Tab.TELEGRAM && (currentUser?.role === 'admin' || currentUser?.role === 'manager' || hasPermission('canViewTelegram'))) && (
          <div className="p-8 h-full overflow-y-auto no-scrollbar animate-in slide-in-from-bottom duration-700">
            <div className="max-w-4xl mx-auto space-y-10 pb-20">
              <div className="flex justify-between items-center mb-6"><div><h1 className="text-3xl font-light text-midnight tracking-tight">notificaciones telegram</h1><p className="text-slate-500 lowercase">comunica los ingresos y egresos automáticamente a un grupo</p></div></div>
              <div className="bg-white/90 backdrop-blur-xl p-12 rounded-[56px] border border-white shadow-2xl space-y-10">
                <div className="flex items-center gap-6 border-b border-slate-100 pb-8"><div className="p-5 bg-[#0088cc] text-white rounded-3xl shadow-xl"><Send size={32} /></div><div className="flex-1"><h3 className="text-xl font-bold text-midnight tracking-tight lowercase">bot corporativo</h3><p className="text-sm text-slate-400 lowercase">configura tu bot de telegram para reportes en tiempo real.</p></div><button onClick={() => setTelegramConfig({ ...telegramConfig, enabled: !telegramConfig.enabled })} className={`w-16 h-8 rounded-full relative transition-all duration-300 ${telegramConfig.enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm transition-all duration-300 ${telegramConfig.enabled ? 'right-1' : 'left-1'}`}></div></button></div>
                <div className="space-y-8">
                  <div className="grid grid-cols-1 gap-8">
                    <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">token del bot (proporcionado por @botfather)</label><input type="password" className="w-full bg-slate-50 border border-slate-100 rounded-[28px] px-8 py-5 text-sm font-mono text-midnight outline-none focus:ring-2 ring-[#0088cc]/20" value={telegramConfig.botToken} placeholder="0000000000:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" onChange={e => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })} /></div>
                    <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">id del chat o grupo (debe empezar con - si es grupo)</label><input className="w-full bg-slate-50 border border-slate-100 rounded-[28px] px-8 py-5 text-sm font-mono font-bold text-midnight outline-none focus:ring-2 ring-[#0088cc]/20" value={telegramConfig.chatId} placeholder="-100123456789" onChange={e => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })} /></div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 pt-4"><button onClick={handleTestTelegram} disabled={isTestingTelegram || !telegramConfig.botToken || !telegramConfig.chatId} className="flex-1 py-5 bg-indigo-50 text-indigo-600 rounded-[28px] text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-100 transition-colors border border-indigo-100 disabled:opacity-50">{isTestingTelegram ? <Loader2 className="animate-spin" size={16} /> : <SendHorizontal size={16} />}probar conexión</button><button onClick={handleSaveTelegramConfig} disabled={isSavingTelegram} className="flex-1 py-5 bg-midnight text-white rounded-[28px] text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-slate-800 transition-colors shadow-xl disabled:opacity-50">{isSavingTelegram ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}guardar configuración</button></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {(activeTab === Tab.SETTINGS && (currentUser?.role === 'admin' || currentUser?.role === 'manager' || hasPermission('canViewSettings'))) && (
          <div className="p-8 h-full overflow-y-auto no-scrollbar animate-in slide-in-from-bottom duration-700">
            <div className="max-w-4xl mx-auto space-y-10 pb-20">
              <div className="flex justify-between items-center mb-6"><div><h1 className="text-3xl font-light text-midnight tracking-tight">ajustes de sistema</h1><p className="text-slate-500 lowercase">configuración de geolocalización y parámetros globales</p></div></div>
              <div className="bg-white/90 backdrop-blur-xl p-12 rounded-[56px] border border-white shadow-2xl space-y-10">
                <div className="flex items-center gap-6 border-b border-slate-100 pb-8"><div className="p-5 bg-midnight text-white rounded-3xl shadow-xl"><MapPin size={32} /></div><div><h3 className="text-xl font-bold text-midnight tracking-tight lowercase">ubicación del local</h3><p className="text-sm text-slate-400 lowercase">define el punto geográfico y el radio permitido para fichar.</p></div></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">latitud</label><input className="w-full bg-slate-50 border border-slate-100 rounded-[28px] px-8 py-5 text-sm font-mono font-bold text-midnight outline-none focus:ring-2 ring-indigo-200" value={officeLocation.lat} onChange={e => { const val = e.target.value; if (val === '' || val === '-' || val === '.' || val === '-.' || !isNaN(val as any)) setOfficeLocation({ ...officeLocation, lat: val as any }); }} /></div>
                    <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">longitud</label><input className="w-full bg-slate-50 border border-slate-100 rounded-[28px] px-8 py-5 text-sm font-mono font-bold text-midnight outline-none focus:ring-2 ring-indigo-200" value={officeLocation.lng} onChange={e => { const val = e.target.value; if (val === '' || val === '-' || val === '.' || val === '-.' || !isNaN(val as any)) setOfficeLocation({ ...officeLocation, lng: val as any }); }} /></div>
                  </div>
                  <div className="space-y-6">
                    <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">radio permitido (metros)</label><div className="relative"><input type="range" min="10" max="1000" step="10" className="w-full h-2 bg-indigo-50 rounded-lg appearance-none cursor-pointer accent-midnight" value={officeLocation.radius} onChange={e => setOfficeLocation({ ...officeLocation, radius: parseInt(e.target.value) })} /><div className="flex justify-between mt-3 px-2"><span className="text-[10px] font-bold text-slate-300">10m</span><span className="text-sm font-bold text-indigo-600">{officeLocation.radius}m</span><span className="text-[10px] font-bold text-slate-300">1km</span></div></div></div>
                    <button
                      onClick={async () => {
                        setIsSavingSettings(true);
                        try {
                          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(resolve, reject, {
                              enableHighAccuracy: true,
                              timeout: 10000
                            });
                          });
                          setOfficeLocation(prev => ({
                            ...prev,
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude
                          }));
                          addToast("ubicación detectada", "coordenadas actuales cargadas", "success");
                        } catch (e: any) {
                          addToast("error gps", "revisa permisos de ubicación en tu navegador", "error");
                        } finally {
                          setIsSavingSettings(false);
                        }
                      }}
                      className="w-full py-5 bg-indigo-50 text-indigo-600 rounded-[28px] text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-100 transition-colors border border-indigo-100"
                    >
                      <Navigation size={16} /> obtener mi ubicación física actual
                    </button>
                  </div>
                </div>
                <div className="pt-8 border-b border-slate-100 pb-10"><button onClick={handleSaveAppSettings} disabled={isSavingSettings} className="w-full bg-midnight text-white rounded-[32px] py-8 font-bold shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 lowercase">{isSavingSettings ? <Loader2 className="animate-spin" size={24} /> : <><Save size={22} /><span className="text-lg">guardar configuración de local</span></>}</button></div>

                <div className="mt-10 bg-indigo-50/30 p-10 rounded-[48px] border border-indigo-100/50 space-y-8 animate-in slide-in-from-bottom duration-1000">
                  <div className="flex items-center gap-6"><div className="p-4 bg-indigo-500 text-white rounded-2xl shadow-lg"><MessageSquare size={28} /></div><div><h3 className="text-xl font-bold text-midnight lowercase">alertas de trámites</h3><p className="text-sm text-slate-400 lowercase">recibe un email cuando un empleado genere una solicitud.</p></div></div>
                  <div className="flex flex-col md:flex-row gap-4">
                    <input type="email" placeholder="rrhh@empresa.com" className="flex-1 bg-white border border-indigo-200 rounded-[24px] px-6 py-4 text-sm outline-none focus:ring-2 ring-indigo-300 font-bold text-midnight" value={notifyEmail} onChange={e => setNotifyEmail(e.target.value)} />
                    <button onClick={handleSaveNotifyEmail} disabled={isSavingEmail} className="px-8 py-4 bg-indigo-600 text-white rounded-[24px] font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg flex items-center justify-center gap-2">
                      {isSavingEmail ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} guardar correo
                    </button>
                  </div>
                  <p className="text-[9px] text-indigo-400 italic lowercase ml-4">*importante: la primera vez que configures el correo, formsubmit te enviará un mensaje para verificar y activar el servicio. debes abrirlo y darle a confirmar.</p>
                </div>

                <div className="mt-10 bg-rose-50/30 p-10 rounded-[48px] border border-rose-100/50 space-y-8 animate-in slide-in-from-bottom duration-1000">
                  <div className="flex items-center gap-6"><div className="p-4 bg-rose-500 text-white rounded-2xl shadow-lg"><Beaker size={28} /></div><div><h3 className="text-xl font-bold text-midnight lowercase">laboratorio de pruebas</h3><p className="text-sm text-slate-400 lowercase">simula entornos ficticios para testear bloqueos y GPS.</p></div><button onClick={() => setIsLabMode(!isLabMode)} className={`ml-auto w-16 h-8 rounded-full relative transition-all duration-300 ${isLabMode ? 'bg-rose-500' : 'bg-slate-200'}`}><div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm transition-all duration-300 ${isLabMode ? 'right-1' : 'left-1'}`}></div></button></div>
                  {isLabMode && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
                      <div className="space-y-4"><label className="text-[10px] uppercase font-bold tracking-widest text-rose-500 ml-4 block">simular fecha y hora</label><input type="datetime-local" className="w-full bg-white border border-rose-200 rounded-[24px] px-6 py-4 text-sm outline-none focus:ring-2 ring-rose-300 font-bold" value={simulatedDateTime} onChange={e => setSimulatedDateTime(e.target.value)} /><p className="text-[9px] text-rose-400 italic lowercase ml-4">*esto afectará los cálculos de las 14hs y vigencia de licencias.</p></div>
                      <div className="space-y-4"><label className="text-[10px] uppercase font-bold tracking-widest text-rose-500 ml-4 block">simular coordenadas gps (para testear errores de radio)</label><div className="flex gap-2"><input placeholder="latitud" className="flex-1 bg-white border border-rose-200 rounded-[20px] px-6 py-4 text-xs outline-none" value={simulatedLat} onChange={e => setSimulatedLat(e.target.value)} /><input placeholder="longitud" className="flex-1 bg-white border border-rose-200 rounded-[20px] px-6 py-4 text-xs outline-none" value={simulatedLng} onChange={e => setSimulatedLng(e.target.value)} /></div><p className="text-[9px] text-rose-400 italic lowercase ml-4">*esto afectará únicamente al Panel de Ingreso.</p></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: LICENCIAS ACTIVAS (NUEVO) */}
      {showLicensesModal && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-6 bg-midnight/40 backdrop-blur-md">
          <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in border border-white p-10">
            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-8"><Calendar size={32} /></div>
            <h3 className="text-xl font-bold text-midnight mb-2 tracking-tight lowercase">licencias vigentes</h3>
            <p className="text-slate-400 text-sm mb-8 lowercase">personal actualmente en licencia médica o vacaciones.</p>
            <div className="space-y-4 mb-8 max-h-[50vh] overflow-y-auto no-scrollbar">
              {activeLicenses.length > 0 ? activeLicenses.map(lic => (
                <div key={lic.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <p className="text-sm font-bold text-midnight capitalize mb-1">{lic.userName}</p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest ${lic.type === 'licencia médica' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>{lic.type}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">desde {formatDateDisplay(lic.metadata?.startDate)} hasta {formatDateDisplay(lic.metadata?.endDate)}</p>
                </div>
              )) : <p className="text-center text-slate-400 text-xs italic py-4">no hay licencias activas hoy.</p>}
            </div>
            <button onClick={() => setShowLicensesModal(false)} className="w-full py-5 bg-midnight text-white rounded-[24px] font-bold text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-colors lowercase">cerrar</button>
          </div>
        </div>
      )}

      {showEditShiftModal && editingShift && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-6 bg-midnight/40 backdrop-blur-md">
          <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in border border-white p-10">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-8"><History size={32} /></div>
            <h3 className="text-xl font-bold text-midnight mb-2 tracking-tight lowercase">editar asistencia</h3>
            <div className="space-y-6 mb-10">
              <div><label className="text-[9px] uppercase font-bold tracking-widest text-slate-400 ml-2 mb-2 block">entrada</label><input type="datetime-local" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-midnight outline-none focus:ring-2 ring-indigo-100" value={formatForDatetimeLocal(editingShift.check_in)} onChange={e => { const val = e.target.value; if (!val) return; setEditingShift({ ...editingShift, check_in: new Date(val).toISOString() }); }} /></div>
              <div><label className="text-[9px] uppercase font-bold tracking-widest text-slate-400 ml-2 mb-2 block">salida (opcional)</label><input type="datetime-local" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-midnight outline-none focus:ring-2 ring-indigo-100" value={formatForDatetimeLocal(editingShift.check_out)} onChange={e => { const val = e.target.value; setEditingShift({ ...editingShift, check_out: val ? new Date(val).toISOString() : null }); }} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4"><button onClick={() => { setShowEditShiftModal(false); setEditingShift(null); }} className="py-5 bg-slate-100 text-slate-500 rounded-[24px] font-bold text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors lowercase">cancelar</button><button onClick={handleUpdateShift} disabled={isSaving} className="py-5 bg-midnight text-white rounded-[24px] font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-900 transition-colors lowercase flex items-center justify-center gap-2">{isSaving ? <Loader2 className="animate-spin" size={14} /> : 'guardar'}</button></div>
          </div>
        </div>
      )}

      {showAddRequest && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-md overflow-y-auto no-scrollbar">
          <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-2xl my-8 animate-in slide-in-from-bottom duration-500 border border-white overflow-hidden">
            <div className="px-10 py-8 bg-slate-50 flex justify-between items-center border-b border-slate-100">
              <div className="flex items-center gap-4"><div className="p-3 bg-midnight text-white rounded-2xl"><FilePlus size={24} /></div><h3 className="text-xl font-bold text-midnight tracking-tight">nueva gestión</h3></div>
              <button onClick={() => setShowAddRequest(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">tipo de trámite</label><div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{['vacaciones', 'licencia médica', 'cambio de turno'].map(t => (<button key={t} onClick={() => setNewRequest({ ...newRequest, type: t as any })} className={`py-4 rounded-3xl text-[10px] font-bold uppercase tracking-widest transition-all border ${newRequest.type === t ? 'bg-midnight text-white border-midnight shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200'}`}>{t}</button>))}</div></div>
              {newRequest.type === 'vacaciones' && (
                <div className="grid grid-cols-2 gap-6 animate-in fade-in">
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">desde</label><input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none focus:ring-2 ring-indigo-100" onChange={e => setNewRequest({ ...newRequest, metadata: { ...newRequest.metadata, startDate: e.target.value, totalDays: calculateTotalDays(e.target.value, newRequest.metadata.endDate) } })} /></div>
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">hasta</label><input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none focus:ring-2 ring-indigo-100" onChange={e => setNewRequest({ ...newRequest, metadata: { ...newRequest.metadata, endDate: e.target.value, totalDays: calculateTotalDays(newRequest.metadata.startDate, e.target.value) } })} /></div>
                </div>
              )}
              {newRequest.type === 'licencia médica' && (
                <div className="space-y-6 animate-in fade-in">
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">fecha de inicio</label><input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none" onChange={e => setNewRequest({ ...newRequest, metadata: { ...newRequest.metadata, startDate: e.target.value } })} /></div>
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">certificado médico (adjunto opcional)</label>
                    <div onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }} onDragLeave={() => setIsDraggingFile(false)} onDrop={handleCertificateDrop} className={`border-2 border-dashed rounded-[32px] p-8 text-center transition-all ${isDraggingFile ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-100 bg-slate-50'} ${newRequest.metadata.certificateUrl ? 'border-emerald-200 bg-emerald-50/20' : ''}`}>
                      {newRequest.metadata.certificateUrl ? (<div className="flex flex-col items-center gap-3"><CheckCircle className="text-emerald-500" size={32} /><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">archivo adjunto correctamente</p><button onClick={() => setNewRequest({ ...newRequest, metadata: { ...newRequest.metadata, certificateUrl: '' } })} className="text-[9px] text-rose-500 underline uppercase tracking-tighter">quitar archivo</button></div>) : (<><ImageIcon className="mx-auto text-slate-300 mb-4" size={32} /><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">arrastra el certificado o</p><label className="px-6 py-2 bg-white text-midnight border border-slate-200 rounded-full text-[9px] font-bold uppercase tracking-widest cursor-pointer shadow-sm hover:bg-slate-50">seleccionar archivo<input type="file" className="hidden" accept="image/*,.pdf" onChange={e => e.target.files?.[0] && processCertificate(e.target.files[0])} /></label></>)}
                    </div>
                  </div>
                </div>
              )}
              {newRequest.type === 'cambio de turno' && (
                <div className="space-y-6 animate-in fade-in">
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">¿con quién quieres cambiar?</label><select className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none focus:ring-2 ring-indigo-100" value={newRequest.peerId} onChange={e => setNewRequest({ ...newRequest, peerId: e.target.value })}><option value="">seleccionar compañero</option>{employees.filter(e => e.id !== currentUser?.id).map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}</select></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                    <div className="space-y-4"><span className="text-[9px] font-bold uppercase tracking-widest text-midnight ml-2">tu turno actual</span><input type="date" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs outline-none" onChange={e => setNewRequest({ ...newRequest, metadata: { ...newRequest.metadata, dateA: e.target.value } })} /><div className="flex gap-2"><input type="time" className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs outline-none" value={newRequest.metadata.timeStartA} onChange={e => setNewRequest({ ...newRequest, metadata: { ...newRequest.metadata, timeStartA: e.target.value } })} /><input type="time" className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs outline-none" value={newRequest.metadata.timeEndA} onChange={e => setNewRequest({ ...newRequest, metadata: { ...newRequest.metadata, timeEndA: e.target.value } })} /></div></div>
                    <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6"><span className="text-[9px] font-bold uppercase tracking-widest text-indigo-600 ml-2">turno del compañero</span><input type="date" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs outline-none" onChange={e => setNewRequest({ ...newRequest, metadata: { ...newRequest.metadata, dateB: e.target.value } })} /><div className="flex gap-2"><input type="time" className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs outline-none" value={newRequest.metadata.timeStartB} onChange={e => setNewRequest({ ...newRequest, metadata: { ...newRequest.metadata, timeStartB: e.target.value } })} /><input type="time" className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs outline-none" value={newRequest.metadata.timeEndB} onChange={e => setNewRequest({ ...newRequest, metadata: { ...newRequest.metadata, timeEndB: e.target.value } })} /></div></div>
                  </div>
                </div>
              )}
              <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">motivo / detalle</label><textarea className="w-full bg-slate-50 border border-slate-100 rounded-[32px] px-8 py-6 text-sm font-medium text-midnight outline-none focus:ring-2 ring-indigo-100 resize-none h-32 lowercase" value={newRequest.reason} onChange={e => setNewRequest({ ...newRequest, reason: e.target.value })} placeholder="describe brevemente tu solicitud..." /></div>
            </div>
            <div className="px-10 py-10 bg-slate-50 border-t border-slate-100 flex gap-4"><button onClick={() => setShowAddRequest(false)} className="flex-1 py-5 bg-white text-slate-400 rounded-full font-bold text-[10px] uppercase tracking-widest border border-slate-100 hover:bg-slate-100 transition-colors">cancelar</button><button onClick={handleSaveRequest} disabled={isSaving} className="flex-1 py-5 bg-midnight text-white rounded-full font-bold text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2">{isSaving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} enviar solicitud</button></div>
          </div>
        </div>
      )}

      {showAddDoc && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-md overflow-y-auto no-scrollbar">
          <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-xl animate-in zoom-in duration-300 border border-white overflow-hidden">
            <div className="px-10 py-8 bg-slate-50 flex justify-between items-center border-b border-slate-100">
              <div className="flex items-center gap-4"><div className="p-3 bg-midnight text-white rounded-2xl"><Upload size={24} /></div><h3 className="text-xl font-bold text-midnight tracking-tight">subir documento</h3></div>
              <button onClick={() => setShowAddDoc(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <div className="p-10 space-y-6">
              <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">título del archivo</label><input className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none focus:ring-2 ring-indigo-100" value={newDoc.title} onChange={e => setNewDoc({ ...newDoc, title: e.target.value })} placeholder="ej: recibo de sueldo - marzo 2024" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">categoría</label><select className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-6 py-4 text-xs font-bold outline-none" value={newDoc.category} onChange={e => setNewDoc({ ...newDoc, category: e.target.value as any })}><option value="recibo de sueldo">recibo de sueldo</option><option value="memo">memo / comunicado</option><option value="tutoriales">tutorial / guía</option><option value="otros">otros</option></select></div>
                <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">visibilidad</label><select className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-6 py-4 text-xs font-bold outline-none" value={newDoc.visibility} onChange={e => setNewDoc({ ...newDoc, visibility: e.target.value as any })}><option value="public">todos (público)</option><option value="private">personal específico (privado)</option></select></div>
              </div>
              {newDoc.visibility === 'private' && (
                <div className="animate-in slide-in-from-top-4"><label className="text-[10px] uppercase font-bold tracking-widest text-rose-500 ml-4 mb-3 block">destinatario del documento</label><select className="w-full bg-rose-50 border border-rose-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none" value={newDoc.targetUserId} onChange={e => setNewDoc({ ...newDoc, targetUserId: e.target.value })}><option value="">seleccionar integrante</option>{employees.map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}</select></div>
              )}
              <div className="flex items-center gap-4 px-6 py-4 bg-slate-50 rounded-3xl border border-slate-100"><button onClick={() => setNewDoc({ ...newDoc, requiresSignature: !newDoc.requiresSignature })} className={`w-12 h-6 rounded-full relative transition-all duration-300 ${newDoc.requiresSignature ? 'bg-amber-500' : 'bg-slate-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${newDoc.requiresSignature ? 'right-1' : 'left-1'}`}></div></button><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">requiere firma electrónica con validez legal</span></div>
              <div onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }} onDragLeave={() => setIsDraggingFile(false)} onDrop={handleFileDrop} className={`border-2 border-dashed rounded-[40px] p-12 text-center transition-all ${isDraggingFile ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-100 bg-slate-50'} ${newDoc.fileUrl ? 'border-emerald-200 bg-emerald-50/20' : ''}`}>
                {newDoc.fileUrl ? (<div className="flex flex-col items-center gap-4"><CheckCircle className="text-emerald-500" size={48} /><p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">documento cargado listo para subir</p><button onClick={() => setNewDoc({ ...newDoc, fileUrl: '' })} className="text-[10px] text-rose-500 underline uppercase tracking-widest">cambiar archivo</button></div>) : (<><FileUp className="mx-auto text-slate-300 mb-6" size={48} /><p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">arrastra el pdf/imagen aquí</p><label className="px-8 py-3 bg-white text-midnight border border-slate-200 rounded-full text-[10px] font-bold uppercase tracking-widest cursor-pointer shadow-md hover:scale-105 transition-all">explorar archivos<input type="file" className="hidden" accept=".pdf,image/*" onChange={handleDocFileChange} /></label></>)}
              </div>
              <textarea className="w-full bg-slate-50 border border-slate-100 rounded-[32px] px-8 py-6 text-sm font-medium text-midnight outline-none focus:ring-2 ring-indigo-100 resize-none h-24 lowercase" value={newDoc.description} onChange={e => setNewDoc({ ...newDoc, description: e.target.value })} placeholder="descripción adicional (opcional)..." />
            </div>
            <div className="px-10 py-10 bg-slate-50 border-t border-slate-100 flex gap-4"><button onClick={() => setShowAddDoc(false)} className="flex-1 py-5 bg-white text-slate-400 rounded-full font-bold text-[10px] uppercase tracking-widest border border-slate-100 transition-colors">cancelar</button><button onClick={handleSaveDocument} disabled={isSaving} className="flex-1 py-5 bg-midnight text-white rounded-full font-bold text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3">{isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} guardar documento</button></div>
          </div>
        </div>
      )}

      {(showAddEmployee || showEditEmployeeModal) && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-md overflow-y-auto no-scrollbar">
          <div className="bg-white rounded-[56px] shadow-2xl w-full max-w-3xl my-8 animate-in slide-in-from-bottom duration-500 border border-white overflow-hidden">
            <div className="px-12 py-10 bg-slate-50 flex justify-between items-center border-b border-slate-100">
              <div className="flex items-center gap-6"><div className="p-4 bg-midnight text-white rounded-[24px] shadow-xl">{showEditEmployeeModal ? <Pencil size={28} /> : <UserPlus size={28} />}</div><div><h3 className="text-2xl font-bold text-midnight tracking-tight">{showEditEmployeeModal ? 'editar integrante' : 'nuevo integrante'}</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">completa la ficha de legajo corporativo</p></div></div>
              <button onClick={() => { setShowAddEmployee(false); setShowEditEmployeeModal(false); }} className="p-4 hover:bg-slate-200 rounded-full transition-colors text-slate-400"><X size={32} /></button>
            </div>
            <div className="p-12 space-y-10 max-h-[75vh] overflow-y-auto no-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">nombre completo</label><input className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none focus:ring-2 ring-indigo-100 capitalize" value={newEmployee.name} onChange={e => setNewEmployee({ ...newEmployee, name: e.target.value })} placeholder="ej: juan manuel pérez" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">dni</label><input className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-6 py-4 text-xs font-bold text-midnight outline-none" value={newEmployee.dni} onChange={e => setNewEmployee({ ...newEmployee, dni: e.target.value })} placeholder="12345678" /></div>
                    <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">cuil</label><input className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-6 py-4 text-xs font-bold text-midnight outline-none" value={newEmployee.cuil} onChange={e => setNewEmployee({ ...newEmployee, cuil: e.target.value })} placeholder="20-12345678-1" /></div>
                  </div>
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">email corporativo</label><input type="email" className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none" value={newEmployee.email} onChange={e => setNewEmployee({ ...newEmployee, email: e.target.value })} placeholder="usuario@empresa.com" /></div>
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">teléfono / whatsapp</label><input className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none" value={newEmployee.phone} onChange={e => setNewEmployee({ ...newEmployee, phone: e.target.value })} placeholder="+54 9 11 ..." /></div>
                </div>
                <div className="space-y-6">
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">rol / jerarquía</label><select className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none" value={newEmployee.role} onChange={e => setNewEmployee({ ...newEmployee, role: e.target.value as any })}><option value="empleado">empleado</option><option value="manager">manager / supervisor</option><option value="admin">administrador</option></select></div>
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">pin de acceso (4-8 dígitos)</label><input type="text" maxLength={8} className="w-full bg-indigo-50 border border-indigo-100 rounded-3xl px-8 py-5 text-sm font-mono font-bold text-center tracking-[0.5em] text-indigo-600 outline-none" value={newEmployee.pin} onChange={e => setNewEmployee({ ...newEmployee, pin: e.target.value })} placeholder="0000" /></div>
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">domicilio legal</label><input className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none" value={newEmployee.address} onChange={e => setNewEmployee({ ...newEmployee, address: e.target.value })} placeholder="calle, altura, ciudad..." /></div>
                  <div><label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 ml-4 mb-3 block">fecha de nacimiento</label><input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-sm font-bold text-midnight outline-none" value={newEmployee.birthDate} onChange={e => setNewEmployee({ ...newEmployee, birthDate: e.target.value })} /></div>
                </div>
              </div>
              <div className="bg-indigo-50/30 p-8 rounded-[40px] border border-indigo-100/50 space-y-6">
                <div className="flex justify-between items-center"><div className="flex items-center gap-3"><Wallet className="text-indigo-600" size={20} /><h4 className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">cuentas bancarias (para pagos)</h4></div><button onClick={() => setNewEmployee({ ...newEmployee, bankAccounts: [...newEmployee.bankAccounts, { bankName: '', cvu_cbu: '' }] })} className="p-2 bg-white text-indigo-500 rounded-xl hover:bg-indigo-600 hover:text-white shadow-sm transition-all"><Plus size={16} /></button></div>
                {newEmployee.bankAccounts.map((acc, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                    <input className="bg-white border border-indigo-100 rounded-2xl px-6 py-4 text-xs font-bold outline-none" placeholder="nombre del banco" value={acc.bankName} onChange={e => { const list = [...newEmployee.bankAccounts]; list[i].bankName = e.target.value; setNewEmployee({ ...newEmployee, bankAccounts: list }); }} />
                    <div className="flex gap-2"><input className="flex-1 bg-white border border-indigo-100 rounded-2xl px-6 py-4 text-[10px] font-mono font-bold outline-none" placeholder="CBU / CVU (22 dígitos)" value={acc.cvu_cbu} onChange={e => { const list = [...newEmployee.bankAccounts]; list[i].cvu_cbu = e.target.value; setNewEmployee({ ...newEmployee, bankAccounts: list }); }} /><button onClick={() => { const list = newEmployee.bankAccounts.filter((_, idx) => idx !== i); setNewEmployee({ ...newEmployee, bankAccounts: list.length > 0 ? list : [{ bankName: '', cvu_cbu: '' }] }); }} className="p-4 text-rose-400 hover:bg-rose-50 rounded-2xl transition-colors"><Trash2 size={18} /></button></div>
                  </div>
                ))}
              </div>
              <div className="bg-slate-900 text-white p-10 rounded-[48px] space-y-8 shadow-2xl relative overflow-hidden"><div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                <div className="relative z-10"><div className="flex items-center gap-3 mb-8"><ShieldCheck className="text-emerald-400" size={24} /><h4 className="text-[11px] font-bold uppercase tracking-widest text-white/80">permisos de acceso y gestión</h4></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
                    {Object.entries({ canManageStaff: 'gestionar personal', canApproveRequests: 'autorizar trámites', canManageDocs: 'subir documentos', canViewSchedules: 'ver horarios', canViewAssistant: 'usar asistente ia', canViewTelegram: 'configurar telegram', canViewSettings: 'ajustes globales', canRegisterAttendance: 'fichar ingresos' }).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between group cursor-pointer" onClick={() => setNewEmployee({ ...newEmployee, permissions: { ...newEmployee.permissions, [key]: !newEmployee.permissions[key as keyof UserPermissions] } })}><span className="text-[10px] font-bold uppercase tracking-widest text-white/50 group-hover:text-white transition-colors">{label}</span><button className={`w-12 h-6 rounded-full relative transition-all duration-500 ${newEmployee.permissions[key as keyof UserPermissions] ? 'bg-emerald-500' : 'bg-white/10'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-500 ${newEmployee.permissions[key as keyof UserPermissions] ? 'right-1' : 'left-1'}`}></div></button></div>
                    ))}
                  </div></div>
              </div>
            </div>
            <div className="px-12 py-12 bg-slate-50 border-t border-slate-100 flex gap-6"><button onClick={() => { setShowAddEmployee(false); setShowEditEmployeeModal(false); }} className="flex-1 py-6 bg-white text-slate-400 rounded-full font-bold text-[10px] uppercase tracking-widest border border-slate-100 transition-colors">cancelar edición</button><button onClick={showEditEmployeeModal ? handleUpdateEmployee : handleSaveEmployee} disabled={isSaving} className="flex-1 py-6 bg-midnight text-white rounded-full font-bold text-[10px] uppercase tracking-widest shadow-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3">{isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {showEditEmployeeModal ? 'actualizar ficha' : 'crear legajo'}</button></div>
          </div>
        </div>
      )}

      {confirmDelete.isOpen && (
        <div className="fixed inset-0 z-[1700] flex items-center justify-center p-6 bg-rose-950/20 backdrop-blur-xl">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300 border border-rose-100 p-10 text-center">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-8 mx-auto shadow-inner"><ShieldAlert size={40} /></div>
            <h3 className="text-xl font-bold text-midnight mb-2">¿eliminar registro?</h3>
            <p className="text-slate-400 text-sm mb-10 lowercase">estás a punto de borrar a <span className="font-bold text-slate-600">"{confirmDelete.name}"</span> de forma permanente.</p>
            <div className="grid grid-cols-2 gap-4"><button onClick={() => setConfirmDelete({ ...confirmDelete, isOpen: false })} className="py-5 bg-slate-50 text-slate-400 rounded-[24px] font-bold text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-colors">cancelar</button><button onClick={handleConfirmDelete} disabled={isSaving} className="py-5 bg-rose-500 text-white rounded-[24px] font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-rose-200 hover:bg-rose-600 transition-colors flex items-center justify-center gap-2">{isSaving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} confirmar</button></div>
          </div>
        </div>
      )}

      {rejectingRequestId && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-6 bg-midnight/40 backdrop-blur-md">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md animate-in zoom-in border border-white p-10">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mb-8"><ShieldAlert size={32} /></div>
            <h3 className="text-xl font-bold text-midnight mb-2 tracking-tight">rechazar solicitud</h3>
            <p className="text-slate-400 text-sm mb-6 lowercase">indica el motivo del rechazo para informar al solicitante.</p>
            <textarea className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-6 py-5 text-sm font-medium text-midnight outline-none focus:ring-2 ring-rose-100 resize-none h-32 mb-8 lowercase" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="ej: no hay cupo disponible para esa fecha..." />
            <div className="grid grid-cols-2 gap-4"><button onClick={() => { setRejectingRequestId(null); setRejectionReason(''); }} className="py-5 bg-slate-100 text-slate-500 rounded-[24px] font-bold text-[10px] uppercase tracking-widest">cancelar</button><button onClick={() => handleApproveRequest(rejectingRequestId, 'rechazado', rejectionReason)} disabled={isSaving || !rejectionReason} className="py-5 bg-rose-500 text-white rounded-[24px] font-bold text-[10px] uppercase tracking-widest shadow-xl disabled:opacity-50">rechazar trámite</button></div>
          </div>
        </div>
      )}

      {approvingMedicalRequestId && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-6 bg-midnight/40 backdrop-blur-md">
          <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-md animate-in zoom-in border border-white p-10">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mb-8"><Stethoscope size={32} /></div>
            <h3 className="text-xl font-bold text-midnight mb-2 tracking-tight">validar licencia médica</h3>
            <p className="text-slate-400 text-sm mb-8 lowercase">define el periodo autorizado según el certificado presentado.</p>
            <div className="space-y-6 mb-10">
              <div><label className="text-[9px] uppercase font-bold tracking-widest text-slate-400 ml-2 mb-2 block">fecha de inicio</label><input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-midnight outline-none focus:ring-2 ring-emerald-100" value={approvalStartDate} onChange={e => setApprovalStartDate(e.target.value)} /></div>
              <div><label className="text-[9px] uppercase font-bold tracking-widest text-slate-400 ml-2 mb-2 block">fecha de finalización</label><input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-midnight outline-none focus:ring-2 ring-emerald-100" value={approvalEndDate} onChange={e => setApprovalEndDate(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4"><button onClick={() => setApprovingMedicalRequestId(null)} className="py-5 bg-slate-100 text-slate-500 rounded-[24px] font-bold text-[10px] uppercase tracking-widest">cancelar</button><button onClick={handleApproveMedicalLicense} disabled={isSaving || !approvalStartDate || !approvalEndDate} className="py-5 bg-emerald-500 text-white rounded-[24px] font-bold text-[10px] uppercase tracking-widest shadow-xl disabled:opacity-50">autorizar licencia</button></div>
          </div>
        </div>
      )}

      {signingDocId && (
        <div className="fixed inset-0 z-[1800] flex items-center justify-center p-6 bg-midnight/80 backdrop-blur-2xl">
          <div className="bg-white rounded-[56px] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-105 duration-500 border border-white p-12 text-center">
            <div className="w-24 h-24 bg-amber-50 text-amber-500 rounded-3xl flex items-center justify-center mb-10 mx-auto shadow-inner"><Stamp size={56} /></div>
            <h3 className="text-2xl font-bold text-midnight mb-4">sala de firma electrónica</h3>
            <p className="text-slate-400 text-sm mb-10 lowercase px-4">al hacer clic en "firmar documento", se generará un <span className="font-bold text-amber-600">certificado criptográfico</span> vinculado a tu DNI y fecha actual.</p>
            <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 mb-10 text-left"><p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-2">declaración jurada:</p><p className="text-[10px] leading-relaxed text-slate-600 lowercase italic">"declaro bajo juramento que los datos suministrados son verídicos y que mi firma electrónica implica la aceptación de los términos."</p></div>
            <div className="grid grid-cols-2 gap-6"><button onClick={() => setSigningDocId(null)} className="py-6 bg-slate-100 text-slate-500 rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors">cancelar</button><button onClick={handleSignDocument} disabled={isSaving} className="py-6 bg-amber-500 text-white rounded-full font-bold text-[10px] uppercase tracking-widest shadow-2xl hover:bg-amber-600 transition-all flex items-center justify-center gap-3">{isSaving ? <Loader2 size={18} className="animate-spin" /> : <PenTool size={18} />} firmar documento</button></div>
          </div>
        </div>
      )}

      {showSqlModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-midnight/70 backdrop-blur-xl">
          <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-500 overflow-hidden border border-white">
            <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4 text-midnight"><div className="p-3 bg-midnight text-white rounded-2xl"><Database size={24} /></div><h3 className="text-xl font-bold tracking-tight">esquema de base de datos <span className="text-indigo-500 font-light ml-2">v{SQL_VERSION}</span></h3></div>
              <button onClick={() => setShowSqlModal(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <div className="flex-1 p-10 overflow-y-auto no-scrollbar bg-slate-900"><pre className="text-[10px] font-mono text-emerald-400 selection:bg-white/10 p-6 bg-black/30 rounded-3xl border border-white/5 leading-relaxed"><code>{getSupabaseSQL()}</code></pre></div>
            <div className="px-10 py-10 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest max-w-sm lowercase">copia y pega este script en el editor sql de tu proyecto de supabase para reparar o inicializar tablas.</p>
              <button onClick={() => { copyToClipboard(getSupabaseSQL(), 'Script SQL'); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000); }} className={`flex items-center gap-3 px-10 py-5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-xl ${sqlCopied ? 'bg-emerald-500 text-white' : 'bg-midnight text-white hover:bg-indigo-600'}`}>{sqlCopied ? <><Check size={16} /> copiado</> : <><Copy size={16} /> copiar script completo</>}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast System */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[2000] flex flex-col gap-3 pointer-events-none w-full max-w-xs px-4">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto animate-in slide-in-from-top-full fade-in duration-500 bg-white/95 backdrop-blur-2xl px-6 py-3 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100/50 flex items-center gap-3 text-center">
            <div className={`w-2 h-2 rounded-full shrink-0 ${toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-rose-500' : toast.type === 'warning' ? 'bg-amber-500' : 'bg-indigo-500'}`}></div>
            <p className="text-[11px] font-bold text-midnight tracking-tight flex-1 lowercase">{toast.title}: <span className="font-medium text-slate-500">{toast.message}</span></p>
          </div>
        ))}
      </div>
    </Layout>
  );
};