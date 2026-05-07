
export type Companion = {
    name: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  avatar?: string;
  role: 'employee' | 'manager' | 'admin';
  baseSalary?: number;
  workStartTime?: string;
  workEndTime?: string;
  lateGraceMinutes?: number;
  monthlyLeaveCap?: number;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
};

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'half-day'
  | 'absent'
  | 'leave'
  | 'holiday';

export type Attendance = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  punchIn: any;
  punchOut?: any;
  workStartTime: string;
  workEndTime: string;
  lateGraceMinutes: number;
  punchInLate: boolean;
  punchOutEarly: boolean;
  autoLoggedOut: boolean;
  workMinutes?: number;
  status: AttendanceStatus;
  notes?: string;
  createdAt: any;
  updatedAt: any;
};

export type LeaveType = 'casual' | 'sick' | 'earned' | 'lop';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export type Leave = {
  id: string;
  userId: string;
  userName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  approvedBy?: string;
  approvedAt?: any;
  rejectedBy?: string;
  rejectedAt?: any;
  rejectionReason?: string;
  createdAt: any;
  updatedAt: any;
};

export type Holiday = {
  id: string;
  date: string;
  name: string;
  createdAt: any;
  createdBy: string;
};

export type RequiredDocument = {
  name: string;
  status: 'pending' | 'uploaded' | 'verified' | 'received';
};

export type VisaHistoryItem = {
  country: string;
  status: 'approved' | 'rejected';
  date: string;
  rejectionReason?: string;
};

export type PreviousTrip = {
  country: string;
  startDate: string;
  endDate: string;
};

export type Client = {
  id:string;
  name: string;
  email?: string;
  phone: string;
  avatar: string;
  preferences: string;
  status: 'active' | 'inactive' | 'lead' | 'prospect';
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  nationality?: string;
  preferredDestination?: string;
  travelPurpose?: string;
  preferredTravelDates?: { from?: string; to?: string };
  budget?: number;
  hotelPreference?: string;
  services?: 'visa' | 'fullPackage' | 'packageOnly';
  additionalServices?: ('travelInsurance' | 'airportPickup' | 'localTours')[];
  assignedEmployee?: string;
  visaStatus?: 'toStart' | 'inProcess' | 'applied' | 'approved' | 'rejected' | 'completed' | 'travelling';
  visaHistory?: VisaHistoryItem[];
  previousTrips?: PreviousTrip[];
  requiredDocuments?: RequiredDocument[];
  followUpDate?: string;
  pax?: number;
  companions?: Companion[];
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type Lead = {
  id: string;
  name: string;
  email?: string;
  phone: string;
  avatar: string;
  status: 'new' | 'contacted' | 'proposal' | 'won' | 'lost';
  source?: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type Booking = {
  id: string;
  clientId: string;
  clientName: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  progress: number; // 0-100
  itineraryType?: string;
  total: number;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type Invoice = {
  id: string;
  bookingId: string;
  clientName: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'unpaid' | 'overdue';
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type CustomerLog = {
  id: string;
  clientId: string;
  clientName?: string;
  userName?: string;
  activity: string;
  userId: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type FollowUp = {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  date: string;
  notes: string | null;
  done: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};
